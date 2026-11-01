import { createClient } from "@/shared/db/supabase.server";
import type { CourseRating } from "@/shared/learning/types";

/**
 * Data access for the learning profile, credits, course feedback, certificates and learning deliveries
 * (migration 20261028000000_learning_credits_certificates.sql). Server-side only (service role).
 * The credit ledger is append-only: this file only ever inserts into it.
 */

export type CategoryRow = { id: string; name: string; is_active: boolean; position: number; created_at: string };

export type SettingsRow = {
  credit_year_start_month: number;
  default_targets: Record<string, number>;
  minimum_target: number;
  counted_credit_types: ("cme" | "participation" | "manual")[];
  credit_unit_label: string;
  issuer_name: string;
  issuer_address: string;
  signatory_name: string;
  signatory_title: string;
  signature_path: string | null;
  accreditation_statement: string;
  new_course_emails_enabled: boolean;
  reminders_enabled: boolean;
  reminder_monthly: boolean;
  reminder_only_when_behind: boolean;
  reminder_year_end_days: number[];
  updated_at: string;
};
export type SettingsWrite = Partial<Omit<SettingsRow, "updated_at">>;

export type TargetRow = { id: string; user_id: string; credit_year: number; target_credits: number; set_by: "learner" | "admin"; updated_at: string };

export type FeedbackRow = { id: string; course_id: string; user_id: string; rating: number; comment: string; submitted_at: string; updated_at: string };

export type CertificateRow = {
  id: string;
  certificate_number: string;
  user_id: string;
  course_id: string;
  enrollment_id: string | null;
  learner_name: string;
  qualification: string | null;
  registration_number: string | null;
  course_title: string;
  credits_awarded: number;
  credit_type: "cme" | "participation";
  completed_at: string;
  issued_at: string;
  status: "valid" | "revoked";
  revoke_reason: string | null;
  revoked_at: string | null;
  version: number;
  pdf_path: string | null;
  pdf_version: number | null;
};

export type LedgerRow = {
  id: string;
  user_id: string;
  course_id: string | null;
  course_title: string | null;
  certificate_id: string | null;
  credit_type: "cme" | "participation" | "manual";
  credits: number;
  reason: string;
  awarded_on: string;
  reverses_id: string | null;
  created_by: string | null;
  created_at: string;
};

export type DeliveryKind = "new_course" | "target_reminder" | "target_met" | "course_completed";
export type DeliveryStatus = "pending" | "sent" | "failed" | "skipped";
export type DeliveryRecord = {
  id: string;
  user_id: string;
  kind: DeliveryKind;
  dedupe_key: string;
  course_id: string | null;
  certificate_id: string | null;
  recipient_email: string | null;
  payload: Record<string, unknown>;
  status: DeliveryStatus;
  attempts: number;
  last_error: string | null;
  created_at: string;
  sent_at: string | null;
};

const T = {
  categories: "meyveda_learning_categories",
  courseCategories: "meyveda_learning_course_categories",
  settings: "meyveda_learning_settings",
  interests: "meyveda_learning_user_interests",
  targets: "meyveda_learning_targets",
  feedback: "meyveda_learning_course_feedback",
  certificates: "meyveda_learning_certificates",
  versions: "meyveda_learning_certificate_versions",
  ledger: "meyveda_learning_credit_ledger",
  deliveries: "meyveda_learning_deliveries",
} as const;

export const CERTIFICATE_BUCKET = "learning-certificates";

/** users.role stores "practitioner" for doctors (the auth layer maps it to ROLES.DOCTOR); accept both. */
export const PRACTITIONER_DB_ROLES = ["practitioner", "doctor"];

