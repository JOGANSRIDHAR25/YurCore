import "server-only";

import { ConsentRepository, type ConsentView } from "../repo/consent.repo";
import { AuthUser } from "@/shared/auth/auth.types";
import { ForbiddenError, AppError } from "@/shared/api/api-error";

export class ConsentService {
  static async getConsentGrants(authUser: AuthUser): Promise<ConsentView[]> {
    if (authUser.role !== "patient") {
      return [];
    }

    const patientId = await ConsentRepository.getPatientIdFromUserId(authUser.id);
    if (!patientId) return [];

    return ConsentRepository.getGrantsForPatient(patientId);
  }

  static async revokeConsent(authUser: AuthUser, consentId: string): Promise<void> {
    const grant = await ConsentRepository.getGrantById(consentId);
    if (!grant) {
      throw new AppError("Consent grant not found", 404);
    }

    if (authUser.role !== "admin" && authUser.role !== "super_admin") {
      const patientId = await ConsentRepository.getPatientIdFromUserId(authUser.id);
      if (!patientId || grant.patient_id !== patientId) {
        throw new ForbiddenError("You are not authorized to revoke this consent");
      }
    }

    await ConsentRepository.revoke(consentId);
  }
}
