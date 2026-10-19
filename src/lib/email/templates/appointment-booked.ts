import { SITE_NAME } from "@/shared/config/site";
import { renderEmailShell, toPlainTextRows, type EmailContent } from "./base";

export type AppointmentBookedTemplateInput = {
  patientName: string;
  /** Set when the appointment was booked for a family member — the email goes to the account owner (patientName). */
  familyMemberName?: string;
  practitionerName: string;
  date: string;
  time: string;
  mode: "video" | "clinic";
  fee?: string;
};

export function appointmentBookedTemplate(
  input: AppointmentBookedTemplateInput,
): EmailContent {
  const rows = [
    ...(input.familyMemberName ? [{ label: "Patient", value: input.familyMemberName }] : []),
    { label: "Practitioner", value: `Dr. ${input.practitionerName}` },
    { label: "Date", value: input.date },
    { label: "Time", value: input.time },
    { label: "Mode", value: input.mode === "video" ? "Video Consultation" : "In-Clinic Visit" },
    ...(input.fee ? [{ label: "Fee", value: input.fee }] : []),
  ];

  const intro = input.familyMemberName
    ? `the appointment for your family member ${input.familyMemberName} has been booked successfully.`
    : "your appointment has been booked successfully.";

  const html = renderEmailShell({
    heading: "Appointment Confirmed",
    intro: `Hi ${input.patientName}, ${intro}`,
    rows,
    footerNote: `You can view or manage this appointment anytime from your ${SITE_NAME} dashboard.`,
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
      ? `${input.familyMemberName}'s ${SITE_NAME} appointment is confirmed`
      : `Your ${SITE_NAME} appointment is confirmed`,
    html,
    text,
  };
}
