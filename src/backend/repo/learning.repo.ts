import { createClient } from "@/shared/db/supabase.server";

/** Data access for YurCore Learning. Server-side only (service role); every table has RLS enabled. */

export type CourseRow = {
  id: string;
  moodle_course_id: number | null;
  title: string;
  short_description: string;
  description: string;
  category_name: string | null;
  level: "beginner" | "intermediate" | "advanced" | null;
  instructor_id: string | null;
  duration_minutes: number | null;
  learning_objectives: string[];
  thumbnail_path: string | null;
  status: "draft" | "published";
  published_at: string | null;
  /** yurcore: built in YurCore and mirrored to Moodle · moodle: created in Moodle and imported */
  origin: "yurcore" | "moodle";
  moodle_synced_at: string | null;
  moodle_sync_error: string | null;
  moodle_image_sig: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};
export type CourseWrite = Partial<Pick<CourseRow, "title" | "short_description" | "description" | "category_name" | "level" | "instructor_id" | "duration_minutes" | "learning_objectives" | "thumbnail_path" | "status" | "published_at">>;
export type CourseSyncWrite = Partial<Pick<CourseRow, "moodle_synced_at" | "moodle_sync_error" | "moodle_image_sig">>;

export type SectionRow = { id: string; course_id: string; title: string; description: string; position: number; moodle_section_id: number | null };

export type ContentRow = {
  id: string;
  course_id: string;
  section_id: string;
  content_type: "image" | "video" | "document" | "file" | "lesson" | "quiz" | "question" | "assignment" | "feedback";
  title: string;
  description: string;
  body: string | null;
  settings: Record<string, unknown>;
  storage_path: string | null;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  position: number;
  moodle_cmid: number | null;
  moodle_sync_hash: string | null;
  moodle_file_sig: string | null;
};
export type ContentWrite = Partial<Omit<ContentRow, "id" | "course_id">>;

export type QuizRow = { id: string; content_id: string; course_id: string; passing_score: number; time_limit_minutes: number | null; attempts_allowed: number | null };
export type OptionRow = { id: string; question_id: string; option_text: string; is_correct: boolean; position: number };
export type QuestionRow = { id: string; quiz_id: string; question: string; explanation: string; position: number; options: OptionRow[] };

export type EnrollmentRow = { id: string; course_id: string; user_id: string; started_at: string; completed_at: string | null };
export type AttemptRow = { id: string; quiz_id: string; user_id: string; started_at: string; submitted_at: string | null; answers: Record<string, string>; correct_count: number | null; total_count: number | null; score_percent: number | null; passed: boolean | null };
export type ResponseRow = { id: string; content_id: string; user_id: string; response_text: string; rating: number | null; submitted_at: string };

export type PractitionerInfo = { user_id: string; full_name: string; specializations: string[] | null; photo_url: string | null };

const T = {
  courses: "meyveda_learning_courses",
  sections: "meyveda_learning_sections",
  content: "meyveda_learning_content",
  quizzes: "meyveda_learning_quizzes",
  questions: "meyveda_learning_quiz_questions",
  options: "meyveda_learning_quiz_options",
  enrollments: "meyveda_learning_enrollments",
  progress: "meyveda_learning_progress",
  attempts: "meyveda_learning_quiz_attempts",
  responses: "meyveda_learning_responses",
} as const;

export const LEARNING_BUCKET = "learning";

