import { SITE_NAME } from "@/shared/config/site";
import { renderEmailShell, toPlainTextRows, type EmailContent } from "./base";

/** YurCore Learning emails: new course in the learner's interests, course completed, target reminder, target met. */

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function button(href: string, label: string, secondary = false): string {
  const style = secondary
    ? "display:inline-block;padding:11px 20px;border:1px solid #10b981;color:#047857;background:#ffffff;border-radius:10px;font-weight:600;font-size:14px;text-decoration:none;"
    : "display:inline-block;padding:12px 22px;background:#10b981;color:#ffffff;border-radius:10px;font-weight:600;font-size:14px;text-decoration:none;";
  return `<a href="${esc(href)}" style="${style}" target="_blank" rel="noopener">${esc(label)}</a>`;
}

const actions = (...buttons: string[]) => `<p style="margin: 4px 0 0;">${buttons.join("&nbsp;&nbsp;")}</p>`;
const LEARNING_FOOTER = `You receive these emails because you use ${SITE_NAME} Learning. You can change your interests and annual target in your Learning Profile.`;

type Row = { label: string; value: string };
const rowsOf = (rows: (Row | null)[]) => rows.filter((r): r is Row => Boolean(r && r.value)).map((r) => ({ label: esc(r.label), value: esc(r.value) }));

export type NewCourseEmailInput = {
  name: string;
  courseTitle: string;
  category: string | null;
  summary: string;
  credits: string | null;
  duration: string | null;
  exploreUrl: string;
};

export function learningNewCourseTemplate(i: NewCourseEmailInput): EmailContent {
  const rows = rowsOf([
    { label: "Course", value: i.courseTitle },
    i.category ? { label: "Category", value: i.category } : null,
    i.credits ? { label: "Credits", value: i.credits } : null,
    i.duration ? { label: "Duration", value: i.duration } : null,
  ]);
  const summary = i.summary ? `<p style="margin: 0 0 20px; line-height: 1.6; color: #374151;">${esc(i.summary)}</p>` : "";
  return {
    subject: `New Course Available: ${i.courseTitle}`,
    html: renderEmailShell({
      heading: "A new course in your interests",
      intro: `Dear ${esc(i.name)}, a new course${i.category ? ` in <strong>${esc(i.category)}</strong>` : ""}, one of your selected learning categories, is now available on ${SITE_NAME} Learning.`,
      rows,
      bodyHtml: summary + actions(button(i.exploreUrl, "Explore Course")),
      footerNote: LEARNING_FOOTER,
    }),
    text: [`Dear ${i.name},`, "", `A new course in your interests is available: ${i.courseTitle}.`, i.summary, "", toPlainTextRows(rows), "", `Explore the course: ${i.exploreUrl}`].join("\n"),
  };
}

export type CourseCompletedEmailInput = {
  name: string;
  courseTitle: string;
  completedOn: string;
  credits: string | null;
  certificateNumber: string;
  /** Older deliveries carried a download link; the certificate is now attached instead. */
  certificateUrl?: string;
  verifyUrl: string;
};

export function learningCourseCompletedTemplate(i: CourseCompletedEmailInput): EmailContent {
  const rows = rowsOf([
    { label: "Course", value: i.courseTitle },
    { label: "Completed on", value: i.completedOn },
    i.credits ? { label: "Credits awarded", value: i.credits } : null,
    { label: "Certificate number", value: i.certificateNumber },
  ]);
  return {
    subject: `Course Completed: ${i.courseTitle}`,
    html: renderEmailShell({
      heading: "Congratulations on completing your course",
      intro: `Dear ${esc(i.name)}, you have completed <strong>${esc(i.courseTitle)}</strong>. Your certificate has been issued${i.credits ? " and your credits have been added to your learning record" : ""}.`,
      rows,
      bodyHtml: `<p style="margin: 0 0 16px; line-height: 1.6; color: #374151;">Your certificate is attached to this email as a PDF. Anyone can confirm it is genuine with the verification link below or the QR code on the certificate.</p>${actions(button(i.verifyUrl, "Verify Certificate"))}`,
      footerNote: LEARNING_FOOTER,
    }),
    text: [`Dear ${i.name},`, "", `You have completed ${i.courseTitle}.`, "", toPlainTextRows(rows), "", "Your certificate is attached to this email as a PDF.", `Verify: ${i.verifyUrl}`].join("\n"),
  };
}

export type TargetReminderEmailInput = {
  name: string;
  yearLabel: string;
  target: string;
  completed: string;
  remaining: string;
  percent: string;
  daysRemaining: number;
  pace: string | null;
  status: string;
  coursesUrl: string;
};

export function learningTargetReminderTemplate(i: TargetReminderEmailInput): EmailContent {
  const rows = rowsOf([
    { label: "Annual target", value: i.target },
    { label: "Credits completed", value: i.completed },
    { label: "Credits remaining", value: i.remaining },
    { label: "Current progress", value: i.percent },
    { label: "Days remaining", value: String(i.daysRemaining) },
    i.pace ? { label: "Required pace", value: i.pace } : null,
    { label: "Status", value: i.status },
  ]);
  return {
    subject: `Your ${i.yearLabel} learning target: ${i.remaining} remaining`,
    html: renderEmailShell({
      heading: "Stay on track with your learning target",
      intro: `Dear ${esc(i.name)}, here is where you stand on your ${esc(i.yearLabel)} learning target. You need <strong>${esc(i.remaining)}</strong> more to reach it.`,
      rows,
      bodyHtml: `<p style="margin: 0 0 16px; line-height: 1.6; color: #374151;">Courses in your selected categories are a good place to start. Each completed course adds its credits to your record as soon as the certificate is issued.</p>${actions(button(i.coursesUrl, "Find Courses"))}`,
      footerNote: LEARNING_FOOTER,
    }),
    text: [`Dear ${i.name},`, "", `Your ${i.yearLabel} learning target: ${i.remaining} remaining.`, "", toPlainTextRows(rows), "", `Find courses: ${i.coursesUrl}`].join("\n"),
  };
}

export type TargetMetEmailInput = {
  name: string;
  yearLabel: string;
  target: string;
  completed: string;
  completedOn: string | null;
  percent: string;
  overTarget: string | null;
  profileUrl: string;
};

export function learningTargetMetTemplate(i: TargetMetEmailInput): EmailContent {
  const rows = rowsOf([
    { label: "Credit year", value: i.yearLabel },
    { label: "Annual target", value: i.target },
    { label: "Total completed", value: i.completed },
    i.completedOn ? { label: "Target completed on", value: i.completedOn } : null,
    { label: "Progress", value: i.percent },
    i.overTarget ? { label: "Above target", value: i.overTarget } : null,
  ]);
  return {
    subject: "Congratulations! Your Annual Learning Target Is Complete",
    html: renderEmailShell({
      heading: "Annual learning target achieved",
      intro: `Dear ${esc(i.name)}, you have completed your ${esc(i.yearLabel)} learning target of <strong>${esc(i.target)}</strong>. Well done.`,
      rows,
      bodyHtml: actions(button(i.profileUrl, "View Learning Profile")),
      footerNote: LEARNING_FOOTER,
    }),
    text: [`Dear ${i.name},`, "", `You have completed your ${i.yearLabel} learning target.`, "", toPlainTextRows(rows), "", `Learning profile: ${i.profileUrl}`].join("\n"),
  };
}
