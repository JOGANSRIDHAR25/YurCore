import { SITE_NAME } from "@/shared/config/site";
import { renderEmailShell, type EmailContent } from "./base";

export type PrescriptionTemplateItem = {
  name: string;
  dose?: string;
  frequency?: string;
  durationDays?: number;
};

export type PrescriptionTemplateInput = {
  patientName: string;
  practitionerName: string;
  date: string;
  items: PrescriptionTemplateItem[];
  followUpDate?: string | null;
};

export function prescriptionTemplate(
  input: PrescriptionTemplateInput,
): EmailContent {
  const itemsHtml = input.items.length
    ? `
      <table style="width: 100%; border-collapse: collapse; margin: 0 0 20px;">
        <thead>
          <tr style="background-color: #f8fafc; text-align: left;">
            <th style="padding: 8px; font-size: 11px; color: #64748b; border-bottom: 1px solid #e2e8f0;">Medicine</th>
            <th style="padding: 8px; font-size: 11px; color: #64748b; border-bottom: 1px solid #e2e8f0;">Dose</th>
            <th style="padding: 8px; font-size: 11px; color: #64748b; border-bottom: 1px solid #e2e8f0;">Duration</th>
          </tr>
        </thead>
        <tbody>
          ${input.items
            .map(
              (item) => `
            <tr>
              <td style="padding: 8px; font-size: 13px; color: #0f172a; border-bottom: 1px solid #f1f5f9;">${item.name}</td>
              <td style="padding: 8px; font-size: 13px; color: #0f172a; border-bottom: 1px solid #f1f5f9;">${item.dose || "-"}${item.frequency ? ` · ${item.frequency}` : ""}</td>
              <td style="padding: 8px; font-size: 13px; color: #0f172a; border-bottom: 1px solid #f1f5f9;">${item.durationDays ? `${item.durationDays} days` : "-"}</td>
            </tr>`,
            )
            .join("")}
        </tbody>
      </table>
    `
    : "";

  const html = renderEmailShell({
    heading: "Your Prescription is Ready",
    intro: `Hi ${input.patientName}, Dr. ${input.practitionerName} has issued a new prescription for you on ${input.date}.`,
    bodyHtml: itemsHtml,
    footerNote: input.followUpDate
      ? `Your follow-up is scheduled for ${input.followUpDate}. You can view the full prescription anytime from your ${SITE_NAME} dashboard.`
      : `You can view the full prescription anytime from your ${SITE_NAME} dashboard.`,
  });

  const textItems = input.items
    .map(
      (item) =>
        `- ${item.name}${item.dose ? ` (${item.dose})` : ""}${item.durationDays ? ` · ${item.durationDays} days` : ""}`,
    )
    .join("\n");

  const text = [
    `Hi ${input.patientName},`,
    "",
    `Dr. ${input.practitionerName} has issued a new prescription for you on ${input.date}.`,
    "",
    textItems,
    "",
    input.followUpDate ? `Follow-up: ${input.followUpDate}` : "",
    "",
    "Regards,",
    `${SITE_NAME} Team`,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    subject: `Your ${SITE_NAME} prescription is ready`,
    html,
    text,
  };
}
