import { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/shared/api/api-error";

export type ProfileEntity = {
  id: string;
  name: string;
  email: string;
  phone: string;
  dob: string;
  age: number;
  gender: string;
  bloodGroup?: string;
  city: string;
  pinCode: string;
  prakriti: string;
  wellnessGoals: string[];
  abhaId: string | null;
  abhaAddress: string | null;
  address?: string;
  avatarUrl?: string | null;
  signatureUrl?: string | null;
  linkedDoctorName?: string | null;
  experience?: number | null;
  clinicName?: string | null;
  clinicAddress?: string | null;
  state?: string | null;
};

export type UpdateProfileFields = {
  fullName?: string;
  dob?: string;
  gender?: string;
  bloodGroup?: string;
  city?: string;
  pinCode?: string;
  email?: string;
  phone?: string;
  prakriti?: string;
  avatarUrl?: string;
  signatureUrl?: string;
  state?: string;
  clinicName?: string;
  clinicAddress?: string;
  experienceYears?: number;
};

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

function isAssistantRole(role?: string): boolean {
  return normalizeRole(role) === "assistant";
}

function calculateAge(dateOfBirth?: string | null): number {
  if (!dateOfBirth) return 0;

  const dob = new Date(dateOfBirth);

  if (Number.isNaN(dob.getTime())) return 0;

  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();

  const birthdayNotReached =
    today.getMonth() < dob.getMonth() ||
    (today.getMonth() === dob.getMonth() &&
      today.getDate() < dob.getDate());

  if (birthdayNotReached) age--;

  return Math.max(age, 0);
}

export class ProfileRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async getProfileByUserId(
    userId: string,
    role?: string
  ): Promise<ProfileEntity | null> {
    const normalized = normalizeRole(role);
    if (normalized === "admin" || normalized === "super_admin") {
      return this.getAdminProfile(userId);
    }

    if (isAssistantRole(role)) {
      return this.getAssistantProfile(userId);
    }

    if (isPractitionerRole(role)) {
      return this.getPractitionerProfile(userId);
    }

    return this.getPatientProfile(userId);
  }

  private async getAssistantProfile(userId: string): Promise<ProfileEntity | null> {
    const baseSelect = `
        id,
        full_name,
        avatar_url,
        practitioner:practitioners ( full_name ),
        user:users ( id, mobile, email )
      `;
    // date_of_birth/gender/blood_group are a recent addition to the assistants
    // table — fall back to the base select if they haven't been migrated yet.
    let { data: assistant, error } = await this.supabase
      .from("assistants")
      .select(`${baseSelect}, date_of_birth, gender, blood_group`)
      .eq("user_id", userId)
      .maybeSingle();

    if (error?.message?.includes("date_of_birth") || error?.message?.includes("blood_group")) {
      ({ data: assistant, error } = await this.supabase
        .from("assistants")
        .select(baseSelect)
        .eq("user_id", userId)
        .maybeSingle());
    }

    if (error) {
      console.error("Assistant profile query failed:", {
        userId,
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });

      throw new AppError(
        `Database error while fetching assistant profile: ${error.message}`,
        500
      );
    }

    if (!assistant) return null;

    const user = Array.isArray(assistant.user) ? assistant.user[0] : assistant.user;
    const practitioner = Array.isArray(assistant.practitioner)
      ? assistant.practitioner[0]
      : assistant.practitioner;

    return {
      id: assistant.id,
      name: assistant.full_name ?? "",
      email: (user as { email?: string } | null)?.email ?? "",
      phone: (user as { mobile?: string } | null)?.mobile ?? "",
      dob: (assistant as { date_of_birth?: string }).date_of_birth ?? "",
      age: calculateAge((assistant as { date_of_birth?: string }).date_of_birth),
      gender: (assistant as { gender?: string }).gender ?? "",
      bloodGroup: (assistant as { blood_group?: string }).blood_group ?? "",
      city: "",
      pinCode: "",
      prakriti: "Unknown",
      wellnessGoals: [],
      abhaId: null,
      abhaAddress: null,
      address: "",
      avatarUrl: assistant.avatar_url ?? null,
      linkedDoctorName: (practitioner as { full_name?: string } | null)?.full_name ?? null,
    };
  }

  private async getAdminProfile(userId: string): Promise<ProfileEntity | null> {
    const { data: user, error } = await this.supabase
      .from("users")
      .select("id, mobile, email")
      .eq("id", userId)
      .maybeSingle();

    if (error || !user) return null;

    return {
      id: user.id,
      name: "", // handled by JWT meta_data in the frontend
      email: user.email ?? "",
      phone: user.mobile ?? "",
      dob: "",
      age: 0,
      gender: "",
      city: "",
      pinCode: "",
      prakriti: "Unknown",
      wellnessGoals: [],
      abhaId: null,
      abhaAddress: null,
      address: "",
    };
  }

  private async getPractitionerProfile(
    userId: string
  ): Promise<ProfileEntity | null> {
    const { data: practitioner, error } = await this.supabase
      .from("practitioners")
      .select(`
        id,
        full_name,
        date_of_birth,
        gender,
        blood_group,
        signature_url,
        state,
        city,
        clinic_hospital_name,
        clinic_hospital_address,
        experience_years,
        user:users (
          id,
          mobile,
          email
        )
      `)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("Practitioner profile query failed:", {
        userId,
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });

      throw new AppError(
        `Database error while fetching practitioner profile: ${error.message}`,
        500
      );
    }

    if (!practitioner) {
      console.error("Practitioner row not found:", { userId });
      return null;
    }

    const user = Array.isArray(practitioner.user)
      ? practitioner.user[0]
      : practitioner.user;

    const signatureUrl = await this.resolveDoctorDocumentUrl(
      (practitioner as { signature_url?: string | null }).signature_url
    );

    return {
      id: practitioner.id,
      name: practitioner.full_name ?? "",
      email: (user as { email?: string } | null)?.email ?? "",
      phone: (user as { mobile?: string } | null)?.mobile ?? "",
      dob: practitioner.date_of_birth ?? "",
      age: calculateAge(practitioner.date_of_birth),
      gender: practitioner.gender ?? "",
      bloodGroup: practitioner.blood_group ?? "",
      city: practitioner.city ?? "",
      pinCode: "",
      prakriti: "Unknown",
      wellnessGoals: [],
      abhaId: null,
      abhaAddress: null,
      address: "",
      signatureUrl,
      state: practitioner.state ?? "",
      clinicName: practitioner.clinic_hospital_name ?? "",
      clinicAddress: practitioner.clinic_hospital_address ?? "",
      experience: practitioner.experience_years ?? null,
    };
  }

  /**
   * "doctor-documents" is a private bucket — stored paths (e.g.
   * "doctor-documents/xyz/signature_123.png") need a signed URL before a
   * browser or a server-rendered PDF can load them.
   */
  private async resolveDoctorDocumentUrl(storedPath?: string | null): Promise<string | null> {
    if (!storedPath) return null;
    const cleanPath = storedPath.replace(/^doctor-documents\//, "");
    const { data, error } = await this.supabase.storage
      .from("doctor-documents")
      .createSignedUrl(cleanPath, 3600);
    if (error) {
      console.error("Failed to sign doctor document URL:", error.message);
      return null;
    }
    return data?.signedUrl ?? null;
  }

  private async getPatientProfile(
    userId: string
  ): Promise<ProfileEntity | null> {
    const { data: patient, error } = await this.supabase
      .from("patients")
      .select(`
        id,
        full_name,
        date_of_birth,
        gender,
        blood_group,
        city,
        pin_code,
        prakriti,
        wellness_goals,
        address,
        user:users (
          id,
          mobile,
          email,
          abha:abha_links (
            abha_id,
            abha_address
          )
        )
      `)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("Patient profile query failed:", {
        userId,
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });

      throw new AppError(
        `Database error while fetching patient profile: ${error.message}`,
        500
      );
    }

    if (!patient) return null;

    const user = Array.isArray(patient.user)
      ? patient.user[0]
      : patient.user;

    const abhaRelation = (
      user as {
        abha?: Array<{
          abha_id?: string;
          abha_address?: string;
        }> | {
          abha_id?: string;
          abha_address?: string;
        };
      } | null
    )?.abha;

    const abha = Array.isArray(abhaRelation)
      ? abhaRelation[0]
      : abhaRelation;

    return {
      id: patient.id,
      name: patient.full_name ?? "",
      email: (user as { email?: string } | null)?.email ?? "",
      phone: (user as { mobile?: string } | null)?.mobile ?? "",
      dob: patient.date_of_birth ?? "",
      age: calculateAge(patient.date_of_birth),
      gender: patient.gender ?? "",
      bloodGroup: patient.blood_group ?? "",
      city: patient.city ?? "",
      pinCode: patient.pin_code ?? "",
      prakriti: patient.prakriti ?? "Unknown",
      wellnessGoals: patient.wellness_goals ?? [],
      abhaId: abha?.abha_id ?? null,
      abhaAddress: abha?.abha_address ?? null,
      address: patient.address ?? "",
    };
  }

  async updateProfile(
    userId: string,
    updates: UpdateProfileFields,
    role?: string
  ): Promise<void> {
    const normalized = normalizeRole(role);
    const isAdmin = normalized === "admin" || normalized === "super_admin";

    if (isAssistantRole(role)) {
      const assistantUpdates: Record<string, unknown> = {};

      if (updates.fullName !== undefined) {
        assistantUpdates.full_name = updates.fullName.trim();
      }
      if (updates.avatarUrl !== undefined) {
        assistantUpdates.avatar_url = updates.avatarUrl || null;
      }
      if (updates.dob !== undefined) {
        assistantUpdates.date_of_birth = updates.dob || null;
      }
      if (updates.gender !== undefined) {
        assistantUpdates.gender = updates.gender ? updates.gender.trim().toLowerCase() : null;
      }
      if (updates.bloodGroup !== undefined) {
        assistantUpdates.blood_group = updates.bloodGroup || null;
      }

      if (Object.keys(assistantUpdates).length > 0) {
        let { error } = await this.supabase
          .from("assistants")
          .update(assistantUpdates)
          .eq("user_id", userId);

        // date_of_birth/gender/blood_group are a recent addition — if the
        // migration hasn't run yet, retry with just the columns that exist.
        if (error?.message?.includes("date_of_birth") || error?.message?.includes("blood_group")) {
          const { date_of_birth, gender, blood_group, ...fallback } = assistantUpdates;
          if (Object.keys(fallback).length > 0) {
            ({ error } = await this.supabase.from("assistants").update(fallback).eq("user_id", userId));
          } else {
            error = null;
          }
        }

        if (error) {
          console.error("Assistant profile update failed:", {
            userId,
            message: error.message,
            code: error.code,
          });
          throw new AppError("Database error while updating assistant profile", 500);
        }
      }
    } else if (!isAdmin) {
      const practitioner = isPractitionerRole(role);

      const tableName = practitioner
        ? "practitioners"
        : "patients";

      const tableUpdates: Record<string, unknown> = {};

      // Use !== undefined so empty or null-like values can be handled properly.
      if (updates.fullName !== undefined) {
        tableUpdates.full_name = updates.fullName.trim();
      }

      if (updates.dob !== undefined) {
        tableUpdates.date_of_birth = updates.dob || null;
      }

      if (updates.gender !== undefined) {
        tableUpdates.gender = updates.gender
          ? updates.gender.trim().toLowerCase()
          : null;
      }

      if (updates.bloodGroup !== undefined) {
        tableUpdates.blood_group = updates.bloodGroup || null;
      }

      if (practitioner && updates.signatureUrl !== undefined) {
        tableUpdates.signature_url = updates.signatureUrl || null;
      }

      if (!practitioner) {
        if (updates.city !== undefined) {
          tableUpdates.city = updates.city || null;
        }

        if (updates.pinCode !== undefined) {
          tableUpdates.pin_code = updates.pinCode || null;
        }

        if (updates.prakriti !== undefined) {
          tableUpdates.prakriti = updates.prakriti || null;
        }
      } else {
        if (updates.state !== undefined) {
          tableUpdates.state = updates.state || null;
        }

        if (updates.city !== undefined) {
          tableUpdates.city = updates.city || null;
        }

        if (updates.clinicName !== undefined) {
          tableUpdates.clinic_hospital_name = updates.clinicName || null;
        }

        if (updates.clinicAddress !== undefined) {
          tableUpdates.clinic_hospital_address = updates.clinicAddress || null;
        }

        if (updates.experienceYears !== undefined) {
          tableUpdates.experience_years = updates.experienceYears;
        }
      }

      if (Object.keys(tableUpdates).length > 0) {
        const { data, error } = await this.supabase
          .from(tableName)
          .update(tableUpdates)
          .eq("user_id", userId)
          .select("id")
          .maybeSingle();

      if (error) {
        console.error("Profile update failed:", {
          tableName,
          userId,
          role,
          tableUpdates,
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
        });

        if (error.code === "23505") {
          throw new AppError("Profile details conflict with existing record", 400);
        }

        throw new AppError(
          `Database error while updating profile in ${tableName}`,
          500
        );
      }

      if (!data) {
        const upsertData = practitioner 
          ? { user_id: userId, ...tableUpdates }
          : { 
              user_id: userId, 
              date_of_birth: '1970-01-01', 
              gender: 'other',
              ...tableUpdates 
            };

        // Fallback: upsert profile row if it doesn't exist yet for this user
        const { error: upsertErr } = await this.supabase
          .from(tableName)
          .upsert(upsertData, { onConflict: "user_id" });

        if (upsertErr) {
          console.error("Profile upsert failed:", {
            tableName,
            userId,
            message: upsertErr.message,
          });
          throw new AppError(
            practitioner
              ? "Practitioner profile not found"
              : "Patient profile not found",
            404
          );
        }
      }
    }
    }

    const userUpdates: Record<string, unknown> = {};

    if (updates.email !== undefined && updates.email.trim() !== "") {
      userUpdates.email = updates.email.trim().toLowerCase();
    }

    if (updates.phone !== undefined && updates.phone.trim() !== "") {
      userUpdates.mobile = updates.phone.trim();
    }

    if (Object.keys(userUpdates).length > 0) {
      // Fetch current user details to skip redundant updates and avoid false constraint violations
      const { data: currentUser } = await this.supabase
        .from("users")
        .select("email, mobile")
        .eq("id", userId)
        .maybeSingle();

      if (currentUser) {
        if (userUpdates.email && userUpdates.email === currentUser.email) {
          delete userUpdates.email;
        }
        if (userUpdates.mobile && userUpdates.mobile === currentUser.mobile) {
          delete userUpdates.mobile;
        }
      }

      if (Object.keys(userUpdates).length > 0) {
        const { data, error } = await this.supabase
          .from("users")
          .update(userUpdates)
          .eq("id", userId)
          .select("id")
          .maybeSingle();

        if (error) {
          console.error("User details update failed:", {
            userId,
            userUpdates,
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
          });

          if (error.code === "23505") {
            const isMobile = error.message?.includes("users_mobile_key") || error.details?.includes("mobile");
            const isEmail = error.message?.includes("users_email_key") || error.details?.includes("email");
            const field = isMobile ? "Phone number" : isEmail ? "Email address" : "Account details";
            throw new AppError(`${field} is already registered by another account`, 400);
          }

          throw new AppError(
            "Database error while updating profile user details",
            500
          );
        }

        if (!data) {
          throw new AppError("User record not found", 404);
        }
      }
    }
  }
}