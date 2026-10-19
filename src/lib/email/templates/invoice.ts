import { SITE_NAME } from "@/shared/config/site";
import { renderEmailShell, toPlainTextRows, type EmailContent } from "./base";

export type InvoiceTemplateInput = {
  patientName: string;
  practitionerName: string;
  date: string;
  totalAmount: string;
};

export function invoiceTemplate(input: InvoiceTemplateInput): EmailContent {
  const rows = [
    { label: "Practitioner", value: `Dr. ${input.practitionerName}` },
    { label: "Date", value: input.date },
    { label: "Total Amount", value: input.totalAmount },
  ];

  const html = renderEmailShell({
    heading: "Your Consultation Invoice",
    intro: `Hi ${input.patientName}, please find your consultation invoice attached to this email.`,
    rows,
    footerNote: "The full itemized invoice is attached as a PDF.",
  });

  const text = [
    `Hi ${input.patientName},`,
    "",
    "Please find your consultation invoice attached to this email.",
    "",
    toPlainTextRows(rows),
    "",
    "Regards,",
    `${SITE_NAME} Team`,
  ].join("\n");

  return {
    subject: `Your ${SITE_NAME} consultation invoice`,
    html,
    text,
  };
}
