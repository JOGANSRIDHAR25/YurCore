import "server-only";

import { EmailRepository } from "../repo/email.repo";
import {
  appointmentBookedTemplate,
  type AppointmentBookedTemplateInput,
} from "@/lib/email/templates/appointment-booked";
import {
  appointmentCancelledTemplate,
  type AppointmentCancelledTemplateInput,
} from "@/lib/email/templates/appointment-cancelled";
import {
  appointmentMissedTemplate,
  type AppointmentMissedTemplateInput,
} from "@/lib/email/templates/appointment-missed";
import {
  appointmentMissedPractitionerTemplate,
  type AppointmentMissedPractitionerTemplateInput,
} from "@/lib/email/templates/appointment-missed-practitioner";
import {
  appointmentCancelledByPractitionerTemplate,
  type AppointmentCancelledByPractitionerTemplateInput,
} from "@/lib/email/templates/appointment-cancelled-by-practitioner";
import {
  practitionerCancellationSummaryTemplate,
  type PractitionerCancellationSummaryInput,
} from "@/lib/email/templates/practitioner-cancellation-summary";
import { invoiceTemplate, type InvoiceTemplateInput } from "@/lib/email/templates/invoice";
import {
  prescriptionTemplate,
  type PrescriptionTemplateInput,
} from "@/lib/email/templates/prescription";

/**
 * Composes email templates and hands them to EmailRepository. Every method
 * swallows its own errors — a Gmail/SMTP hiccup must never fail the
 * booking/cancellation/consultation-save flow that triggered it.
 */
export class EmailService {
  static async sendAppointmentBooked(
    to: string,
    input: AppointmentBookedTemplateInput,
  ): Promise<void> {
    if (!to) return;
    try {
      const { subject, html, text } = appointmentBookedTemplate(input);
      await EmailRepository.sendEmail({ to, subject, html, text });
    } catch (error) {
      console.error("[EmailService] sendAppointmentBooked failed:", error);
    }
  }

  static async sendAppointmentCancelled(
    to: string,
    input: AppointmentCancelledTemplateInput,
  ): Promise<void> {
    if (!to) return;
    try {
      const { subject, html, text } = appointmentCancelledTemplate(input);
      await EmailRepository.sendEmail({ to, subject, html, text });
    } catch (error) {
      console.error("[EmailService] sendAppointmentCancelled failed:", error);
    }
  }

  /** Returns whether the email was handed off successfully (shown to the doctor). */
  static async sendAppointmentCancelledByPractitioner(
    to: string,
    input: AppointmentCancelledByPractitionerTemplateInput,
  ): Promise<boolean> {
    if (!to) return false;
    try {
      const { subject, html, text } = appointmentCancelledByPractitionerTemplate(input);
      const result = await EmailRepository.sendEmailWithResult({ to, subject, html, text });
      if (!result.ok) console.error("[EmailService] sendAppointmentCancelledByPractitioner failed:", result.error);
      return result.ok;
    } catch (error) {
      console.error("[EmailService] sendAppointmentCancelledByPractitioner failed:", error);
      return false;
    }
  }

  static async sendPractitionerCancellationSummary(
    to: string,
    input: PractitionerCancellationSummaryInput,
  ): Promise<void> {
    if (!to || input.appointments.length === 0) return;
    try {
      const { subject, html, text } = practitionerCancellationSummaryTemplate(input);
      await EmailRepository.sendEmail({ to, subject, html, text });
    } catch (error) {
      console.error("[EmailService] sendPractitionerCancellationSummary failed:", error);
    }
  }

  static async sendAppointmentMissed(
    to: string,
    input: AppointmentMissedTemplateInput,
  ): Promise<void> {
    if (!to) return;
    try {
      const { subject, html, text } = appointmentMissedTemplate(input);
      await EmailRepository.sendEmail({ to, subject, html, text });
    } catch (error) {
      console.error("[EmailService] sendAppointmentMissed failed:", error);
    }
  }

  static async sendAppointmentMissedToPractitioner(
    to: string,
    input: AppointmentMissedPractitionerTemplateInput,
  ): Promise<void> {
    if (!to) return;
    try {
      const { subject, html, text } = appointmentMissedPractitionerTemplate(input);
      await EmailRepository.sendEmail({ to, subject, html, text });
    } catch (error) {
      console.error("[EmailService] sendAppointmentMissedToPractitioner failed:", error);
    }
  }

  static async sendInvoice(
    to: string,
    input: InvoiceTemplateInput,
    pdf?: { filename: string; contentBase64: string },
  ): Promise<void> {
    if (!to) return;
    try {
      const { subject, html, text } = invoiceTemplate(input);
      await EmailRepository.sendEmail({ to, subject, html, text, attachment: pdf });
    } catch (error) {
      console.error("[EmailService] sendInvoice failed:", error);
    }
  }

  static async sendPrescription(
    to: string,
    input: PrescriptionTemplateInput,
  ): Promise<void> {
    if (!to) return;
    try {
      const { subject, html, text } = prescriptionTemplate(input);
      await EmailRepository.sendEmail({ to, subject, html, text });
    } catch (error) {
      console.error("[EmailService] sendPrescription failed:", error);
    }
  }
}
