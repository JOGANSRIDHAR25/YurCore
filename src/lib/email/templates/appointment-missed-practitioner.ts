import { SITE_NAME } from "@/shared/config/site";
import { renderEmailShell, toPlainTextRows, type EmailContent } from "./base";
import type { MissedBy } from "@/shared/appointments/attendance";

export type AppointmentMissedPractitionerTemplateInput = {
  practitionerName: string;
  /** The person who was booked in — a family member's own name when booked on their behalf. */
  patientName: string;
  date: string;
  time: string;
  mode?: string | null;
  missedBy?: MissedBy;
  /** In-clinic: the patient had arrived but left before being seen. */
  patientLeft?: boolean;
};

/** Same wording the doctor's queue shows (MISSED_BY_LABEL_FOR_DOCTOR). */
function statusFor(missedBy: MissedBy | undefined, patientLeft: boolean | undefined): string {
  if (patientLeft) return "Patient left before the consultation";
  if (missedBy === "practitioner") return "You didn't join";
  if (missedBy === "both") return "No one joined";
  return "Patient didn't join";
}

function introFor(input: AppointmentMissedPractitionerTemplateInput): string {
  if (input.patientLeft) {
    return `the appointment with ${input.patientName} below was closed because the patient left before the consultation.`;
  }
  if (input.missedBy === "practitioner") {
    return `the appointment with ${input.patientName} below was marked as missed because you did not join. The patient has been notified.`;
  }
  if (input.missedBy === "both") {
    return `the appointment with ${input.patientName} below ended without either side joining.`;
  }
  return `${input.patientName} did not join the appointment below, so it was marked as missed.`;
}

export function appointmentMissedPractitionerTemplate(
  input: AppointmentMissedPractitionerTemplateInput,
): EmailContent {
  const status = statusFor(input.missedBy, input.patientLeft);
  const rows = [
    { label: "Patient", value: input.patientName },
    { label: "Date", value: input.date },
    { label: "Time", value: input.time },
    ...(input.mode ? [{ label: "Mode", value: input.mode === "video" ? "Video Consultation" : "In-Clinic Visit" }] : []),
    { label: "Status", value: status },
  ];

  const intro = introFor(input);
  const footerNote = `You can review this appointment from your ${SITE_NAME} practitioner dashboard.`;

  const html = renderEmailShell({
    heading: input.patientLeft ? "Appointment Closed" : "Appointment Missed",
    intro: `Hi Dr. ${input.practitionerName}, ${intro}`,
    rows,
    footerNote,
  });

  const text = [
    `Hi Dr. ${input.practitionerName},`,
    "",
    intro.charAt(0).toUpperCase() + intro.slice(1),
    "",
    toPlainTextRows(rows),
    "",
    footerNote,
    "",
    "Regards,",
    `${SITE_NAME} Team`,
  ].join("\n");

  return {
    subject: `${status}: ${input.patientName} on ${input.date} at ${input.time}`,
    html,
    text,
  };
}
