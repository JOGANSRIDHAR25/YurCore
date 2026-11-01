import "server-only";

import { after } from "next/server";
import { formatCredits } from "@/shared/learning/credits";
import { formatDuration } from "@/shared/learning/content";
import {
  learningCourseCompletedTemplate,
  learningNewCourseTemplate,
  learningTargetMetTemplate,
  learningTargetReminderTemplate,
} from "@/lib/email/templates/learning";
import type { EmailContent } from "@/lib/email/templates/base";
import { EmailRepository, type SendEmailPayload } from "../repo/email.repo";
import { LearningRepository } from "../repo/learning.repo";
import { PRACTITIONER_DB_ROLES, LearningProfileRepository as Repo, type DeliveryKind, type DeliveryRecord, type SettingsRow } from "../repo/learning-profile.repo";
import { LearningCredentials as Cred, appBaseUrl, creditsLabel, formatIstDate, verifyUrlFor } from "./learning-credentials.service";

/**
 * Learning notifications: an in-app notification (existing notifications table) plus an email (existing
 * send-email edge function, sent from the configured Gmail account, admin.meyveda@gmail.com). Every send is
 * recorded in meyveda_learning_deliveries under a unique dedupe key, so page reloads, retries and concurrent
 * triggers never notify twice. Failures are recorded and can be retried by an admin; they never fail the
 * action that triggered them (publishing, completing a course, ...).
 */

const STATUS_LABEL = { target_met: "Target met", on_track: "On track", behind: "Behind" } as const;
const MAX_ATTEMPTS = 5;

type Recipient = { userId: string; email: string | null; name: string };

async function recipients(userIds: string[]): Promise<Recipient[]> {
  const [users, pros] = await Promise.all([Repo.getUsers(userIds), Repo.getPractitionerProfiles(userIds)]);
  return userIds
    .filter((id) => PRACTITIONER_DB_ROLES.includes(users.get(id)?.role ?? "") && users.get(id)?.is_active !== false && pros.has(id))
    .map((id) => ({ userId: id, email: users.get(id)?.email?.trim() || null, name: pros.get(id)?.full_name?.trim() || "Doctor" }));
}

/** Rebuilds the email for a stored delivery (payload holds everything needed, so retries send the same message). */
function render(kind: DeliveryKind, payload: Record<string, unknown>): EmailContent {
  const p = payload as never;
  switch (kind) {
    case "new_course": return learningNewCourseTemplate(p);
    case "course_completed": return learningCourseCompletedTemplate(p);
    case "target_reminder": return learningTargetReminderTemplate(p);
    case "target_met": return learningTargetMetTemplate(p);
  }
}

async function send(d: DeliveryRecord, expected: DeliveryRecord["status"][] = ["pending"]): Promise<void> {
  if (!d.recipient_email) {
    await Repo.finishDelivery(d.id, { status: "skipped", last_error: "No email address on the account" });
    return;
  }
  if (!(await Repo.startAttempt(d.id, expected))) return; // someone else is sending it
  const { subject, html, text } = render(d.kind, d.payload);
  let attachment: SendEmailPayload["attachment"];
  if (d.kind === "course_completed" && d.certificate_id) {
    // The certificate travels as a PDF attachment. Without a valid PDF the email is not sent; the delivery is marked
    // failed so the admin "Retry" (or a later attempt) sends it once the PDF can be rendered.
    try {
      const cert = await Repo.getCertificate(d.certificate_id);
      if (!cert || cert.status !== "valid") {
        await Repo.finishDelivery(d.id, { status: "skipped", last_error: "Certificate is no longer valid" });
        return;
      }
      attachment = await Cred.emailAttachment(cert);
    } catch (err) {
      const msg = `Certificate PDF unavailable: ${err instanceof Error ? err.message : String(err)}`;
      await Repo.finishDelivery(d.id, { status: "failed", last_error: msg.slice(0, 500) });
      console.error(`[learning] ${d.kind} email to user ${d.user_id} not sent: ${msg}`);
      return;
    }
  }
  const r = await EmailRepository.sendEmailWithResult({ to: d.recipient_email, subject, html, text, attachment });
  await Repo.finishDelivery(d.id, r.ok ? { status: "sent", sent_at: new Date().toISOString(), last_error: null } : { status: "failed", last_error: r.error.slice(0, 500) });
  if (!r.ok) console.error(`[learning] ${d.kind} email to user ${d.user_id} failed: ${r.error}`);
}

