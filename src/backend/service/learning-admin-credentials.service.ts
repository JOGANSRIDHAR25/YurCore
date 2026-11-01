import "server-only";

import { randomUUID } from "crypto";
import { z } from "zod";
import { AuthorizationError, NotFoundError, ValidationError } from "@/shared/api/api-error";
import type { AuthUser } from "@/shared/auth/auth.types";
import { ROLES } from "@/shared/security/roles";
import type { AdminCertificateRow, AdminLearningSettings, CourseFeedbackRow, DeliveryRow, LearningCategory } from "@/shared/learning/types";
import { LearningRepository } from "../repo/learning.repo";
import { CERTIFICATE_BUCKET, PRACTITIONER_DB_ROLES, LearningProfileRepository as Repo, type SettingsRow, type SettingsWrite } from "../repo/learning-profile.repo";
import { createClient } from "@/shared/db/supabase.server";
import { LearningCredentials as Cred } from "./learning-credentials.service";
import { LearningNotify } from "./learning-notify.service";
import { UUID } from "./learning-common";
import { feedbackTitleFor } from "./learning.service";

/**
 * Admin management of categories, learning settings (targets, credit year, issuer, reminders), certificates
 * (revoke / reissue), manual credit adjustments, learning email deliveries and course feedback.
 * Admin roles only; every method starts with requireAdmin.
 */

function requireAdmin(user: AuthUser) {
  if (user.role !== ROLES.ADMIN && user.role !== ROLES.SUPER_ADMIN) throw new AuthorizationError("Only administrators can manage learning settings");
}

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const r = schema.safeParse(input);
  if (!r.success) throw new ValidationError(r.error.issues[0]?.message ?? "Invalid input");
  return r.data;
}

const oneDecimal = z.number().refine((n) => Math.round(n * 10) === n * 10, "Use at most one decimal place");
const categoryName = z.string().trim().min(1, "Category name is required").max(80, "Category name is too long");

export const categoryInputSchema = z.object({ name: categoryName });
export const categoryUpdateSchema = z.object({ name: categoryName.optional(), active: z.boolean().optional(), position: z.number().int().min(0).max(10000).optional() });

export const settingsSchema = z
  .object({
    creditYearStartMonth: z.number().int().min(1).max(12),
    defaultTarget: oneDecimal.pipe(z.number().positive("The default target must be greater than 0").max(9999)),
    minimumTarget: oneDecimal.pipe(z.number().min(0).max(9999)),
    countedCreditTypes: z.array(z.enum(["cme", "participation", "manual"])).min(1, "At least one credit type must count toward the target"),
    creditUnit: z.string().trim().min(1).max(40),
    issuerName: z.string().trim().min(1, "Issuer name is required").max(160),
    issuerAddress: z.string().trim().max(300),
    signatoryName: z.string().trim().max(120),
    signatoryTitle: z.string().trim().max(160),
    accreditationStatement: z.string().trim().max(400),
    newCourseEmailsEnabled: z.boolean(),
    remindersEnabled: z.boolean(),
    reminderMonthly: z.boolean(),
    reminderOnlyWhenBehind: z.boolean(),
    reminderYearEndDays: z.array(z.number().int().min(1).max(366)).max(6),
  })
  .partial()
  .refine((s) => s.defaultTarget === undefined || s.minimumTarget === undefined || s.defaultTarget >= s.minimumTarget, "The default target cannot be lower than the minimum target");

export const revokeSchema = z.object({ reason: z.string().trim().min(3, "Give a reason for revoking").max(500) });
export const reissueSchema = z.object({
  reason: z.string().trim().min(3, "Give a reason for reissuing").max(500),
  learnerName: z.string().trim().min(2).max(160).optional(),
  qualification: z.string().trim().max(200).nullable().optional(),
  registrationNumber: z.string().trim().max(200).nullable().optional(),
});
export const adjustmentSchema = z.object({
  userId: z.string().regex(UUID, "Choose a practitioner"),
  credits: oneDecimal.pipe(z.number().min(-999).max(999).refine((n) => n !== 0, "Credits cannot be 0")),
  reason: z.string().trim().min(3, "A reason is required for every manual adjustment").max(500),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date").optional(),
});

