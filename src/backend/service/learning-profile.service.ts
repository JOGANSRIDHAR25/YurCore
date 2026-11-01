import "server-only";

import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { z } from "zod";
import { CreditsPdfDocument } from "@/components/learning/CreditsPdfDocument";
import { AuthorizationError, NotFoundError, ValidationError } from "@/shared/api/api-error";
import type { AuthUser } from "@/shared/auth/auth.types";
import { ROLES } from "@/shared/security/roles";
import { SITE_NAME } from "@/shared/config/site";
import { CREDIT_TYPE_LABEL, annualHistory, creditYearLabel, formatCredits } from "@/shared/learning/credits";
import type { CertificateDto, CreditsOverview, LearningCategory, LearningProfile, LedgerEntry, TargetSummary } from "@/shared/learning/types";
import { LearningRepository } from "../repo/learning.repo";
import { LearningProfileRepository as Repo, type CategoryRow, type SettingsRow } from "../repo/learning-profile.repo";
import { LearningCredentials as Cred } from "./learning-credentials.service";
import { LearningNotify } from "./learning-notify.service";
import { UUID } from "./learning-common";

/**
 * The learner's Learning Profile: interests, yearly target, credit progress, credit ledger and certificates.
 * Practitioners only, and always the caller's own records: no endpoint takes a user id from the client.
 */

const targetValue = z.number({ error: "Enter your annual target" }).finite().positive("The target must be greater than 0").max(9999, "The target is too large");
// No upper limit: a learner may favourite every category. Ids are checked against the active categories, so the
// list can never be longer than the category list.
const interestIds = z.array(z.string().regex(UUID, "Invalid category")).max(500, "Too many categories");

export const setupSchema = z.object({ categoryIds: interestIds, target: targetValue });
export const interestsSchema = z.object({ categoryIds: interestIds });
export const targetSchema = z.object({ target: targetValue });

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const r = schema.safeParse(input);
  if (!r.success) throw new ValidationError(r.error.issues[0]?.message ?? "Invalid input");
  return r.data;
}

const toCategory = (c: CategoryRow): LearningCategory => ({ id: c.id, name: c.name, active: c.is_active });
/** Targets use one decimal place, like credits. */
const oneDecimal = (n: number) => Math.round(n * 10) / 10;

async function requirePractitioner(user: AuthUser) {
  if (user.role !== ROLES.DOCTOR) throw new AuthorizationError(`${SITE_NAME} Learning is available to practitioners only`);
  if (!(await LearningRepository.getPractitioner(user.id))) throw new AuthorizationError("No practitioner profile found for this account");
}

/** Validates interest ids against the admin's active categories. At least one is required when any category exists. */
async function validateInterests(ids: string[]): Promise<string[]> {
  const unique = [...new Set(ids)];
  const active = await Repo.listCategories(true);
  if (unique.some((id) => !active.some((c) => c.id === id))) throw new ValidationError("One of the selected categories is no longer available. Please choose again.");
  if (active.length > 0 && unique.length === 0) throw new ValidationError("Choose at least one category");
  return unique;
}

function validateTarget(target: number, settings: SettingsRow): number {
  const t = oneDecimal(target);
  const min = Number(settings.minimum_target);
  if (t < min) throw new ValidationError(`Your target cannot be lower than the minimum of ${formatCredits(min)} ${settings.credit_unit_label}`);
  return t;
}

export class LearningProfileService {
  static async profile(user: AuthUser): Promise<LearningProfile> {
    await requirePractitioner(user);
    const settings = await Cred.settings();
    const year = Cred.currentYear(settings);
    const [all, interestIds, saved, lastSaved, targets, ledger] = await Promise.all([
      Repo.listCategories(false),
      Repo.listInterests(user.id),
      Repo.getTarget(user.id, year),
      Repo.getTarget(user.id, year - 1),
      Repo.listUserTargets(user.id),
      Repo.listLedger(user.id),
    ]);
    const active = all.filter((c) => c.is_active);
    // Deactivated categories drop out of the learner's interests (shown nowhere) but stay stored, so reactivating restores them.
    const interests = interestIds.map((id) => all.find((c) => c.id === id)).filter((c): c is CategoryRow => Boolean(c?.is_active)).map(toCategory);
    const firstTime = interestIds.length === 0 && !saved && !lastSaved;
    const needsInterests = active.length > 0 && interests.length === 0;
    const progress = saved ? await this.summary(user.id, settings, year) : null;
    // Each credit year stands alone: credits count only in the year of their award date (IST) and targets are per year.
    const credits = Cred.countedRows(ledger, settings).map((r) => ({ year: Cred.currentYear(settings, new Date(r.awarded_on)), credits: r.credits }));
    const history = annualHistory({ currentYear: year, startMonth: settings.credit_year_start_month, targets, credits });
    const hadLastYear = Boolean(lastSaved) || credits.some((c) => c.year === year - 1);
    const lastYearProgress = hadLastYear ? await Cred.progress(user.id, settings, { year: year - 1 }) : null;
    // Profile load is also when a newly met target is noticed (idempotent: never notifies twice).
    if (progress?.status === "target_met") LearningNotify.background("target check", () => LearningNotify.checkTargetMet(user.id, settings));
    LearningNotify.scheduleReminderSweep();
    return {
      needsSetup: needsInterests || !saved,
      firstTime,
      interests,
      categories: active.map(toCategory),
      settings: Cred.publicSettings(settings),
      savedTarget: saved?.target_credits ?? null,
      progress,
      history,
      lastYear: lastYearProgress ? { label: creditYearLabel(year - 1, settings.credit_year_start_month), target: lastSaved?.target_credits ?? null, completed: lastYearProgress.completed } : null,
    };
  }

