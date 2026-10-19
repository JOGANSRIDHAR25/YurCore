
import { FamilyRepository } from "../repo/family.repo";
import { AppointmentsRepository } from "../repo/appointments.repo";
import { AuthUser } from "@/shared/auth/auth.types";
import { AppError } from "@/shared/api/api-error";

function normalizeGender(gender: string): string {
  const g = gender.trim().toLowerCase().replace(/\s+/g, "_");
  if (g === "male" || g === "female" || g === "other" || g === "prefer_not_to_say") return g;
  return "other";
}

export class FamilyService {
  static async getFamilyMembers(authUser: AuthUser) {
    const patientId = await AppointmentsRepository.getPatientIdFromUserId(authUser.id);
    if (!patientId) throw new AppError("Patient not found", 404);

    const data = await FamilyRepository.getFamilyMembers(patientId);

    return (data ?? []).map((row: any) => {
      let age = 0;
      if (row.date_of_birth) {
        age = new Date().getFullYear() - new Date(row.date_of_birth).getFullYear();
      }
      return {
        id: row.id,
        patientId: row.patient_id ?? null,
        name: row.full_name ?? "",
        relationship: row.relationship ?? "other",
        dob: row.date_of_birth ?? "",
        age,
        gender: row.gender ?? "",
        abhaId: row.abha_id,
        phone: row.phone ?? "",
        bloodGroup: row.blood_group ?? "",
        height: row.height ?? null,
        weight: row.weight ?? null,
      };
    });
  }

  static async addFamilyMember(authUser: AuthUser, member: { fullName: string; relationship: string; dob: string; gender: string; phone?: string; bloodGroup?: string; height?: number; weight?: number; }) {
    const patientId = await AppointmentsRepository.getPatientIdFromUserId(authUser.id);
    if (!patientId) throw new AppError("Patient not found", 404);

    await FamilyRepository.addFamilyMember(patientId, {
      ...member,
      gender: normalizeGender(member.gender),
      relationship: member.relationship.trim().toLowerCase(),
    });
    return { success: true };
  }

  static async updateFamilyMember(authUser: AuthUser, id: string, member: { fullName: string; relationship: string; dob: string; gender: string; phone?: string; bloodGroup?: string; height?: number; weight?: number; }) {
    const ownerPatientId = await AppointmentsRepository.getPatientIdFromUserId(authUser.id);
    if (!ownerPatientId) throw new AppError("Patient not found", 404);

    const memberPatientId = await FamilyRepository.getFamilyMemberPatientId(id, ownerPatientId);
    if (!memberPatientId) throw new AppError("Family member not found", 404);

    await FamilyRepository.updateFamilyMember(id, {
      ...member,
      gender: normalizeGender(member.gender),
      relationship: member.relationship.trim().toLowerCase(),
    });
    return { success: true };
  }

  static async deleteFamilyMember(authUser: AuthUser, id: string) {
    const ownerPatientId = await AppointmentsRepository.getPatientIdFromUserId(authUser.id);
    if (!ownerPatientId) throw new AppError("Patient not found", 404);

    const memberPatientId = await FamilyRepository.getFamilyMemberPatientId(id, ownerPatientId);
    if (!memberPatientId) throw new AppError("Family member not found", 404);

    await FamilyRepository.deleteFamilyMember(id);
    return { success: true };
  }
}