import "server-only";

import { RegistryRepository } from "../repo/registry.repo";
import { FamilyRepository } from "../repo/family.repo";
import { AuthUser } from "@/shared/auth/auth.types";
import { resolveActingPractitionerUserId } from "@/shared/auth/resolve-practitioner-context";

export class RegistryService {
  static async getMyPatients(authUser: AuthUser): Promise<any[]> {
    if (
      authUser.role !== "doctor" &&
      (authUser.role as string) !== "practitioner" &&
      authUser.role !== "assistant"
    ) {
      return [];
    }
    return RegistryRepository.getPatientsForPractitioner(await resolveActingPractitionerUserId(authUser));
  }

  static async getPatientFamily(authUser: AuthUser, ownerPatientId: string): Promise<any[]> {
    if (
      authUser.role !== "doctor" &&
      (authUser.role as string) !== "practitioner" &&
      authUser.role !== "assistant"
    ) {
      return [];
    }
    const members = await FamilyRepository.getFamilyMembers(ownerPatientId);
    return (members ?? []).map((m: any) => {
      let age = 0;
      if (m.date_of_birth) {
        age = new Date().getFullYear() - new Date(m.date_of_birth).getFullYear();
      }
      return {
        id: m.id,
        patientId: m.patient_id,
        name: m.full_name,
        relationship: m.relationship,
        age,
        gender: m.gender || "Unknown",
      };
    });
  }
}