  private static async summary(userId: string, settings: SettingsRow, year: number): Promise<TargetSummary> {
    const { rows: _rows, ...p } = await Cred.progress(userId, settings, { year });
    void _rows;
    return p;
  }

  /** Learning Setup: interests and this year's target, saved together. Nothing is saved if either is invalid. */
  static async saveSetup(user: AuthUser, input: unknown): Promise<LearningProfile> {
    await requirePractitioner(user);
    const data = parse(setupSchema, input);
    const settings = await Cred.settings();
    const ids = await validateInterests(data.categoryIds);
    const target = validateTarget(data.target, settings);
    await Repo.setInterests(user.id, ids);
    await Repo.saveTarget(user.id, Cred.currentYear(settings), target, "learner");
    return this.profile(user);
  }

  static async updateInterests(user: AuthUser, input: unknown): Promise<LearningProfile> {
    await requirePractitioner(user);
    const ids = await validateInterests(parse(interestsSchema, input).categoryIds);
    await Repo.setInterests(user.id, ids);
    return this.profile(user);
  }

  /** Changes this credit year's target only; earlier years and awarded credits are never touched. */
  static async updateTarget(user: AuthUser, input: unknown): Promise<LearningProfile> {
    await requirePractitioner(user);
    const settings = await Cred.settings();
    const target = validateTarget(parse(targetSchema, input).target, settings);
    await Repo.saveTarget(user.id, Cred.currentYear(settings), target, "learner");
    LearningNotify.background("target check", () => LearningNotify.checkTargetMet(user.id, settings));
    return this.profile(user);
  }

  // ---------- credits ----------
  static async credits(user: AuthUser, filter: { year?: number | null; type?: string | null } = {}): Promise<CreditsOverview> {
    await requirePractitioner(user);
    const settings = await Cred.settings();
    const current = Cred.currentYear(settings);
    const all = await Repo.listLedger(user.id);
    const counted = Cred.countedRows(all, settings);
    const yearOf = (iso: string) => Cred.currentYear(settings, new Date(iso));
    const sum = (rows: typeof all) => oneDecimal(rows.reduce((n, r) => n + r.credits, 0));
    const certIds = [...new Set(all.map((r) => r.certificate_id).filter((x): x is string => Boolean(x)))];
    const certs = new Map((await Promise.all(certIds.map((id) => Repo.getCertificate(id)))).filter(Boolean).map((c) => [c!.id, c!]));
    // A reversal row has no certificate of its own: link it to the original award's certificate.
    const byId = new Map(all.map((r) => [r.id, r]));
    const years = [...new Set([current, ...all.map((r) => yearOf(r.awarded_on))])].sort((a, b) => b - a);
    const type = filter.type && ["cme", "participation", "manual"].includes(filter.type) ? filter.type : null;
    const entries: LedgerEntry[] = all
      .filter((r) => (filter.year ? yearOf(r.awarded_on) === filter.year : true) && (type ? r.credit_type === type : true))
      .map((r) => {
        const certId = r.certificate_id ?? (r.reverses_id ? byId.get(r.reverses_id)?.certificate_id ?? null : null);
        return {
          id: r.id,
          date: r.awarded_on,
          courseId: r.course_id,
          courseTitle: r.course_title,
          creditType: r.credit_type,
          credits: r.credits,
          reason: r.reason,
          certificateId: certId,
          certificateNumber: certId ? certs.get(certId)?.certificate_number ?? null : null,
          reverses: Boolean(r.reverses_id),
        };
      });
    return {
      years: years.map((y) => ({ year: y, label: creditYearLabel(y, settings.credit_year_start_month) })),
      totals: { thisYear: sum(counted.filter((r) => yearOf(r.awarded_on) === current)), lastYear: sum(counted.filter((r) => yearOf(r.awarded_on) === current - 1)), lifetime: sum(counted) },
      entries,
    };
  }

