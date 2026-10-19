import { SITE_NAME } from "@/shared/config/site";
import "server-only";

import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { InvoicePdfDocument } from "@/components/consultation-report/InvoicePdfDocument";
import { EmailService } from "./email.service";

function getFirst<T>(value: T | T[] | null | undefined): T | undefined {
  return Array.isArray(value) ? value[0] : value ?? undefined;
}

function formatRupees(paise: number): string {
  return `₹${(paise / 100).toFixed(2)}`;
}

/**
 * Sends the prescription and invoice emails right after a consultation is
 * finalized (ConsultationService.saveCompleteConsultation). `data` is the
 * same shape produced by ConsultationService.getConsultationInvoiceData and
 * consumed by InvoicePdfDocument.
 */
/** For a family member (no login/email), the account owner who receives their emails. */
export type ConsultationEmailRecipient = { email: string; name: string };

export async function sendPostConsultationEmails(data: any, recipient?: ConsultationEmailRecipient | null): Promise<void> {
  const patient = getFirst(data?.patients) as any;
  const practitioner = getFirst(data?.practitioners) as any;
  const patientUser = getFirst(patient?.user) as any;
  const patientEmail: string | undefined = patientUser?.email || recipient?.email;

  if (!patientEmail) {
    return;
  }

  // Addressed to the account owner when the visit was for a family member.
  const patientName = (!patientUser?.email && recipient?.name) || patient?.full_name || "Patient";
  const practitionerName = practitioner?.full_name || "Practitioner";
  const dateStr = data?.created_at
    ? new Date(data.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
    : "";

  const prescription = getFirst(data?.prescriptions) as any;
  const prescriptionItems = (prescription?.prescription_items || []).map((item: any) => ({
    name: item.medicine_name,
    dose: item.dose,
    frequency: item.frequency,
    durationDays: item.duration_days,
  }));

  await EmailService.sendPrescription(patientEmail, {
    patientName,
    practitionerName,
    date: dateStr,
    items: prescriptionItems,
    followUpDate: prescription?.followup_date
      ? new Date(prescription.followup_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
      : null,
  });

  await sendInvoiceEmail(data, recipient);
}

/**
 * Renders the invoice PDF and emails it to the patient. Used both right
 * after a consultation is finalized and by the manual "Email Invoice"
 * action in InvoiceDialog.
 */
export async function sendInvoiceEmail(data: any, recipient?: ConsultationEmailRecipient | null): Promise<void> {
  const patient = getFirst(data?.patients) as any;
  const practitioner = getFirst(data?.practitioners) as any;
  const patientUser = getFirst(patient?.user) as any;
  const patientEmail: string | undefined = patientUser?.email || recipient?.email;

  if (!patientEmail) {
    return;
  }

  const patientName = (!patientUser?.email && recipient?.name) || patient?.full_name || "Patient";
  const practitionerName = practitioner?.full_name || "Practitioner";
  const dateStr = data?.created_at
    ? new Date(data.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
    : "";
  const invoice = data?.invoice || { doctorFeePaise: 0, totalPaise: 0 };

  try {
    const pdfBuffer = await renderToBuffer(<InvoicePdfDocument data={data} />);

    await EmailService.sendInvoice(
      patientEmail,
      {
        patientName,
        practitionerName,
        date: dateStr,
        totalAmount: formatRupees(invoice.totalPaise),
      },
      {
        filename: `${SITE_NAME}_Invoice_${patientName.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`,
        contentBase64: pdfBuffer.toString("base64"),
      },
    );
  } catch (error) {
    console.error("[consultation-email.helper] Invoice PDF generation/email failed:", error);
  }
}