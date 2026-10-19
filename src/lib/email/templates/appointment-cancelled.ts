import { SITE_NAME } from "@/shared/config/site";
import { renderEmailShell, toPlainTextRows, type EmailContent } from "./base";

export type AppointmentCancelledTemplateInput = {
  patientName: string;
  /** Set when the appointment was for a family member — the email goes to the account owner (patientName). */
  familyMemberName?: string;
  practitionerName: string;
  date: string;
  time: string;
  reason: string;
};

export function appointmentCancelledTemplate(
  input: AppointmentCancelledTemplateInput,
): EmailContent {
  const rows = [
    ...(input.familyMemberName ? [{ label: "Patient", value: input.familyMemberName }] : []),
    { label: "Practitioner", value: `Dr. ${input.practitionerName}` },
    { label: "Date", value: input.date },
    { label: "Time", value: input.time },
    { label: "Reason", value: input.reason },
  ];

  const intro = input.familyMemberName
    ? `your family member ${input.familyMemberName}'s appointment below has been cancelled.`
    : "the appointment below has been cancelled.";

  const html = renderEmailShell({
    heading: "Appointment Cancelled",
    intro: `Hi ${input.patientName}, ${intro}`,
    rows,
    footerNote: `If this was a mistake, you can book a new appointment anytime from your ${SITE_NAME} dashboard.`,
  });

  const text = [
    `Hi ${input.patientName},`,
    "",
    intro.charAt(0).toUpperCase() + intro.slice(1),
    "",
    toPlainTextRows(rows),
    "",
    "Regards,",
    `${SITE_NAME} Team`,
  ].join("\n");

  return {
    subject: input.familyMemberName
      ? `${input.familyMemberName}'s ${SITE_NAME} appointment was cancelled`
      : `Your ${SITE_NAME} appointment was cancelled`,
    html,
    text,
  };
}
