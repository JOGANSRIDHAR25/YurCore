import "server-only";

import { PrescriptionRepository, type PrescriptionView } from "../repo/prescription.repo";
import { AuthUser } from "@/shared/auth/auth.types";
import { resolveActingPractitionerUserId } from "@/shared/auth/resolve-practitioner-context";
import { ForbiddenError, AppError } from "@/shared/api/api-error";

export class PrescriptionService {
  static async getPrescriptions(authUser: AuthUser): Promise<PrescriptionView[]> {
    if (authUser.role === "patient") {
      const patientId = await PrescriptionRepository.getPatientIdFromUserId(authUser.id);
      if (!patientId) return [];
      return PrescriptionRepository.getPrescriptionsForPatient(patientId);
    }

    if (
      authUser.role === "doctor" ||
      (authUser.role as string) === "practitioner" ||
      authUser.role === "assistant"
    ) {
      const practitionerId = await PrescriptionRepository.getPractitionerIdFromUserId(
        await resolveActingPractitionerUserId(authUser)
      );
      if (!practitionerId) return [];
      return PrescriptionRepository.getPrescriptionsForPractitioner(practitionerId);
    }

    return [];
  }

  static async deletePrescription(authUser: AuthUser, prescriptionId: string): Promise<{ patientId: string }> {
    const prescription = await PrescriptionRepository.getPrescriptionOwner(prescriptionId);
    if (!prescription) {
      throw new AppError("Prescription not found", 404);
    }

    if (authUser.role !== "admin" && authUser.role !== "super_admin") {
      const practitionerId = await PrescriptionRepository.getPractitionerIdFromUserId(
        await resolveActingPractitionerUserId(authUser)
      );
      if (!practitionerId || prescription.practitioner_id !== practitionerId) {
        throw new ForbiddenError("You are not authorized to delete this prescription");
      }
    }

    await PrescriptionRepository.delete(prescriptionId);
    return { patientId: prescription.patient_id };
  }
}