async function toSettingsDto(s: SettingsRow): Promise<AdminLearningSettings> {
  let signatureUrl: string | null = null;
  if (s.signature_path) {
    const { data } = await createClient().storage.from(CERTIFICATE_BUCKET).createSignedUrl(s.signature_path, 600);
    signatureUrl = data?.signedUrl ?? null;
  }
  return {
    ...Cred.publicSettings(s),
    countedCreditTypes: s.counted_credit_types,
    issuerName: s.issuer_name,
    issuerAddress: s.issuer_address,
    signatoryName: s.signatory_name,
    signatoryTitle: s.signatory_title,
    signatureUrl,
    accreditationStatement: s.accreditation_statement,
    newCourseEmailsEnabled: s.new_course_emails_enabled,
    remindersEnabled: s.reminders_enabled,
    reminderMonthly: s.reminder_monthly,
    reminderOnlyWhenBehind: s.reminder_only_when_behind,
    reminderYearEndDays: s.reminder_year_end_days,
  };
}

export class LearningAdminCredentialsService {
  // ---------- categories ----------
  static async categories(user: AuthUser): Promise<(LearningCategory & { courses: number })[]> {
    requireAdmin(user);
    const [rows, counts] = await Promise.all([Repo.listCategories(false), Repo.courseCountsByCategory()]);
    return rows.map((c) => ({ id: c.id, name: c.name, active: c.is_active, courses: counts.get(c.id) ?? 0 }));
  }

  static async createCategory(user: AuthUser, input: unknown): Promise<LearningCategory> {
    requireAdmin(user);
    const { name } = parse(categoryInputSchema, input);
    const position = (await Repo.listCategories(false)).length;
    try {
      const c = await Repo.insertCategory(name, position);
      return { id: c.id, name: c.name, active: c.is_active };
    } catch (err) {
      if ((err as { duplicate?: boolean }).duplicate) throw new ValidationError(`A category named "${name}" already exists`);
      throw err;
    }
  }

  /** Rename / activate / deactivate. Deactivated categories disappear from setup and filters; saved interests are kept. */
  static async updateCategory(user: AuthUser, id: string, input: unknown): Promise<LearningCategory> {
    requireAdmin(user);
    if (!UUID.test(id)) throw new ValidationError("Invalid category");
    const data = parse(categoryUpdateSchema, input);
    const [existing] = await Repo.getCategories([id]);
    if (!existing) throw new NotFoundError("Category not found");
    try {
      const c = await Repo.updateCategory(id, { ...(data.name !== undefined ? { name: data.name } : {}), ...(data.active !== undefined ? { is_active: data.active } : {}), ...(data.position !== undefined ? { position: data.position } : {}) });
      // Keep the primary category text on courses in step with a rename.
      if (data.name !== undefined && data.name !== existing.name) {
        const courseIds = await Repo.courseIdsInCategories([id]);
        for (const row of await LearningRepository.listCourses({ ids: courseIds })) {
          if (row.category_name === existing.name) await LearningRepository.updateCourse(row.id, { category_name: data.name });
        }
      }
      return { id: c.id, name: c.name, active: c.is_active };
    } catch (err) {
      if ((err as { duplicate?: boolean }).duplicate) throw new ValidationError(`A category named "${data.name}" already exists`);
      throw err;
    }
  }

  // ---------- settings ----------
  static async settings(user: AuthUser): Promise<AdminLearningSettings> {
    requireAdmin(user);
    return toSettingsDto(await Cred.settings());
  }

  static async updateSettings(user: AuthUser, input: unknown): Promise<AdminLearningSettings> {
    requireAdmin(user);
    const d = parse(settingsSchema, input);
    const current = await Cred.settings();
    const def = d.defaultTarget ?? Cred.defaultTarget(current);
    const min = d.minimumTarget ?? Number(current.minimum_target);
    if (def < min) throw new ValidationError("The default target cannot be lower than the minimum target");
    const patch: SettingsWrite = {};
    if (d.creditYearStartMonth !== undefined) patch.credit_year_start_month = d.creditYearStartMonth;
    if (d.defaultTarget !== undefined) patch.default_targets = { ...current.default_targets, doctor: d.defaultTarget };
    if (d.minimumTarget !== undefined) patch.minimum_target = d.minimumTarget;
    if (d.countedCreditTypes !== undefined) patch.counted_credit_types = [...new Set(d.countedCreditTypes)];
    if (d.creditUnit !== undefined) patch.credit_unit_label = d.creditUnit;
    if (d.issuerName !== undefined) patch.issuer_name = d.issuerName;
    if (d.issuerAddress !== undefined) patch.issuer_address = d.issuerAddress;
    if (d.signatoryName !== undefined) patch.signatory_name = d.signatoryName;
    if (d.signatoryTitle !== undefined) patch.signatory_title = d.signatoryTitle;
    if (d.accreditationStatement !== undefined) patch.accreditation_statement = d.accreditationStatement;
    if (d.newCourseEmailsEnabled !== undefined) patch.new_course_emails_enabled = d.newCourseEmailsEnabled;
    if (d.remindersEnabled !== undefined) patch.reminders_enabled = d.remindersEnabled;
    if (d.reminderMonthly !== undefined) patch.reminder_monthly = d.reminderMonthly;
    if (d.reminderOnlyWhenBehind !== undefined) patch.reminder_only_when_behind = d.reminderOnlyWhenBehind;
    if (d.reminderYearEndDays !== undefined) patch.reminder_year_end_days = [...new Set(d.reminderYearEndDays)].sort((a, b) => b - a);
    return toSettingsDto(await Repo.updateSettings(patch, user.id));
  }