/** Claims the dedupe key; when this call is the first, creates the in-app notification and sends the email. */
async function notifyOnce(input: {
  recipient: Recipient;
  kind: DeliveryKind;
  key: string;
  courseId?: string | null;
  certificateId?: string | null;
  payload: Record<string, unknown>;
  inApp: { title: string; body: string; link: string; referenceId?: string | null; referenceType?: string | null };
}): Promise<boolean> {
  const d = await Repo.claimDelivery({
    user_id: input.recipient.userId,
    kind: input.kind,
    dedupe_key: input.key,
    course_id: input.courseId ?? null,
    certificate_id: input.certificateId ?? null,
    recipient_email: input.recipient.email,
    payload: input.payload,
  });
  if (!d) return false;
  await Repo.insertNotification({ user_id: input.recipient.userId, title: input.inApp.title, body: input.inApp.body, deep_link: input.inApp.link, reference_id: input.inApp.referenceId ?? null, reference_type: input.inApp.referenceType ?? null });
  await send(d);
  return true;
}

const courseUrl = (courseId: string) => `${appBaseUrl()}/pro/learning/courses/${courseId}/`;
const coursePath = (courseId: string) => `/pro/learning/courses/${courseId}/`;

/** Runs background work after the response, logging (never throwing) failures. */
function background(what: string, fn: () => Promise<unknown>) {
  const run = () => fn().catch((err) => console.error(`[learning] ${what} failed:`, err instanceof Error ? err.message : err));
  try {
    after(run);
  } catch {
    void run(); // outside a request scope (scripts, tests)
  }
}

let lastReminderRun = 0;
let reminderRunning: Promise<unknown> | null = null;

