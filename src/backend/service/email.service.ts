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
