import "server-only";

import { OnboardingRepository, type SaveDoctorProfileInput, type SavePatientProfileInput } from "../repo/onboarding.repo";
import { AuthUser } from "@/shared/auth/auth.types";
import { ForbiddenError } from "@/shared/api/api-error";
import { resolveActiveFeeRupees } from "@/lib/fee";

function assertAdmin(authUser: AuthUser): void {
  if (authUser.role !== "admin" && authUser.role !== "super_admin") {
    throw new ForbiddenError("Admin access required");
  }
}

function getMissingRequiredProfileFields(doctor: any): string[] {
  const missing: string[] = [];
  if (!doctor) return ["profile"];
  if (!doctor.full_name?.trim()) missing.push("full name");
  if (!doctor.user?.mobile) missing.push("phone number");
  if (!(doctor.qualifications?.length > 0)) missing.push("qualifications");
  if (!(doctor.specializations?.length > 0)) missing.push("specialty");
  if (!(doctor.languages?.length > 0)) missing.push("languages");
  if (!(resolveActiveFeeRupees(doctor.base_video_fee, doctor.base_clinic_fee) > 0)) missing.push("consultation fee");
  if (!doctor.degree_url || !doctor.registration_cert_url) missing.push("verification documents");
  if (!doctor.signature_url) missing.push("signature");
  return missing;
}

export class OnboardingService {
  static async getDoctorProfile(userId: string) {
    return OnboardingRepository.getDoctorProfileByUserId(userId);
  }

  static async saveDoctorProfile(input: SaveDoctorProfileInput): Promise<string> {
    if (!input.fullName?.trim()) throw new Error("Full name is required");
    return OnboardingRepository.saveDoctorProfileAndVerification(input);
  }

  static async getPatientProfile(userId: string) {
    return OnboardingRepository.getPatientProfileByUserId(userId);
  }

  static async savePatientProfile(input: SavePatientProfileInput): Promise<string> {
    if (!input.fullName?.trim()) throw new Error("Full name is required");
    return OnboardingRepository.savePatientProfile(input);
  }

  static async getVerificationQueue(authUser: AuthUser) {
    assertAdmin(authUser);
    return OnboardingRepository.getVerificationQueue();
  }

  static async verifyDoctor(
    authUser: AuthUser,
    verificationId: string,
    doctorId: string,
    status: "verified" | "rejected",
    reason?: string
  ): Promise<void> {
    assertAdmin(authUser);
    if (!verificationId || !doctorId) throw new Error("Verification ID and doctor ID are required");
    if (status === "rejected" && !reason?.trim()) throw new Error("A rejection reason is required");

    if (status === "verified") {
      const doctor = await OnboardingRepository.getDoctorRowForVerification(doctorId);
      const missing = getMissingRequiredProfileFields(doctor);
      if (missing.length > 0) {
        throw new Error(`Cannot approve: profile is incomplete (missing: ${missing.join(", ")})`);
      }
    }

    await OnboardingRepository.verifyDoctor(verificationId, doctorId, status, authUser.id, reason);
  }
}