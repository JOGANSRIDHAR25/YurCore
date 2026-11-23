import { SITE_NAME } from "@/shared/config/site";
import { renderEmailShell, type EmailContent } from "./base";
import { escapeHtml } from "./appointment-cancelled-by-practitioner";

export type PractitionerCancellationSummaryInput = {
  practitionerName: string;
  /** What the doctor did, e.g. "You marked 24 Nov 2026 as leave". */
  action: string;
  reason?: string;
  appointments: { patientName: string; date: string; time: string; mode: string; emailed: boolean }[];
};

/**
 * Receipt for the doctor after they cancel appointments by changing their
 * availability — a record of exactly who was affected and who was told.
 */
export function practitionerCancellationSummaryTemplate(
  input: PractitionerCancellationSummaryInput,
): EmailContent {
  const count = input.appointments.length;
  const plural = count === 1 ? "appointment" : "appointments";
  const notEmailed = input.appointments.filter((a) => !a.emailed).length;

  const tableRows = input.appointments
    .map(
      (a) => `
        <tr>
          <td style="padding: 8px 6px; border-bottom: 1px solid #e2e8f0; font-size: 13px;">${escapeHtml(a.patientName)}</td>
          <td style="padding: 8px 6px; border-bottom: 1px solid #e2e8f0; font-size: 13px;">${a.date}</td>
          <td style="padding: 8px 6px; border-bottom: 1px solid #e2e8f0; font-size: 13px;">${a.time}</td>
          <td style="padding: 8px 6px; border-bottom: 1px solid #e2e8f0; font-size: 13px;">${a.mode === "video" ? "Video" : "Clinic"}</td>
          <td style="padding: 8px 6px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: ${a.emailed ? "#059669" : "#b45309"};">${a.emailed ? "Emailed" : "In-app only"}</td>
        </tr>`,
    )
    .join("");

  const html = renderEmailShell({
    heading: `${count} ${plural} cancelled`,
    intro: `Hi Dr. ${escapeHtml(input.practitionerName)}, ${escapeHtml(input.action)}. As you confirmed, the ${plural} below ${count === 1 ? "was" : "were"} cancelled and the ${count === 1 ? "patient has" : "patients have"} been notified.`,
    bodyHtml: `
      ${input.reason?.trim() ? `<p style="margin: 0 0 16px; font-size: 14px;"><strong>Reason shared with patients:</strong> ${escapeHtml(input.reason.trim())}</p>` : ""}
      <table style="width: 100%; border-collapse: collapse; margin: 0 0 16px;">
        <thead>
          <tr style="background-color: #f0fdf4;">
            <th style="padding: 8px 6px; text-align: left; font-size: 12px; color: #166534;">Patient</th>
            <th style="padding: 8px 6px; text-align: left; font-size: 12px; color: #166534;">Date</th>
            <th style="padding: 8px 6px; text-align: left; font-size: 12px; color: #166534;">Time</th>
            <th style="padding: 8px 6px; text-align: left; font-size: 12px; color: #166534;">Mode</th>
            <th style="padding: 8px 6px; text-align: left; font-size: 12px; color: #166534;">Notified</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
      ${notEmailed > 0 ? `<p style="margin: 0 0 12px; font-size: 13px; color: #b45309;">${notEmailed} patient(s) have no email on file and were notified in the app only. You may want to call them.</p>` : ""}
    `,
    footerNote: `Those time slots are now closed to new bookings. You can review or change your hours anytime on the Availability page in ${SITE_NAME}.`,
  });

  const text = [
    `Hi Dr. ${input.practitionerName},`,
    "",
    `${input.action}. The following ${plural} were cancelled and the patients notified:`,
    "",
    ...input.appointments.map(
      (a) => `- ${a.patientName} — ${a.date} ${a.time} (${a.mode === "video" ? "Video" : "Clinic"}) — ${a.emailed ? "emailed" : "in-app only"}`,
    ),
    ...(input.reason?.trim() ? ["", `Reason shared with patients: ${input.reason.trim()}`] : []),
    "",
    "Regards,",
    `${SITE_NAME} Team`,
  ].join("\n");

  return {
    subject: `${SITE_NAME}: ${count} ${plural} cancelled after your availability change`,
    html,
    text,
  };
}
