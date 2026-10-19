import "server-only";

import { ConsultationRepository, type SaveCompleteConsultationInput } from "../repo/consultation.repo";
import { FamilyRepository } from "../repo/family.repo";
import { DiscoverRepository } from "../repo/discover.repo";
import { AppointmentsRepository } from "../repo/appointments.repo";
import { AuthUser } from "@/shared/auth/auth.types";
import { resolveActingPractitionerUserId } from "@/shared/auth/resolve-practitioner-context";
import { ForbiddenError, AppError } from "@/shared/api/api-error";
import { sendPostConsultationEmails } from "./consultation-email.helper";

export class ConsultationService {
  static async getDetailedConsultations(authUser: AuthUser, familyMemberId?: string | null): Promise<any[]> {
    if (authUser.role !== "patient") return [];

    const ownerPatientId = await ConsultationRepository.getPatientIdFromUserId(authUser.id);
    if (!ownerPatientId) return [];

    if (!familyMemberId) {
      return ConsultationRepository.getDetailedConsultationsForPatient(ownerPatientId);
    }

    const familyMemberPatientId = await FamilyRepository.getFamilyMemberPatientId(familyMemberId, ownerPatientId);
    if (!familyMemberPatientId) return [];

    return ConsultationRepository.getDetailedConsultationsForPatient(familyMemberPatientId);
  }

  /** Consultation and prescription totals for the account owner plus their family members. */
  static async getPatientRecordStats(authUser: AuthUser): Promise<{ consultations: number; prescriptions: number }> {
    if (authUser.role !== "patient") return { consultations: 0, prescriptions: 0 };

    const ownerPatientId = await ConsultationRepository.getPatientIdFromUserId(authUser.id);
    if (!ownerPatientId) return { consultations: 0, prescriptions: 0 };

    const familyPatientIds = await FamilyRepository.getActiveFamilyPatientIds(ownerPatientId);
    return ConsultationRepository.getRecordCountsForPatients([ownerPatientId, ...familyPatientIds]);
  }

  static async getConsultationReportData(authUser: AuthUser, consultationId: string): Promise<any> {
    const owner = await ConsultationRepository.getConsultationOwner(consultationId);
    if (!owner) {
      throw new AppError("Consultation not found", 404);
    }

    if (authUser.role !== "admin" && authUser.role !== "super_admin") {
      let authorized = false;

      if (authUser.role === "patient") {
        // The account owner may open their own reports and those of their
        // active family members (who have no login and are managed by them).
        const patientId = await ConsultationRepository.getPatientIdFromUserId(authUser.id);
        authorized =
          !!patientId &&
          (owner.patient_id === patientId ||
            (await AppointmentsRepository.isOwnOrFamilyPatient(patientId, owner.patient_id)));
      } else if (
        authUser.role === "doctor" ||
        (authUser.role as string) === "practitioner" ||
        authUser.role === "assistant"
      ) {
        const practitionerId = await ConsultationRepository.getPractitionerIdFromUserId(
          await resolveActingPractitionerUserId(authUser)
        );
        authorized = !!practitionerId && owner.practitioner_id === practitionerId;
      }

      if (!authorized) {
        throw new ForbiddenError("You are not authorized to view this consultation report");
      }
    }

    const report = await ConsultationRepository.getConsultationReportData(consultationId);
    if (!report) {
      throw new AppError("Consultation report not found", 404);
    }

    // signature_url is a path into the private "doctor-documents" bucket —
    // resolve it to a signed URL so the PDF renderer can actually load it.
    const practitioner = report.practitioners as any;
    if (practitioner?.signature_url) {
      practitioner.signature_url = await DiscoverRepository.getDoctorSignedUrl(practitioner.signature_url);
    }

    return report;
  }

  /** Consultation report data enriched with the doctor fee, for invoice generation. Invoice is consultation-fee only — no medicine line items. */
  static async getConsultationInvoiceData(authUser: AuthUser, consultationId: string): Promise<any> {
    const report = await this.getConsultationReportData(authUser, consultationId);

    // Use the fee for the mode this consultation actually happened in — a clinic visit is
    // billed at the practitioner's clinic fee, not their (possibly unset) video fee.
    const practitionerFees = report.practitioners as any;
    const doctorFeePaise =
      report.mode === "video"
        ? practitionerFees?.base_video_fee ?? 0
        : (practitionerFees?.base_clinic_fee || practitionerFees?.base_video_fee) ?? 0;

    const totalPaise = doctorFeePaise;

    const emrNote = Array.isArray(report.emr_notes) ? report.emr_notes[0] : report.emr_notes;
    let paymentMethod: "cash" | "online" | null = null;
    if (emrNote?.assessment) {
      try {
        const parsed = JSON.parse(emrNote.assessment);
        if (parsed.paymentMethod === "cash" || parsed.paymentMethod === "online") {
          paymentMethod = parsed.paymentMethod;
        }
      } catch {
        // assessment wasn't JSON (older records) — leave paymentMethod unset
      }
    }

    return {
      ...report,
      invoice: {
        doctorFeePaise,
        totalPaise,
        paymentMethod,
      },
    };
  }

  static async saveCompleteConsultation(
    authUser: AuthUser,
    payload: Omit<SaveCompleteConsultationInput, "practitionerId">,
  ): Promise<{ consultationId: string; prescriptionId: string; patientId: string }> {
    if (
      authUser.role !== "doctor" &&
      (authUser.role as string) !== "practitioner" &&
      authUser.role !== "assistant"
    ) {
      throw new ForbiddenError("Only practitioners can record consultations");
    }
    if (!payload.patientId) {
      throw new Error("Patient ID is required");
    }
    if (!payload.vitals) {
      throw new Error("Vitals are required");
    }

    // practitionerId is always the authenticated practitioner (or their approved assistant), never client-supplied
    const result = await ConsultationRepository.saveCompleteConsultation({
      ...payload,
      noPrescription: payload.noPrescription === true,
      practitionerId: await resolveActingPractitionerUserId(authUser),
    });
    const { consultationId } = result;

    // Fire-and-forget: prescription/invoice emails must never fail the save.
    try {
      const invoiceData = await this.getConsultationInvoiceData(authUser, consultationId);
      const familyOwner = await ConsultationRepository.getFamilyOwnerEmailRecipient(result.patientId);
      await sendPostConsultationEmails(invoiceData, familyOwner);
    } catch (error) {
      console.error("[ConsultationService] Post-consultation email dispatch failed:", error);
    }

    return result;
  }

  static async getUpcomingCalls(authUser: AuthUser): Promise<any[]> {
    if (authUser.role === "patient") {
      return ConsultationRepository.getUpcomingCallsForPatient(authUser.id);
    }
    if (
      authUser.role === "doctor" ||
      (authUser.role as string) === "practitioner" ||
      authUser.role === "assistant"
    ) {
      return ConsultationRepository.getUpcomingCallsForPractitioner(
        await resolveActingPractitionerUserId(authUser)
      );
    }
    return [];
  }

  static async getPatientIntakeDetails(authUser: AuthUser, patientId: string, appointmentId?: string | null): Promise<any> {
    if (
      authUser.role !== "doctor" &&
      (authUser.role as string) !== "practitioner" &&
      authUser.role !== "assistant" &&
      authUser.role !== "admin" &&
      authUser.role !== "super_admin"
    ) {
      throw new ForbiddenError("Only practitioners can view patient intake details");
    }
    if (!patientId) {
      throw new Error("Patient ID is required");
    }
    return ConsultationRepository.getPatientIntakeDetails(patientId, appointmentId);
  }
}