export const LearningNotify = {
  background,

  /** New published course: email learners whose saved interests include one of its categories (once per learner). */
  async newCourse(courseId: string): Promise<{ notified: number }> {
    const settings = await Cred.settings();
    if (!settings.new_course_emails_enabled) return { notified: 0 };
    const course = await LearningRepository.getCourse(courseId);
    if (!course || course.status !== "published") return { notified: 0 }; // drafts never notify
    const categoryIds = (await Repo.courseCategoryIds([courseId])).get(courseId) ?? [];
    if (categoryIds.length === 0) return { notified: 0 };
    const [categories, userIds] = await Promise.all([Repo.getCategories(categoryIds), Repo.usersInterestedIn(categoryIds)]);
    if (userIds.length === 0) return { notified: 0 };
    const interestsByUser = new Map<string, string[]>();
    await Promise.all(userIds.map(async (u) => interestsByUser.set(u, await Repo.listInterests(u))));
    const credits = Number(course.credits);
    let notified = 0;
    for (const r of await recipients(userIds)) {
      const mine = interestsByUser.get(r.userId) ?? [];
      const match = categories.find((c) => mine.includes(c.id)); // the category that matched this learner's interests
      if (!match) continue;
      const sent = await notifyOnce({
        recipient: r,
        kind: "new_course",
        key: `new_course:${courseId}:${r.userId}`,
        courseId,
        payload: {
          name: r.name,
          courseTitle: course.title,
          category: match.name,
          summary: (course.short_description || course.description || "").replace(/\s+/g, " ").trim().slice(0, 300),
          credits: credits > 0 ? creditsLabel(credits, course.credit_type, settings.credit_unit_label) : null,
          duration: formatDuration(course.duration_minutes),
          exploreUrl: courseUrl(courseId),
        },
        inApp: { title: `New course in ${match.name}`, body: `${course.title} is now available in your interests.`, link: coursePath(courseId), referenceId: courseId, referenceType: "learning_course" },
      }).catch((err) => {
        console.error("[learning] new-course notification failed:", err instanceof Error ? err.message : err);
        return false;
      });
      if (sent) notified++;
    }
    return { notified };
  },

  scheduleNewCourse(courseId: string) {
    background("new-course notifications", () => this.newCourse(courseId));
  },

  /** After a certificate is issued: render the PDF, notify the learner, then check the annual target. */
  async certificateIssued(certificateId: string): Promise<void> {
    const cert = await Repo.getCertificate(certificateId);
    if (!cert || cert.status !== "valid") return;
    const settings = await Cred.settings();
    // The PDF is rendered (and validated) when the email is sent, since it goes out as an attachment.
    const [r] = await recipients([cert.user_id]);
    if (r) {
      const credits = Number(cert.credits_awarded);
      await notifyOnce({
        recipient: r,
        kind: "course_completed",
        key: `course_completed:${cert.id}`,
        courseId: cert.course_id,
        certificateId: cert.id,
        payload: {
          name: r.name,
          courseTitle: cert.course_title,
          completedOn: formatIstDate(cert.completed_at),
          credits: credits > 0 ? creditsLabel(credits, cert.credit_type, settings.credit_unit_label) : null,
          certificateNumber: cert.certificate_number,
          verifyUrl: verifyUrlFor(cert.certificate_number),
        },
        inApp: {
          title: "Certificate issued",
          body: `You completed ${cert.course_title}${credits > 0 ? ` and earned ${creditsLabel(credits, cert.credit_type, settings.credit_unit_label)}` : ""}. Certificate ${cert.certificate_number}.`,
          link: `/pro/learning/certificates?highlight=${cert.id}`,
          referenceId: cert.id,
          referenceType: "learning_certificate",
        },
      });
    }
    await this.checkTargetMet(cert.user_id, settings);
  },

  scheduleCertificateIssued(certificateId: string) {
    background("certificate notifications", () => this.certificateIssued(certificateId));
  },

  /**
   * Target achievement, once per learner, credit year and target value. If the learner later raises the target
   * and meets the new one, that is a new achievement; meeting a lower or equal target again never re-notifies.
   */
  async checkTargetMet(userId: string, settings?: SettingsRow): Promise<boolean> {
    const s = settings ?? (await Cred.settings());
    const p = await Cred.progress(userId, s);
    if (p.status !== "target_met") return false;
    const prefix = `target_met:${userId}:${p.creditYear}:`;
    const earlier = await Repo.findDeliveries({ userId, kind: "target_met", keyPrefix: prefix, limit: 50 });
    if (earlier.some((d) => Number(d.payload?.targetValue ?? 0) >= p.target)) return false;
    const [r] = await recipients([userId]);
    if (!r) return false;
    const unit = s.credit_unit_label;
    return notifyOnce({
      recipient: r,
      kind: "target_met",
      key: `${prefix}${p.target}`,
      payload: {
        targetValue: p.target,
        name: r.name,
        yearLabel: p.creditYearLabel,
        target: `${formatCredits(p.target)} ${unit}`,
        completed: `${formatCredits(p.completed)} ${unit}`,
        completedOn: p.targetMetOn ? formatIstDate(p.targetMetOn) : null,
        percent: `${Math.round(p.percent)}%`,
        overTarget: p.overTarget > 0 ? `${formatCredits(p.overTarget)} ${unit}` : null,
        profileUrl: `${appBaseUrl()}/pro/learning/profile`,
      },
      inApp: {
        title: "Annual Learning Target Achieved",
        body: `You have completed your annual target of ${formatCredits(p.target)} ${unit}${p.overTarget > 0 ? ` (+${formatCredits(p.overTarget)} over target)` : ""}.`,
        link: "/pro/learning/profile",
        referenceType: "learning_target",
      },
    });
  },

  /**
   * Target reminders for every learner with a profile, recalculated from current data. Schedule (admin settings):
   * monthly (one per calendar month) and/or year-end reminders when N days remain. Never sent once the target is met;
   * one reminder per learner per period. Called by the cron endpoint, the admin "Run now" button and (throttled)
   * in the background while the app is in use.
   */
  async runReminders(now = new Date()): Promise<{ checked: number; sent: number; skipped: number }> {
    const s = await Cred.settings();
    if (!s.reminders_enabled) return { checked: 0, sent: 0, skipped: 0 };
    const year = Cred.currentYear(s, now);
    const userIds = await Repo.learnersWithProfile();
    const people = await recipients(userIds);
    const ist = new Date(now.getTime() + 330 * 60000);
    const month = `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, "0")}`;
    let sent = 0;
    let skipped = 0;
    for (const r of people) {
      try {
        const p = await Cred.progress(r.userId, s, { year, now });
        if (p.status === "target_met" || p.yearEnded) { skipped++; continue; }
        // The closest year-end threshold reached (e.g. 30 when 25 days remain), else the monthly period.
        const yearEnd = [...s.reminder_year_end_days].sort((a, b) => a - b).find((d) => p.daysRemaining <= d);
        const period = yearEnd !== undefined ? `yearend-${yearEnd}` : s.reminder_monthly && (!s.reminder_only_when_behind || p.status === "behind") ? `month-${month}` : null;
        if (!period) { skipped++; continue; }
        const unit = s.credit_unit_label;
        const ok = await notifyOnce({
          recipient: r,
          kind: "target_reminder",
          key: `target_reminder:${r.userId}:${year}:${period}`,
          payload: {
            name: r.name,
            yearLabel: p.creditYearLabel,
            target: `${formatCredits(p.target)} ${unit}`,
            completed: `${formatCredits(p.completed)} ${unit}`,
            remaining: `${formatCredits(p.remaining)} ${unit}`,
            percent: `${Math.round(p.percent)}%`,
            daysRemaining: p.daysRemaining,
            pace: p.requiredPace !== null ? `${formatCredits(p.requiredPace)} ${unit} per month` : null,
            status: STATUS_LABEL[p.status],
            coursesUrl: `${appBaseUrl()}/pro/learning`,
          },
          inApp: {
            title: "Learning target reminder",
            body: `${formatCredits(p.remaining)} ${unit} remaining to reach your ${p.creditYearLabel} target of ${formatCredits(p.target)} (${Math.round(p.percent)}% complete, ${p.daysRemaining} days left).`,
            link: "/pro/learning/profile",
            referenceType: "learning_target",
          },
        });
        if (ok) sent++;
        else skipped++;
      } catch (err) {
        skipped++;
        console.error("[learning] reminder failed for a learner:", err instanceof Error ? err.message : err);
      }
    }
    return { checked: people.length, sent, skipped };
  },

  /** Opportunistic background reminder run, at most every 6 hours per server process (idempotent anyway). */
  scheduleReminderSweep(minIntervalMs = 6 * 60 * 60 * 1000) {
    if (reminderRunning || Date.now() - lastReminderRun < minIntervalMs) return;
    lastReminderRun = Date.now();
    background("reminder sweep", async () => {
      reminderRunning = this.runReminders();
      try {
        await reminderRunning;
      } finally {
        reminderRunning = null;
      }
    });
  },

  /** Admin retry of a failed (or stuck pending) email. The in-app notification already exists, so only the email is re-sent. */
  async retry(deliveryId: string): Promise<DeliveryRecord | null> {
    const d = await Repo.getDelivery(deliveryId);
    if (!d || (d.status !== "failed" && d.status !== "pending")) return d;
    if (d.attempts >= MAX_ATTEMPTS) {
      await Repo.finishDelivery(d.id, { status: "failed", last_error: `Gave up after ${d.attempts} attempts` });
      return Repo.getDelivery(deliveryId);
    }
    // Re-read the current address in case the learner fixed it.
    const [r] = await recipients([d.user_id]);
    if (r?.email && r.email !== d.recipient_email) await Repo.finishDelivery(d.id, { status: d.status, recipient_email: r.email });
    await send({ ...d, recipient_email: r?.email ?? d.recipient_email }, ["failed", "pending"]);
    return Repo.getDelivery(deliveryId);
  },

  subjectOf(d: DeliveryRecord): string {
    try {
      return render(d.kind, d.payload).subject;
    } catch {
      return d.kind;
    }
  },
};
