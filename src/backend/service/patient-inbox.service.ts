import "server-only";

import { PatientInboxRepository, type PatientInboxThread } from "../repo/patient-inbox.repo";
import { AuthUser } from "@/shared/auth/auth.types";

export class PatientInboxService {
  static async getInbox(authUser: AuthUser): Promise<PatientInboxThread[]> {
    if (authUser.role !== "patient") {
      return [];
    }

    const patientId = await PatientInboxRepository.getPatientIdFromUserId(authUser.id);
    if (!patientId) return [];

    return PatientInboxRepository.getInboxForPatient(patientId);
  }
}