  /** Signature image (PNG/JPEG, ≤ 1 MB) for certificates, uploaded as base64. Pass null to remove it. */
  static async setSignature(user: AuthUser, input: unknown): Promise<AdminLearningSettings> {
    requireAdmin(user);
    const d = parse(z.object({ dataUrl: z.string().max(1_500_000).nullable() }), input);
    if (d.dataUrl === null) return toSettingsDto(await Repo.updateSettings({ signature_path: null }, user.id));
    const m = /^data:(image\/png|image\/jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(d.dataUrl);
    if (!m) throw new ValidationError("Upload a PNG or JPEG image");
    const buf = Buffer.from(m[2], "base64");
    if (buf.length > 1_000_000) throw new ValidationError("The signature image must be 1 MB or smaller");
    const path = `settings/signature-${randomUUID()}.${m[1] === "image/png" ? "png" : "jpg"}`;
    await Repo.uploadAsset(path, buf, m[1]);
    return toSettingsDto(await Repo.updateSettings({ signature_path: path }, user.id));
  }

  // ---------- certificates ----------
  static async certificates(user: AuthUser, filter: { q?: string; courseId?: string }): Promise<AdminCertificateRow[]> {
    requireAdmin(user);
    const rows = await Repo.listCertificates({ q: filter.q?.slice(0, 100), courseId: filter.courseId && UUID.test(filter.courseId) ? filter.courseId : undefined, limit: 500 });
    const users = await Repo.getUsers([...new Set(rows.map((r) => r.user_id))]);
    return rows.map((r) => ({ ...Cred.toDto(r), userId: r.user_id, email: users.get(r.user_id)?.email ?? null }));
  }

  private static async loadCertificate(id: string) {
    if (!UUID.test(id)) throw new ValidationError("Invalid certificate");
    const cert = await Repo.getCertificate(id);
    if (!cert) throw new NotFoundError("Certificate not found");
    return cert;
  }

  /** Revoke with a reason: the verify page shows Revoked and the credits are reversed by new negative ledger rows. */
  static async revokeCertificate(user: AuthUser, id: string, input: unknown): Promise<AdminCertificateRow> {
    requireAdmin(user);
    const { reason } = parse(revokeSchema, input);
    const cert = await this.loadCertificate(id);
    if (cert.status === "revoked") throw new ValidationError("This certificate is already revoked");
    await Repo.revokeCertificate(id, reason, user.id);
    return (await this.certificates(user, { q: cert.certificate_number }))[0];
  }

  /** Reissue (e.g. a name correction): same number, version + 1, previous details kept in the history. Credits are unchanged. */
  static async reissueCertificate(user: AuthUser, id: string, input: unknown): Promise<AdminCertificateRow> {
    requireAdmin(user);
    const d = parse(reissueSchema, input);
    const cert = await this.loadCertificate(id);
    if (cert.status === "revoked") throw new ValidationError("A revoked certificate cannot be reissued");
    // Without explicit corrections, the learner's current profile details are used.
    const who = await Cred.identity(cert.user_id);
    await Repo.reissueCertificate(
      cert,
      {
        learner_name: d.learnerName ?? who.name,
        qualification: d.qualification !== undefined ? d.qualification || null : who.qualification,
        registration_number: d.registrationNumber !== undefined ? d.registrationNumber || null : who.registrationNumber,
      },
      d.reason,
      user.id,
    );
    const updated = await this.loadCertificate(id);
    await Cred.ensurePdf(updated).catch((err) => console.error("[learning] reissue PDF render failed:", err instanceof Error ? err.message : err));
    return (await this.certificates(user, { q: cert.certificate_number }))[0];
  }

  static async certificateDownload(user: AuthUser, id: string): Promise<{ url: string }> {
    requireAdmin(user);
    const cert = await this.loadCertificate(id);
    return { url: await Repo.signedCertificateUrl(await Cred.ensurePdf(cert), Cred.fileName(cert)) };
  }

  // ---------- credits ----------
  /** Manual adjustment (positive or negative), always with a recorded reason and the admin who made it. */
  static async adjustCredits(user: AuthUser, input: unknown): Promise<{ id: string }> {
    requireAdmin(user);
    const d = parse(adjustmentSchema, input);
    const target = (await Repo.getUsers([d.userId])).get(d.userId);
    if (!target || !PRACTITIONER_DB_ROLES.includes(target.role)) throw new ValidationError("Manual credits can only be added for practitioners");
    // A date is interpreted as midday IST, so it always falls in the intended credit year.
    const awardedOn = d.date ? new Date(`${d.date}T12:00:00+05:30`).toISOString() : new Date().toISOString();
    const row = await Repo.insertManualAdjustment({ user_id: d.userId, credits: d.credits, reason: d.reason, awarded_on: awardedOn, created_by: user.id });
    if (d.credits > 0) LearningNotify.background("target check", () => LearningNotify.checkTargetMet(d.userId));
    return { id: row.id };
  }

  /** Target progress for every learner with a learning profile (current credit year). */
  static async learnerProgress(user: AuthUser) {
    requireAdmin(user);
    const settings = await Cred.settings();
    const ids = await Repo.learnersWithProfile();
    const [pros, users] = await Promise.all([Repo.getPractitionerProfiles(ids), Repo.getUsers(ids)]);
    const rows = await Promise.all(
      ids.map(async (id) => {
        const p = await Cred.progress(id, settings);
        return { userId: id, name: pros.get(id)?.full_name ?? "Practitioner", email: users.get(id)?.email ?? null, target: p.target, completed: p.completed, remaining: p.remaining, percent: p.percent, status: p.status };
      }),
    );
    return { year: Cred.currentYear(settings), unit: settings.credit_unit_label, rows: rows.sort((a, b) => a.name.localeCompare(b.name)) };
  }

  // ---------- deliveries ----------
  static async deliveries(user: AuthUser, filter: { status?: string | null }): Promise<DeliveryRow[]> {
    requireAdmin(user);
    const status = filter.status && ["pending", "sent", "failed", "skipped"].includes(filter.status) ? [filter.status as DeliveryRow["status"]] : undefined;
    const rows = await Repo.findDeliveries({ status, limit: 300 });
    const pros = await Repo.getPractitionerProfiles([...new Set(rows.map((r) => r.user_id))]);
    return rows.map((d) => ({
      id: d.id,
      kind: d.kind,
      recipient: d.recipient_email,
      learnerName: pros.get(d.user_id)?.full_name ?? "Practitioner",
      subject: LearningNotify.subjectOf(d),
      status: d.status,
      attempts: d.attempts,
      lastError: d.last_error,
      createdAt: d.created_at,
      sentAt: d.sent_at,
    }));
  }

  static async retryDelivery(user: AuthUser, id: string): Promise<void> {
    requireAdmin(user);
    if (!UUID.test(id)) throw new ValidationError("Invalid delivery");
    const d = await LearningNotify.retry(id);
    if (!d) throw new NotFoundError("Delivery not found");
    if (d.status === "sent" || d.status === "skipped") return;
    if (d.status === "failed") throw new ValidationError(`The email could not be sent: ${d.last_error ?? "unknown error"}`);
  }

  static async runReminders(user: AuthUser) {
    requireAdmin(user);
    return LearningNotify.runReminders();
  }

  // ---------- course feedback ----------
  static async courseFeedback(user: AuthUser, courseId: string): Promise<{ title: string; enabled: boolean; average: number | null; count: number; rows: CourseFeedbackRow[] }> {
    requireAdmin(user);
    if (!UUID.test(courseId)) throw new ValidationError("Invalid course");
    const course = await LearningRepository.getCourse(courseId);
    if (!course) throw new NotFoundError("Course not found");
    const rows = await Repo.listFeedback(courseId);
    const pros = await Repo.getPractitionerProfiles(rows.map((r) => r.user_id));
    const average = rows.length ? Math.round((rows.reduce((n, r) => n + r.rating, 0) / rows.length) * 10) / 10 : null;
    return {
      title: feedbackTitleFor(course),
      enabled: course.feedback_enabled,
      average,
      count: rows.length,
      rows: rows.map((r) => ({ userId: r.user_id, name: pros.get(r.user_id)?.full_name ?? "Practitioner", rating: r.rating, comment: r.comment, submittedAt: r.updated_at })),
    };
  }

  /** Search practitioners for manual adjustments. */
  static async searchLearners(user: AuthUser, q: string) {
    requireAdmin(user);
    return (await LearningRepository.searchPractitioners(q.slice(0, 100))).map((p) => ({ id: p.user_id, name: p.full_name }));
  }
}