const db = () => createClient();
function check<T>(res: { data: T; error: { message: string; code?: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what} failed: ${res.error.message}`);
  return res.data;
}
const now = () => new Date().toISOString();
const num = <R extends Record<string, unknown>>(row: R, ...keys: (keyof R)[]): R => {
  for (const k of keys) if (row[k] !== null && row[k] !== undefined) (row as Record<string, unknown>)[k as string] = Number(row[k]);
  return row;
};
const isUniqueViolation = (e: { code?: string } | null) => e?.code === "23505";

export class LearningProfileRepository {
  // ---- categories ----
  static async listCategories(activeOnly: boolean): Promise<CategoryRow[]> {
    let q = db().from(T.categories).select("id, name, is_active, position, created_at");
    if (activeOnly) q = q.eq("is_active", true);
    return check(await q.order("position").order("name"), "category list") as CategoryRow[];
  }

  static async getCategories(ids: string[]): Promise<CategoryRow[]> {
    if (ids.length === 0) return [];
    return check(await db().from(T.categories).select("id, name, is_active, position, created_at").in("id", ids), "category lookup") as CategoryRow[];
  }

  static async insertCategory(name: string, position: number): Promise<CategoryRow> {
    const res = await db().from(T.categories).insert({ name, position }).select("id, name, is_active, position, created_at").single();
    if (isUniqueViolation(res.error)) throw Object.assign(new Error("duplicate"), { duplicate: true });
    return check(res, "category insert") as CategoryRow;
  }

  static async updateCategory(id: string, patch: Partial<Pick<CategoryRow, "name" | "is_active" | "position">>): Promise<CategoryRow> {
    const res = await db().from(T.categories).update({ ...patch, updated_at: now() }).eq("id", id).select("id, name, is_active, position, created_at").single();
    if (isUniqueViolation(res.error)) throw Object.assign(new Error("duplicate"), { duplicate: true });
    return check(res, "category update") as CategoryRow;
  }

  /** course id -> category ids, for the given courses. */
  static async courseCategoryIds(courseIds: string[]): Promise<Map<string, string[]>> {
    const map = new Map<string, string[]>();
    if (courseIds.length === 0) return map;
    const rows = check(await db().from(T.courseCategories).select("course_id, category_id").in("course_id", courseIds), "course categories") as { course_id: string; category_id: string }[];
    for (const r of rows) map.set(r.course_id, [...(map.get(r.course_id) ?? []), r.category_id]);
    return map;
  }

  /** Every course tagged with any of the categories. */
  static async courseIdsInCategories(categoryIds: string[]): Promise<string[]> {
    if (categoryIds.length === 0) return [];
    const rows = check(await db().from(T.courseCategories).select("course_id").in("category_id", categoryIds).limit(10000), "category courses") as { course_id: string }[];
    return [...new Set(rows.map((r) => r.course_id))];
  }

  static async courseCountsByCategory(): Promise<Map<string, number>> {
    const rows = check(await db().from(T.courseCategories).select("category_id").limit(10000), "category counts") as { category_id: string }[];
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.category_id, (m.get(r.category_id) ?? 0) + 1);
    return m;
  }

  /** Replaces a course's categories. */
  static async setCourseCategories(courseId: string, categoryIds: string[]): Promise<void> {
    const supabase = db();
    const existing = (check(await supabase.from(T.courseCategories).select("category_id").eq("course_id", courseId), "course categories") as { category_id: string }[]).map((r) => r.category_id);
    const remove = existing.filter((id) => !categoryIds.includes(id));
    const add = categoryIds.filter((id) => !existing.includes(id));
    if (remove.length) check(await supabase.from(T.courseCategories).delete().eq("course_id", courseId).in("category_id", remove), "course category delete");
    if (add.length) check(await supabase.from(T.courseCategories).insert(add.map((category_id) => ({ course_id: courseId, category_id }))), "course category insert");
  }

  // ---- settings ----
  static async getSettings(): Promise<SettingsRow> {
    const row = check(await db().from(T.settings).select("*").eq("id", true).maybeSingle(), "learning settings") as SettingsRow | null;
    if (!row) throw new Error("learning settings row is missing (run the learning credits migration)");
    return num(row, "minimum_target");
  }

  static async updateSettings(patch: SettingsWrite, userId: string): Promise<SettingsRow> {
    const row = check(await db().from(T.settings).update({ ...patch, updated_at: now(), updated_by: userId }).eq("id", true).select("*").single(), "learning settings update") as SettingsRow;
    return num(row, "minimum_target");
  }

  // ---- interests ----
  static async listInterests(userId: string): Promise<string[]> {
    const rows = check(await db().from(T.interests).select("category_id").eq("user_id", userId).order("created_at"), "interest list") as { category_id: string }[];
    return rows.map((r) => r.category_id);
  }

  static async setInterests(userId: string, categoryIds: string[]): Promise<void> {
    const supabase = db();
    const existing = await this.listInterests(userId);
    const remove = existing.filter((id) => !categoryIds.includes(id));
    const add = categoryIds.filter((id) => !existing.includes(id));
    if (add.length) check(await supabase.from(T.interests).upsert(add.map((category_id) => ({ user_id: userId, category_id })), { onConflict: "user_id,category_id", ignoreDuplicates: true }), "interest insert");
    if (remove.length) check(await supabase.from(T.interests).delete().eq("user_id", userId).in("category_id", remove), "interest delete");
  }

  /** Users interested in any of the categories, with their interest list. */
  static async usersInterestedIn(categoryIds: string[]): Promise<string[]> {
    if (categoryIds.length === 0) return [];
    const rows = check(await db().from(T.interests).select("user_id").in("category_id", categoryIds).limit(50000), "interested users") as { user_id: string }[];
    return [...new Set(rows.map((r) => r.user_id))];
  }

  /** Every learner who has finished setup at least once (has interests). */
  static async learnersWithProfile(): Promise<string[]> {
    const rows = check(await db().from(T.interests).select("user_id").limit(50000), "profile users") as { user_id: string }[];
    return [...new Set(rows.map((r) => r.user_id))];
  }

  // ---- targets ----
  static async getTarget(userId: string, year: number): Promise<TargetRow | null> {
    const row = check(await db().from(T.targets).select("*").eq("user_id", userId).eq("credit_year", year).maybeSingle(), "target lookup") as TargetRow | null;
    return row ? num(row, "target_credits") : null;
  }

  static async listTargets(userIds: string[], year: number): Promise<Map<string, number>> {
    if (userIds.length === 0) return new Map();
    const rows = check(await db().from(T.targets).select("user_id, target_credits").eq("credit_year", year).in("user_id", userIds), "target list") as { user_id: string; target_credits: number }[];
    return new Map(rows.map((r) => [r.user_id, Number(r.target_credits)]));
  }

  /** Every target this learner has saved, one per credit year (for the annual history). */
  static async listUserTargets(userId: string): Promise<{ year: number; target: number }[]> {
    const rows = check(await db().from(T.targets).select("credit_year, target_credits").eq("user_id", userId).order("credit_year", { ascending: false }), "target history") as { credit_year: number; target_credits: number }[];
    return rows.map((r) => ({ year: Number(r.credit_year), target: Number(r.target_credits) }));
  }

  /** Upsert for one (learner, credit year): other years are never touched. */
  static async saveTarget(userId: string, year: number, target: number, setBy: TargetRow["set_by"]): Promise<TargetRow> {
    const row = check(
      await db().from(T.targets).upsert({ user_id: userId, credit_year: year, target_credits: target, set_by: setBy, updated_at: now() }, { onConflict: "user_id,credit_year" }).select("*").single(),
      "target save",
    ) as TargetRow;
    return num(row, "target_credits");
  }

  // ---- feedback ----
  static async getFeedback(courseId: string, userId: string): Promise<FeedbackRow | null> {
    return check(await db().from(T.feedback).select("*").eq("course_id", courseId).eq("user_id", userId).maybeSingle(), "feedback lookup") as FeedbackRow | null;
  }

  /** One row per learner per course: a resubmission revises it (never a second rating). */
  static async saveFeedback(courseId: string, userId: string, rating: number, comment: string): Promise<FeedbackRow> {
    return check(
      await db().from(T.feedback).upsert({ course_id: courseId, user_id: userId, rating, comment, updated_at: now() }, { onConflict: "course_id,user_id" }).select("*").single(),
      "feedback save",
    ) as FeedbackRow;
  }

  static async listFeedback(courseId: string): Promise<FeedbackRow[]> {
    return check(await db().from(T.feedback).select("*").eq("course_id", courseId).order("submitted_at", { ascending: false }).limit(5000), "feedback list") as FeedbackRow[];
  }

  /** Rating aggregates for these courses in one call (counted in the database; see meyveda_learning_course_ratings). */
  static async courseRatings(courseIds: string[]): Promise<Map<string, CourseRating>> {
    const out = new Map<string, CourseRating>();
    if (courseIds.length === 0) return out;
    const res = await db().rpc("meyveda_learning_course_ratings", { p_course_ids: courseIds });
    // PGRST202 = function not deployed yet (migration 20261029000000 pending): count the same rows here instead.
    const rows = res.error?.code === "PGRST202" ? await ratingRowsFromFeedback(courseIds) : (check(res, "course ratings") as RatingRow[] | null);
    for (const id of courseIds) out.set(id, toRating(null));
    for (const r of rows ?? []) out.set(r.course_id, toRating(r));
    return out;
  }

  // ---- certificates ----
  /** Calls the transactional issue function (completion + feedback re-checked under a row lock). */
  static async issueCertificate(input: { userId: string; courseId: string; learnerName: string; qualification: string | null; registrationNumber: string | null }): Promise<{ certificateId: string | null; created: boolean; reason: string }> {
    const rows = check(
      await db().rpc("meyveda_learning_issue_certificate", {
        p_user_id: input.userId,
        p_course_id: input.courseId,
        p_learner_name: input.learnerName,
        p_qualification: input.qualification,
        p_registration_number: input.registrationNumber,
      }),
      "certificate issue",
    ) as { certificate_id: string | null; created: boolean; reason: string }[];
    const r = rows?.[0];
    return { certificateId: r?.certificate_id ?? null, created: Boolean(r?.created), reason: r?.reason ?? "unknown" };
  }

  static async revokeCertificate(id: string, reason: string, adminId: string): Promise<boolean> {
    return check(await db().rpc("meyveda_learning_revoke_certificate", { p_certificate_id: id, p_reason: reason, p_admin: adminId }), "certificate revoke") as boolean;
  }

  static async getCertificate(id: string): Promise<CertificateRow | null> {
    const row = check(await db().from(T.certificates).select("*").eq("id", id).maybeSingle(), "certificate lookup") as CertificateRow | null;
    return row ? num(row, "credits_awarded") : null;
  }

  static async getCertificateByNumber(number: string): Promise<CertificateRow | null> {
    const row = check(await db().from(T.certificates).select("*").eq("certificate_number", number).maybeSingle(), "certificate lookup") as CertificateRow | null;
    return row ? num(row, "credits_awarded") : null;
  }

  static async getCertificateFor(userId: string, courseId: string): Promise<CertificateRow | null> {
    const row = check(await db().from(T.certificates).select("*").eq("user_id", userId).eq("course_id", courseId).maybeSingle(), "certificate lookup") as CertificateRow | null;
    return row ? num(row, "credits_awarded") : null;
  }

  static async listCertificates(filter: { userId?: string; courseId?: string; q?: string; limit?: number }): Promise<CertificateRow[]> {
    let q = db().from(T.certificates).select("*");
    if (filter.userId) q = q.eq("user_id", filter.userId);
    if (filter.courseId) q = q.eq("course_id", filter.courseId);
    const t = filter.q?.replace(/[%,()*\\"]/g, " ").trim();
    if (t) q = q.or(`certificate_number.ilike.%${t}%,learner_name.ilike.%${t}%,course_title.ilike.%${t}%`);
    const rows = check(await q.order("issued_at", { ascending: false }).limit(filter.limit ?? 500), "certificate list") as CertificateRow[];
    return rows.map((r) => num(r, "credits_awarded"));
  }

  static async setCertificatePdf(id: string, path: string, version: number): Promise<void> {
    check(await db().from(T.certificates).update({ pdf_path: path, pdf_version: version, updated_at: now() }).eq("id", id), "certificate pdf update");
  }

  /** Reissue: same number, new version; the previous details are kept in the version history. */
  static async reissueCertificate(cert: CertificateRow, patch: { learner_name: string; qualification: string | null; registration_number: string | null }, reason: string, adminId: string): Promise<void> {
    check(
      await db().from(T.versions).insert({ certificate_id: cert.id, version: cert.version, learner_name: cert.learner_name, qualification: cert.qualification, registration_number: cert.registration_number, reason, changed_by: adminId }),
      "certificate version insert",
    );
    const rows = check(
      await db().from(T.certificates).update({ ...patch, version: cert.version + 1, pdf_version: null, updated_at: now() }).eq("id", cert.id).eq("version", cert.version).select("id"),
      "certificate reissue",
    ) as { id: string }[];
    if (rows.length !== 1) throw new Error("certificate was changed meanwhile");
  }

  // ---- ledger ----
  static async listLedger(userId: string, range?: { from: string; before: string }): Promise<LedgerRow[]> {
    let q = db().from(T.ledger).select("*").eq("user_id", userId);
    if (range) q = q.gte("awarded_on", range.from).lt("awarded_on", range.before);
    const rows = check(await q.order("awarded_on", { ascending: false }).order("created_at", { ascending: false }).limit(5000), "ledger list") as LedgerRow[];
    return rows.map((r) => num(r, "credits"));
  }

  /** Summed credits per user in a range (counted types only), for reminder runs. */
  static async sumLedger(userIds: string[], range: { from: string; before: string }, types: string[]): Promise<Map<string, LedgerRow[]>> {
    const map = new Map<string, LedgerRow[]>();
    if (userIds.length === 0) return map;
    const rows = check(
      await db().from(T.ledger).select("*").in("user_id", userIds).in("credit_type", types).gte("awarded_on", range.from).lt("awarded_on", range.before).limit(50000),
      "ledger sum",
    ) as LedgerRow[];
    for (const r of rows) map.set(r.user_id, [...(map.get(r.user_id) ?? []), num(r, "credits")]);
    return map;
  }

  static async insertManualAdjustment(row: { user_id: string; credits: number; reason: string; awarded_on: string; created_by: string }): Promise<LedgerRow> {
    return num(check(await db().from(T.ledger).insert({ ...row, credit_type: "manual" }).select("*").single(), "ledger insert") as LedgerRow, "credits");
  }

  // ---- deliveries ----
  /** Claims a delivery: inserts it once per dedupe key. Returns null when it already exists. */
  static async claimDelivery(row: Pick<DeliveryRecord, "user_id" | "kind" | "dedupe_key" | "course_id" | "certificate_id" | "recipient_email" | "payload">): Promise<DeliveryRecord | null> {
    const res = await db().from(T.deliveries).insert({ ...row, status: "pending" }).select("*").single();
    if (isUniqueViolation(res.error)) return null;
    return check(res, "delivery insert") as DeliveryRecord;
  }

  static async findDeliveries(filter: { userId?: string; kind?: DeliveryKind; keyPrefix?: string; status?: DeliveryStatus[]; limit?: number }): Promise<DeliveryRecord[]> {
    let q = db().from(T.deliveries).select("*");
    if (filter.userId) q = q.eq("user_id", filter.userId);
    if (filter.kind) q = q.eq("kind", filter.kind);
    if (filter.keyPrefix) q = q.like("dedupe_key", `${filter.keyPrefix.replace(/[%_]/g, "")}%`);
    if (filter.status) q = q.in("status", filter.status);
    return check(await q.order("created_at", { ascending: false }).limit(filter.limit ?? 200), "delivery list") as DeliveryRecord[];
  }

  static async getDelivery(id: string): Promise<DeliveryRecord | null> {
    return check(await db().from(T.deliveries).select("*").eq("id", id).maybeSingle(), "delivery lookup") as DeliveryRecord | null;
  }

  /** Marks the outcome of one send attempt. Moving a row out of "pending"/"failed" is guarded so two senders never both send. */
  static async startAttempt(id: string, expected: DeliveryStatus[]): Promise<boolean> {
    const current = await this.getDelivery(id);
    if (!current || !expected.includes(current.status)) return false;
    const rows = check(
      await db().from(T.deliveries).update({ attempts: current.attempts + 1, updated_at: now() }).eq("id", id).eq("attempts", current.attempts).in("status", expected).select("id"),
      "delivery attempt",
    ) as { id: string }[];
    return rows.length === 1;
  }

  static async finishDelivery(id: string, patch: { status: DeliveryStatus; last_error?: string | null; sent_at?: string | null; recipient_email?: string | null }): Promise<void> {
    check(await db().from(T.deliveries).update({ ...patch, updated_at: now() }).eq("id", id), "delivery update");
  }

  // ---- in-app notifications (existing notifications table) ----
  // notifications.type is the reminder_type enum (appointment/medicine values only), so learning notifications leave it
  // null like the other in-app notifications and are identified by reference_type ("learning_*") instead.
  static async insertNotification(row: { user_id: string; title: string; body: string; deep_link: string; reference_id?: string | null; reference_type?: string | null }): Promise<void> {
    const { error } = await db().from("notifications").insert({ ...row, channel: "in_app", is_read: false });
    if (error) console.error("[learning] in-app notification insert failed:", error.message);
  }

  // ---- certificate files ----
  static async uploadCertificate(path: string, pdf: Buffer): Promise<void> {
    const { error } = await db().storage.from(CERTIFICATE_BUCKET).upload(path, pdf, { contentType: "application/pdf", upsert: true });
    if (error) throw new Error(`certificate upload failed: ${error.message}`);
  }

  static async signedCertificateUrl(path: string, fileName: string): Promise<string> {
    const { data, error } = await db().storage.from(CERTIFICATE_BUCKET).createSignedUrl(path, 300, { download: fileName });
    if (error || !data) throw new Error(`certificate url failed: ${error?.message}`);
    return data.signedUrl;
  }

  static async downloadAsset(path: string): Promise<Buffer | null> {
    const { data, error } = await db().storage.from(CERTIFICATE_BUCKET).download(path);
    if (error || !data) return null;
    return Buffer.from(await data.arrayBuffer());
  }

  static async uploadAsset(path: string, data: Buffer, contentType: string): Promise<void> {
    const { error } = await db().storage.from(CERTIFICATE_BUCKET).upload(path, data, { contentType, upsert: true });
    if (error) throw new Error(`asset upload failed: ${error.message}`);
  }

  // ---- people ----
  static async getUsers(ids: string[]): Promise<Map<string, { email: string | null; role: string; is_active: boolean }>> {
    if (ids.length === 0) return new Map();
    const rows = check(await db().from("users").select("id, email, role, is_active").in("id", ids), "user lookup") as { id: string; email: string | null; role: string; is_active: boolean }[];
    return new Map(rows.map((u) => [u.id, u]));
  }

  static async getPractitionerProfiles(userIds: string[]): Promise<Map<string, { full_name: string; qualifications: string[] | null; reg_number: string | null; reg_council: string | null; hpr_id: string | null }>> {
    if (userIds.length === 0) return new Map();
    const rows = check(await db().from("practitioners").select("user_id, full_name, qualifications, reg_number, reg_council, hpr_id").in("user_id", userIds), "practitioner lookup") as {
      user_id: string; full_name: string; qualifications: string[] | null; reg_number: string | null; reg_council: string | null; hpr_id: string | null;
    }[];
    return new Map(rows.map((r) => [r.user_id, r]));
  }
}

type RatingRow = { course_id: string; rating_count: number; rating_sum: number; stars_1: number; stars_2: number; stars_3: number; stars_4: number; stars_5: number };

/**
 * Same rules as meyveda_learning_course_ratings (ratings 1-5 from active accounts), counted in the app. Only used
 * until that function is deployed; paged so the API row limit can never cut the count short.
 */
async function ratingRowsFromFeedback(courseIds: string[]): Promise<RatingRow[]> {
  const byCourse = new Map<string, RatingRow>();
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const page = check(
      await db().from(T.feedback).select("id, course_id, rating, user:users!inner(is_active)").in("course_id", courseIds).order("id").range(from, from + PAGE - 1),
      "course ratings",
    ) as unknown as { course_id: string; rating: number; user: { is_active: boolean | null } | { is_active: boolean | null }[] }[];
    for (const f of page) {
      const user = Array.isArray(f.user) ? f.user[0] : f.user;
      if (user?.is_active === false || !(f.rating >= 1 && f.rating <= 5)) continue;
      const r = byCourse.get(f.course_id) ?? { course_id: f.course_id, rating_count: 0, rating_sum: 0, stars_1: 0, stars_2: 0, stars_3: 0, stars_4: 0, stars_5: 0 };
      r.rating_count++;
      r.rating_sum += f.rating;
      r[`stars_${f.rating}` as "stars_1"]++;
      byCourse.set(f.course_id, r);
    }
    if (page.length < PAGE) break;
  }
  return [...byCourse.values()];
}

/** Average = sum of ratings / number of ratings, rounded to one decimal; no ratings = null (never a made-up score). */
export function toRating(r: RatingRow | null): CourseRating {
  const count = Number(r?.rating_count ?? 0);
  const sum = Number(r?.rating_sum ?? 0);
  return {
    average: count > 0 ? Math.round((sum / count) * 10) / 10 : null,
    count,
    distribution: [Number(r?.stars_1 ?? 0), Number(r?.stars_2 ?? 0), Number(r?.stars_3 ?? 0), Number(r?.stars_4 ?? 0), Number(r?.stars_5 ?? 0)],
  };
}