  /** CSV export of the (filtered) ledger, for submission to a council or employer. */
  static async creditsCsv(user: AuthUser, filter: { year?: number | null; type?: string | null }): Promise<string> {
    const data = await this.credits(user, filter);
    const cell = (v: string | number | null) => {
      const s = v === null ? "" : String(v);
      return /[",\n]/.test(s) || /^[=+\-@]/.test(s) ? `"${s.replace(/"/g, '""').replace(/^([=+\-@])/, "'$1")}"` : s;
    };
    const lines = [["Date (IST)", "Course", "Credit type", "Credits", "Reason", "Certificate"].join(",")];
    for (const e of data.entries) {
      const date = new Date(e.date).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
      lines.push([date, e.courseTitle ?? "", CREDIT_TYPE_LABEL[e.creditType], formatCredits(e.credits), e.reason, e.certificateNumber ?? ""].map(cell).join(","));
    }
    lines.push("", ["Total", "", "", formatCredits(oneDecimal(data.entries.reduce((n, e) => n + e.credits, 0))), "", ""].map(cell).join(","));
    return lines.join("\n");
  }

  /** PDF statement of the (filtered) ledger. */
  static async creditsPdf(user: AuthUser, filter: { year?: number | null; type?: string | null }): Promise<Buffer> {
    const [data, settings, who] = await Promise.all([this.credits(user, filter), Cred.settings(), Cred.identity(user.id)]);
    const period = filter.year ? data.years.find((y) => y.year === filter.year)?.label ?? String(filter.year) : "All years";
    const typeLabel = filter.type && filter.type in CREDIT_TYPE_LABEL ? ` · ${CREDIT_TYPE_LABEL[filter.type as keyof typeof CREDIT_TYPE_LABEL]}` : "";
    const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
    const doc = React.createElement(CreditsPdfDocument, {
      data: {
        learnerName: who.name,
        credentials: [who.qualification, who.registrationNumber && `Reg. No. ${who.registrationNumber}`].filter(Boolean).join(" · ") || null,
        periodLabel: period + typeLabel,
        generatedOn: fmt(new Date().toISOString()),
        rows: data.entries.map((e) => ({ date: fmt(e.date), course: e.courseTitle ?? "—", type: CREDIT_TYPE_LABEL[e.creditType], credits: (e.credits > 0 ? "+" : "") + formatCredits(e.credits), reason: e.reason, certificate: e.certificateNumber ?? "" })),
        total: formatCredits(oneDecimal(data.entries.reduce((n, e) => n + e.credits, 0))),
        unit: settings.credit_unit_label,
      },
    });
    return renderToBuffer(doc as Parameters<typeof renderToBuffer>[0]);
  }

  // ---------- certificates ----------
  static async certificates(user: AuthUser): Promise<CertificateDto[]> {
    await requirePractitioner(user);
    return (await Repo.listCertificates({ userId: user.id })).map((c) => Cred.toDto(c));
  }

  /** A short-lived download URL for the learner's own certificate (rendered first if the stored PDF is missing or outdated). */
  static async certificateDownload(user: AuthUser, id: string): Promise<{ url: string; fileName: string }> {
    await requirePractitioner(user);
    if (!UUID.test(id)) throw new ValidationError("Invalid certificate");
    const cert = await Repo.getCertificate(id);
    if (!cert || cert.user_id !== user.id) throw new NotFoundError("Certificate not found");
    if (cert.status === "revoked") throw new ValidationError("This certificate has been revoked and can no longer be downloaded");
    const path = await Cred.ensurePdf(cert);
    return { url: await Repo.signedCertificateUrl(path, Cred.fileName(cert)), fileName: Cred.fileName(cert) };
  }

  // ---------- recommendations ----------
  /**
   * "Recommended for You": published courses the learner has not completed, ranked by (1) matching interests,
   * (2) how well the course's credits close the remaining gap before year end, (3) newest first.
   */
  static async recommendations(user: AuthUser, limit = 8) {
    await requirePractitioner(user);
    const settings = await Cred.settings();
    const [interests, enrollments, progress] = await Promise.all([Repo.listInterests(user.id), LearningRepository.listUserEnrollments(user.id), Cred.progress(user.id, settings)]);
    const done = new Set(enrollments.filter((e) => e.completed_at).map((e) => e.course_id));
    const interestCourses = new Set(await Repo.courseIdsInCategories(interests));
    const pool = await LearningRepository.listPublishedCards({ limit: 200 });
    const remaining = progress.remaining;
    const gapScore = (credits: number) => (credits <= 0 || remaining <= 0 ? 0 : 1 - Math.min(Math.abs(remaining - credits), remaining) / remaining);
    return {
      remaining,
      ids: pool
        .filter((c) => !done.has(c.id))
        .map((c, i) => ({ id: c.id, match: interestCourses.has(c.id) ? 1 : 0, gap: gapScore(Number(c.credits)), recency: i }))
        .sort((a, b) => b.match - a.match || b.gap - a.gap || a.recency - b.recency)
        .slice(0, limit),
      interestCourses,
    };
  }
}
