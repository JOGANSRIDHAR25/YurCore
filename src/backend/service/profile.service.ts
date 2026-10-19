
import { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  ProfileRepository,
  type ProfileEntity,
} from "../repo/profile.repo";
import { AuthUser } from "@/shared/auth/auth.types";
import {
  ForbiddenError,
  AppError,
} from "@/shared/api/api-error";

export const updateProfileSchema = z.object({
  fullName: z.string().trim().min(2).optional(),
  email: z.string().trim().email().optional(),
  phone: z.string().trim().optional(),
  dob: z.string().optional(),
  gender: z.string().trim().optional(),
  bloodGroup: z.string().trim().optional(),
  city: z.string().trim().optional(),
  pinCode: z.string().trim().optional(),
  prakriti: z.string().trim().optional(),
  avatarUrl: z.string().trim().optional(),
  signatureUrl: z.string().trim().optional(),
  state: z.string().trim().optional(),
  clinicName: z.string().trim().optional(),
  clinicAddress: z.string().trim().optional(),
  experienceYears: z.number().optional(),
});

export type UpdateProfileInput = z.infer<
  typeof updateProfileSchema
>;

export type ProfileResponse = ProfileEntity;

function normalizeRole(role?: string): string {
  return role?.trim().toLowerCase() ?? "";
}

function isPractitionerRole(role?: string): boolean {
  const normalizedRole = normalizeRole(role);

  return (
    normalizedRole === "doctor" ||
    normalizedRole === "practitioner"
  );
}

function canReadProfile(
  authUser: AuthUser,
  targetUserId: string
): boolean {
  const role = normalizeRole(authUser.role);

  if (role === "admin") return true;
  if (authUser.id === targetUserId) return true;
  if (isPractitionerRole(role)) return true;

  return false;
}

function canUpdateProfile(
  authUser: AuthUser,
  targetUserId: string
): boolean {
  const role = normalizeRole(authUser.role);

  if (role === "admin") return true;
  if (authUser.id === targetUserId) return true;

  return false;
}

export class ProfileService {
  private readonly repository: ProfileRepository;

  constructor(supabase: SupabaseClient) {
    this.repository = new ProfileRepository(supabase);
  }

  async getProfile(
    authUser: AuthUser,
    targetUserId?: string
  ): Promise<ProfileResponse> {
    const userIdToFetch = targetUserId ?? authUser.id;

    if (!canReadProfile(authUser, userIdToFetch)) {
      throw new ForbiddenError(
        "Cannot access this profile."
      );
    }

    console.log("Fetching profile:", {
      authenticatedUserId: authUser.id,
      targetUserId: userIdToFetch,
      role: authUser.role,
    });

    const profile =
      await this.repository.getProfileByUserId(
        userIdToFetch,
        authUser.role
      );

    if (!profile) {
      throw new AppError(
        isPractitionerRole(authUser.role)
          ? "Practitioner profile not found"
          : "Patient profile not found",
        404
      );
    }

    return profile;
  }

  async updateProfile(
    authUser: AuthUser,
    updates: UpdateProfileInput,
    targetUserId?: string
  ): Promise<ProfileResponse> {
    const userIdToUpdate = targetUserId ?? authUser.id;

    if (!canUpdateProfile(authUser, userIdToUpdate)) {
      throw new ForbiddenError(
        "Cannot update this profile."
      );
    }

    console.log("Updating profile:", {
      authenticatedUserId: authUser.id,
      targetUserId: userIdToUpdate,
      role: authUser.role,
      updateFields: Object.keys(updates),
    });

    await this.repository.updateProfile(
      userIdToUpdate,
      updates,
      authUser.role
    );

    const profile =
      await this.repository.getProfileByUserId(
        userIdToUpdate,
        authUser.role
      );

    if (!profile) {
      throw new AppError(
        isPractitionerRole(authUser.role)
          ? "Practitioner profile not found after update"
          : "Patient profile not found after update",
        404
      );
    }

    return profile;
  }
}