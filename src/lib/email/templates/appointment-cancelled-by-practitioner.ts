import { SITE_NAME } from "@/shared/config/site";
import { renderEmailShell, toPlainTextRows, type EmailContent } from "./base";

export type AppointmentCancelledByPractitionerTemplateInput = {
  /** Account holder who receives the email. */
  patientName: string;
  /** Set when the appointment was for a family member. */
  familyMemberName?: string;
  practitionerName: string;
  date: string;
  time: string;
  mode: string;
  /** Short, patient-friendly reason the doctor gave (optional). */
  reason?: string;
  /** Absolute link where the patient can book again (optional). */
  rebookUrl?: string;
};

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Sent when the DOCTOR cancels — because they took leave, changed their hours
 * or stopped accepting bookings. Unlike a patient-initiated cancellation, the
 * patient did nothing wrong, so the tone is apologetic and the next step
 * (book another slot) is front and centre.
 */
export function appointmentCancelledByPractitionerTemplate(
  input: AppointmentCancelledByPractitionerTemplateInput,
): EmailContent {
  const doctor = `Dr. ${input.practitionerName}`;
  const who = input.familyMemberName ? `${input.familyMemberName}'s` : "your";
  const reason = input.reason?.trim();

  const rows = [
    ...(input.familyMemberName ? [{ label: "Patient", value: escapeHtml(input.familyMemberName) }] : []),
    { label: "Doctor", value: escapeHtml(doctor) },
    { label: "Date", value: input.date },
    { label: "Time", value: input.time },
    { label: "Mode", value: input.mode === "video" ? "Video Consultation" : "In-Clinic Visit" },
    { label: "Status", value: "Cancelled by doctor" },
  ];

  const reasonHtml = reason
    ? `<p style="margin: 0 0 16px; padding: 12px 14px; background-color: #fffbeb; border: 1px solid #fde68a; border-radius: 10px; font-size: 14px; line-height: 1.6; color: #78350f;">
         <strong>Message from ${escapeHtml(doctor)}:</strong><br />${escapeHtml(reason)}
       </p>`
    : "";

  const buttonHtml = input.rebookUrl
    ? `<p style="margin: 0 0 16px;">
         <a href="${escapeHtml(input.rebookUrl)}" style="display: inline-block; padding: 12px 22px; background-color: #10b981; color: #ffffff; text-decoration: none; font-weight: bold; border-radius: 999px; font-size: 14px;">
           Book a new appointment
         </a>
       </p>`
    : "";

  const html = renderEmailShell({
    heading: "Your appointment has been cancelled",
    intro: `Hi ${escapeHtml(input.patientName)}, we're sorry — ${escapeHtml(doctor)} is not available at the time of ${who} appointment below, so it has been cancelled. You don't need to do anything to cancel it on your side.`,
    rows,
    bodyHtml: `
      ${reasonHtml}
      <p style="margin: 0 0 12px; font-size: 14px; line-height: 1.6;">
        <strong>What you can do next</strong><br />
        &bull; Book another slot with ${escapeHtml(doctor)} once new times are available, or<br />
        &bull; Choose another doctor from ${SITE_NAME} if you need to be seen sooner.
      </p>
      ${buttonHtml}
    `,
    footerNote: `This slot has been released. If you have already paid for this appointment and have a question about it, simply reply to this email or contact ${SITE_NAME} support.`,
  });

  const text = [
    `Hi ${input.patientName},`,
    "",
    `We're sorry — ${doctor} is not available at the time of ${who} appointment below, so it has been cancelled.`,
    "",
    toPlainTextRows([
      ...(input.familyMemberName ? [{ label: "Patient", value: input.familyMemberName }] : []),
      { label: "Doctor", value: doctor },
      { label: "Date", value: input.date },
      { label: "Time", value: input.time },
      { label: "Mode", value: input.mode === "video" ? "Video Consultation" : "In-Clinic Visit" },
    ]),
    ...(reason ? ["", `Message from ${doctor}: ${reason}`] : []),
    "",
    "What you can do next:",
    `- Book another slot with ${doctor} once new times are available, or`,
    `- Choose another doctor on ${SITE_NAME} if you need to be seen sooner.`,
    ...(input.rebookUrl ? ["", `Book again: ${input.rebookUrl}`] : []),
    "",
    "Regards,",
    `${SITE_NAME} Team`,
  ].join("\n");

  return {
    subject: input.familyMemberName
      ? `${doctor} cancelled ${input.familyMemberName}'s appointment on ${input.date}`
      : `${doctor} cancelled your appointment on ${input.date}`,
    html,
    text,
  };
}