const db = () => createClient();
function check<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what} failed: ${res.error.message}`);
  return res.data;
}
const now = () => new Date().toISOString();
/** Strips PostgREST filter syntax from user text. */
const term = (q: string) => q.replace(/[%,()*\\]/g, " ").trim();

export class LearningRepository {
  // ---- people ----
  static async getPractitioner(userId: string): Promise<PractitionerInfo | null> {
    return check(await db().from("practitioners").select("user_id, full_name, specializations, photo_url").eq("user_id", userId).maybeSingle(), "practitioner lookup") as PractitionerInfo | null;
  }

  static async getPractitioners(userIds: string[]): Promise<Map<string, PractitionerInfo>> {
    if (userIds.length === 0) return new Map();
    const rows = check(await db().from("practitioners").select("user_id, full_name, specializations, photo_url").in("user_id", userIds), "practitioner lookup") as PractitionerInfo[];
    return new Map(rows.map((r) => [r.user_id, r]));
  }

  static async getUserEmails(userIds: string[]): Promise<Map<string, string | null>> {
    if (userIds.length === 0) return new Map();
    const rows = check(await db().from("users").select("id, email").in("id", userIds), "user lookup") as { id: string; email: string | null }[];
    return new Map(rows.map((u) => [u.id, u.email]));
  }

  /** Owner recorded for courses imported from Moodle when no admin triggered the import. */
  static async findAdminUserId(): Promise<string | null> {
    const row = check(await db().from("users").select("id").in("role", ["super_admin", "admin"]).order("created_at").limit(1).maybeSingle(), "admin lookup") as { id: string } | null;
    return row?.id ?? null;
  }

  static async searchPractitioners(q: string, limit = 10): Promise<PractitionerInfo[]> {
    const t = term(q);
    if (t.length < 2) return [];
    return check(await db().from("practitioners").select("user_id, full_name, specializations, photo_url").ilike("full_name", `%${t}%`).limit(limit), "practitioner search") as PractitionerInfo[];
  }

  // ---- courses ----
  static async listCourses(filters: { status?: "published"; q?: string; category?: string; ids?: string[] } = {}): Promise<CourseRow[]> {
    let query = db().from(T.courses).select("*");
    if (filters.status) query = query.eq("status", filters.status);
    if (filters.category) query = query.eq("category_name", filters.category);
    if (filters.ids) query = query.in("id", filters.ids.length ? filters.ids : ["00000000-0000-0000-0000-000000000000"]);
    if (filters.q && term(filters.q)) {
      const t = term(filters.q);
      query = query.or(`title.ilike.%${t}%,short_description.ilike.%${t}%,description.ilike.%${t}%`);
    }
    const order = filters.status ? "published_at" : "created_at";
    return check(await query.order(order, { ascending: false, nullsFirst: false }), "course list") as CourseRow[];
  }

  static async categories(publishedOnly: boolean): Promise<string[]> {
    let query = db().from(T.courses).select("category_name").not("category_name", "is", null);
    if (publishedOnly) query = query.eq("status", "published");
    const rows = check(await query, "category list") as { category_name: string }[];
    return [...new Set(rows.map((r) => r.category_name.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  }

  static async getCourse(id: string): Promise<CourseRow | null> {
    return check(await db().from(T.courses).select("*").eq("id", id).maybeSingle(), "course lookup") as CourseRow | null;
  }

  static async getCourseByMoodleId(moodleCourseId: number): Promise<CourseRow | null> {
    return check(await db().from(T.courses).select("*").eq("moodle_course_id", moodleCourseId).maybeSingle(), "course lookup") as CourseRow | null;
  }

  /** Sync bookkeeping only: does not change updated_at, so a sync never looks like an edit. */
  static async setCourseSync(id: string, patch: CourseSyncWrite): Promise<void> {
    check(await db().from(T.courses).update(patch).eq("id", id), "course sync update");
  }

  static async insertCourse(row: CourseWrite & { title: string; created_by: string; moodle_course_id: number | null; origin?: CourseRow["origin"] }): Promise<CourseRow> {
    return check(await db().from(T.courses).insert(row).select("*").single(), "course insert") as CourseRow;
  }

  static async updateCourse(id: string, patch: CourseWrite): Promise<CourseRow> {
    return check(await db().from(T.courses).update({ ...patch, updated_at: now() }).eq("id", id).select("*").single(), "course update") as CourseRow;
  }

  static async touchCourse(id: string): Promise<void> {
    check(await db().from(T.courses).update({ updated_at: now() }).eq("id", id), "course update");
  }

  static async deleteCourse(id: string): Promise<void> {
    check(await db().from(T.courses).delete().eq("id", id), "course delete");
  }

  // ---- sections ----
  static async listSections(courseIds: string[]): Promise<SectionRow[]> {
    if (courseIds.length === 0) return [];
    return check(await db().from(T.sections).select("id, course_id, title, description, position, moodle_section_id").in("course_id", courseIds).order("position").order("created_at"), "section list") as SectionRow[];
  }

  static async insertSection(row: { course_id: string; title: string; description: string; position: number; moodle_section_id?: number | null }): Promise<SectionRow> {
    return check(await db().from(T.sections).insert(row).select("id, course_id, title, description, position, moodle_section_id").single(), "section insert") as SectionRow;
  }

  static async updateSection(id: string, patch: Partial<Pick<SectionRow, "title" | "description" | "position" | "moodle_section_id">>): Promise<void> {
    check(await db().from(T.sections).update({ ...patch, updated_at: now() }).eq("id", id), "section update");
  }

  static async deleteSection(id: string): Promise<void> {
    check(await db().from(T.sections).delete().eq("id", id), "section delete");
  }

  // ---- content ----
  static async listContent(courseIds: string[]): Promise<ContentRow[]> {
    if (courseIds.length === 0) return [];
    return check(await db().from(T.content).select("*").in("course_id", courseIds).order("position").order("created_at"), "content list") as ContentRow[];
  }

  static async getContent(id: string): Promise<ContentRow | null> {
    return check(await db().from(T.content).select("*").eq("id", id).maybeSingle(), "content lookup") as ContentRow | null;
  }

  static async insertContent(row: ContentWrite & { course_id: string; section_id: string; content_type: ContentRow["content_type"]; title: string }): Promise<ContentRow> {
    return check(await db().from(T.content).insert(row).select("*").single(), "content insert") as ContentRow;
  }

  static async updateContent(id: string, patch: ContentWrite): Promise<ContentRow> {
    return check(await db().from(T.content).update({ ...patch, updated_at: now() }).eq("id", id).select("*").single(), "content update") as ContentRow;
  }

  static async deleteContent(id: string): Promise<void> {
    check(await db().from(T.content).delete().eq("id", id), "content delete");
  }

  /** Sync bookkeeping only (Moodle ids and fingerprints): does not change updated_at. */
  static async setContentSync(id: string, patch: Partial<Pick<ContentRow, "moodle_cmid" | "moodle_sync_hash" | "moodle_file_sig">>): Promise<void> {
    check(await db().from(T.content).update(patch).eq("id", id), "content sync update");
  }

  static async isPathReferenced(path: string): Promise<boolean> {
    const [c, k] = await Promise.all([
      db().from(T.content).select("id", { count: "exact", head: true }).eq("storage_path", path),
      db().from(T.courses).select("id", { count: "exact", head: true }).eq("thumbnail_path", path),
    ]);
    return (c.count ?? 0) + (k.count ?? 0) > 0;
  }

  /** Applies a full ordering: section positions, and each item's section + position. */
  static async applyLayout(sections: { id: string; position: number }[], items: { id: string; section_id: string; position: number }[]): Promise<void> {
    const supabase = db();
    const stamp = now();
    const results = await Promise.all([
      ...sections.map((s) => supabase.from(T.sections).update({ position: s.position, updated_at: stamp }).eq("id", s.id)),
      ...items.map((i) => supabase.from(T.content).update({ section_id: i.section_id, position: i.position, updated_at: stamp }).eq("id", i.id)),
    ]);
    const failed = results.find((r) => r.error);
    if (failed?.error) throw new Error(`layout update failed: ${failed.error.message}`);
  }

  // ---- quizzes ----
  static async getQuizzes(contentIds: string[], withQuestions: boolean): Promise<Map<string, QuizRow & { questions: QuestionRow[] }>> {
    const map = new Map<string, QuizRow & { questions: QuestionRow[] }>();
    if (contentIds.length === 0) return map;
    const quizzes = check(await db().from(T.quizzes).select("id, content_id, course_id, passing_score, time_limit_minutes, attempts_allowed").in("content_id", contentIds), "quiz lookup") as QuizRow[];
    if (quizzes.length === 0) return map;
    const cols = withQuestions ? "id, quiz_id, question, explanation, position, options:meyveda_learning_quiz_options(id, question_id, option_text, is_correct, position)" : "id, quiz_id, position";
    const questions = check(await db().from(T.questions).select(cols).in("quiz_id", quizzes.map((q) => q.id)).order("position"), "question lookup") as unknown as QuestionRow[];
    for (const quiz of quizzes) {
      const qs = questions.filter((q) => q.quiz_id === quiz.id).map((q) => ({ ...q, options: [...(q.options ?? [])].sort((a, b) => a.position - b.position) }));
      map.set(quiz.content_id, { ...quiz, questions: qs });
    }
    return map;
  }

  static async upsertQuiz(row: Omit<QuizRow, "id">): Promise<QuizRow> {
    return check(await db().from(T.quizzes).upsert({ ...row, updated_at: now() }, { onConflict: "content_id" }).select("*").single(), "quiz save") as QuizRow;
  }

  /**
   * Saves the full question list: existing ids are updated, new ones inserted, missing ones deleted.
   * Options are rewritten per question (their ids are not referenced anywhere that needs stability).
   */
  static async saveQuestions(quizId: string, questions: { id?: string; question: string; explanation: string; options: { text: string; correct: boolean }[] }[]): Promise<void> {
    const supabase = db();
    const existing = (check(await supabase.from(T.questions).select("id").eq("quiz_id", quizId), "question lookup") as { id: string }[]).map((q) => q.id);
    const keep = new Set(questions.map((q) => q.id).filter((id): id is string => Boolean(id && existing.includes(id))));
    const remove = existing.filter((id) => !keep.has(id));
    if (remove.length) check(await supabase.from(T.questions).delete().in("id", remove), "question delete");

    for (const [i, q] of questions.entries()) {
      const fields = { question: q.question, explanation: q.explanation, position: i, updated_at: now() };
      let id = q.id && keep.has(q.id) ? q.id : null;
      if (id) check(await supabase.from(T.questions).update(fields).eq("id", id), "question update");
      else id = (check(await supabase.from(T.questions).insert({ ...fields, quiz_id: quizId }).select("id").single(), "question insert") as { id: string }).id;

      check(await supabase.from(T.options).delete().eq("question_id", id), "option reset");
      check(await supabase.from(T.options).insert(q.options.map((o, j) => ({ question_id: id, option_text: o.text, is_correct: o.correct, position: j }))), "option insert");
    }
  }

  // ---- learner records ----
  static async getEnrollment(courseId: string, userId: string): Promise<EnrollmentRow | null> {
    return check(await db().from(T.enrollments).select("*").eq("course_id", courseId).eq("user_id", userId).maybeSingle(), "enrollment lookup") as EnrollmentRow | null;
  }

  static async listEnrollments(filter: { userId?: string; courseIds?: string[] }): Promise<EnrollmentRow[]> {
    let query = db().from(T.enrollments).select("*");
    if (filter.userId) query = query.eq("user_id", filter.userId);
    if (filter.courseIds) {
      if (filter.courseIds.length === 0) return [];
      query = query.in("course_id", filter.courseIds);
    }
    return check(await query.order("started_at", { ascending: false }), "enrollment list") as EnrollmentRow[];
  }

  static async enroll(courseId: string, userId: string): Promise<void> {
    check(await db().from(T.enrollments).upsert({ course_id: courseId, user_id: userId }, { onConflict: "course_id,user_id", ignoreDuplicates: true }), "enrollment insert");
  }

  static async setCompleted(courseId: string, userId: string, completedAt: string | null): Promise<void> {
    check(await db().from(T.enrollments).update({ completed_at: completedAt }).eq("course_id", courseId).eq("user_id", userId), "enrollment update");
  }

  static async listProgress(filter: { userId?: string; courseIds: string[] }): Promise<{ course_id: string; content_id: string; user_id: string }[]> {
    if (filter.courseIds.length === 0) return [];
    let query = db().from(T.progress).select("course_id, content_id, user_id").in("course_id", filter.courseIds);
    if (filter.userId) query = query.eq("user_id", filter.userId);
    return check(await query, "progress list") as { course_id: string; content_id: string; user_id: string }[];
  }

  static async markComplete(courseId: string, contentId: string, userId: string): Promise<void> {
    check(await db().from(T.progress).upsert({ course_id: courseId, content_id: contentId, user_id: userId }, { onConflict: "content_id,user_id", ignoreDuplicates: true }), "progress insert");
  }

  static async listAttempts(quizIds: string[], userId: string): Promise<AttemptRow[]> {
    if (quizIds.length === 0) return [];
    return check(await db().from(T.attempts).select("*").in("quiz_id", quizIds).eq("user_id", userId).order("started_at"), "attempt list") as AttemptRow[];
  }

  static async getAttempt(id: string): Promise<AttemptRow | null> {
    return check(await db().from(T.attempts).select("*").eq("id", id).maybeSingle(), "attempt lookup") as AttemptRow | null;
  }

  static async insertAttempt(quizId: string, userId: string): Promise<AttemptRow> {
    return check(await db().from(T.attempts).insert({ quiz_id: quizId, user_id: userId }).select("*").single(), "attempt insert") as AttemptRow;
  }

  /** Submits only once: the update matches an attempt that has not been submitted yet. */
  static async submitAttempt(id: string, result: Pick<AttemptRow, "answers" | "correct_count" | "total_count" | "score_percent" | "passed">): Promise<boolean> {
    const rows = check(await db().from(T.attempts).update({ ...result, submitted_at: now() }).eq("id", id).is("submitted_at", null).select("id"), "attempt submit") as { id: string }[];
    return rows.length === 1;
  }

  static async listResponses(filter: { contentIds: string[]; userId?: string }): Promise<ResponseRow[]> {
    if (filter.contentIds.length === 0) return [];
    let query = db().from(T.responses).select("id, content_id, user_id, response_text, rating, submitted_at").in("content_id", filter.contentIds);
    if (filter.userId) query = query.eq("user_id", filter.userId);
    return check(await query.order("submitted_at", { ascending: false }), "response list") as ResponseRow[];
  }

  static async saveResponse(row: { course_id: string; content_id: string; user_id: string; response_text: string; rating: number | null }): Promise<void> {
    check(await db().from(T.responses).upsert({ ...row, submitted_at: now() }, { onConflict: "content_id,user_id" }), "response save");
  }

  // ---- storage ----
  static async createUploadUrl(path: string): Promise<{ signedUrl: string; token: string; path: string }> {
    const { data, error } = await db().storage.from(LEARNING_BUCKET).createSignedUploadUrl(path);
    if (error || !data) throw new Error(`upload url failed: ${error?.message}`);
    return data;
  }

  /** Server-side upload (used when importing files from Moodle). */
  static async uploadFile(path: string, data: ArrayBuffer, contentType: string): Promise<void> {
    const { error } = await db().storage.from(LEARNING_BUCKET).upload(path, data, { contentType, upsert: true });
    if (error) throw new Error(`file upload failed: ${error.message}`);
  }

  /** Server-side download (used when sending files to Moodle). */
  static async downloadFile(path: string): Promise<ArrayBuffer> {
    const { data, error } = await db().storage.from(LEARNING_BUCKET).download(path);
    if (error || !data) throw new Error(`file download failed: ${error?.message ?? "no data"}`);
    return data.arrayBuffer();
  }

  /** Metadata of an uploaded object, or null if it does not exist. */
  static async fileInfo(path: string): Promise<{ size: number; contentType: string } | null> {
    const { data, error } = await db().storage.from(LEARNING_BUCKET).info(path);
    if (error || !data) return null;
    return { size: Number(data.size ?? 0), contentType: String(data.contentType ?? "") };
  }

  static async signedUrls(paths: string[], expiresIn: number, download = false): Promise<Map<string, string>> {
    const unique = [...new Set(paths.filter(Boolean))];
    if (unique.length === 0) return new Map();
    const { data, error } = await db().storage.from(LEARNING_BUCKET).createSignedUrls(unique, expiresIn, download ? { download: true } : undefined);
    if (error) throw new Error(`signed url failed: ${error.message}`);
    return new Map((data ?? []).filter((d) => d.signedUrl && d.path).map((d) => [d.path as string, d.signedUrl as string]));
  }

  static async removeFiles(paths: string[]): Promise<void> {
    const list = paths.filter(Boolean);
    if (list.length === 0) return;
    const { error } = await db().storage.from(LEARNING_BUCKET).remove(list);
    if (error) console.warn("[learning] storage cleanup failed:", error.message);
  }

  /** Every object under a folder (recursively), e.g. everything of a deleted course. */
  static async listFolder(prefix: string): Promise<string[]> {
    const out: string[] = [];
    const walk = async (dir: string) => {
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await db().storage.from(LEARNING_BUCKET).list(dir, { limit: 1000, offset });
        if (error || !data?.length) return;
        for (const entry of data) {
          const full = `${dir}/${entry.name}`;
          if (entry.id) out.push(full);
          else await walk(full);
        }
        if (data.length < 1000) return;
      }
    };
    await walk(prefix);
    return out;
  }
}
