import { SITE_NAME } from "@/shared/config/site";
import { randomBytes, randomUUID } from "crypto";
import { z } from "zod";
import { AppError, AuthorizationError, NotFoundError, ValidationError } from "@/shared/api/api-error";
import type { AuthUser } from "@/shared/auth/auth.types";
import { ROLES } from "@/shared/security/roles";
import { UPLOAD_RULES, allowedFor, isFileType, isQuizType, resolveMime } from "@/shared/learning/content";
import type { AdminCourse, AdminCourseDetails, ContentType, LearnerRow, ResponseRow, UploadKind } from "@/shared/learning/types";
import { LearningRepository, type ContentRow, type CourseRow, type CourseWrite } from "../repo/learning.repo";
import { Moodle, type MoodleCourse } from "@/backend/integration/moodle/moodle.service";
import { MoodleError } from "@/backend/integration/moodle/moodle.client";
import { getMoodleConfig } from "@/backend/integration/moodle/config";
import { UUID, buildSections, summaries } from "./learning-common";
import { LearningMoodleSync, toHtml } from "./learning-moodle-sync.service";

/**
 * Course building. Admin roles only: every public method starts with requireAdmin, and
 * practitioners have no route that reaches this service. Courses, sections, content and quizzes
 * are stored in Supabase; files in the private "learning" Storage bucket (rows hold the path only).
 */

// ---------- input schemas ----------
const text = (max: number) => z.string().trim().max(max);

export const courseInputSchema = z.object({
  title: z.string().trim().min(3, "Course title must be at least 3 characters").max(200),
  shortDescription: text(300).default(""),
  description: text(20000).default(""),
  category: text(80).nullable().optional(),
  level: z.enum(["beginner", "intermediate", "advanced"]).nullable().optional(),
  instructorId: z.string().regex(UUID, "Invalid instructor").nullable().optional(),
  durationMinutes: z.number().int().min(0).max(100000).nullable().optional(),
  learningObjectives: z.array(text(300)).max(30).default([]),
  thumbnailPath: z.string().max(500).nullable().optional(),
});
export const courseUpdateSchema = courseInputSchema.partial();

export const sectionInputSchema = z.object({ title: z.string().trim().min(1, "Section title is required").max(200), description: text(2000).default("") });

const optionSchema = z.object({ text: z.string().trim().min(1, "Every option needs text").max(1000), correct: z.boolean() });
export const questionInputSchema = z
  .object({
    id: z.string().regex(UUID).optional(),
    question: z.string().trim().min(1, "Every question needs text").max(4000),
    explanation: text(4000).default(""),
    options: z.array(optionSchema).min(2, "A question needs at least two options").max(6),
  })
  .refine((q) => q.options.filter((o) => o.correct).length === 1, "Choose exactly one correct answer for every question");

export const quizInputSchema = z.object({
  passingScore: z.number().int().min(0).max(100).default(70),
  timeLimitMinutes: z.number().int().min(1).max(1440).nullable().default(null),
  attemptsAllowed: z.number().int().min(1).max(100).nullable().default(null),
  questions: z.array(questionInputSchema).max(500).default([]),
});

export const contentInputSchema = z.object({
  sectionId: z.string().regex(UUID, "Invalid section"),
  type: z.enum(["image", "video", "document", "file", "lesson", "quiz", "question", "assignment", "feedback"]),
  title: z.string().trim().min(1, "Title is required").max(200),
  description: text(5000).default(""),
  body: text(100000).nullable().optional(),
  settings: z.object({ dueAt: z.string().datetime({ offset: true }).nullable().optional(), rating: z.boolean().optional() }).default({}),
  file: z.object({ path: z.string().max(500), name: z.string().trim().min(1).max(255) }).nullable().optional(),
  quiz: quizInputSchema.optional(),
});
export const contentUpdateSchema = contentInputSchema.omit({ sectionId: true, type: true }).partial();

export const uploadRequestSchema = z.object({
  kind: z.enum(["thumbnail", "image", "video", "document", "file", "attachment"]),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().max(200).default(""),
  size: z.number().int().min(1, "The file is empty"),
});

export const layoutSchema = z.object({
  sections: z.array(z.object({ id: z.string().regex(UUID), items: z.array(z.string().regex(UUID)) })).max(500),
});

// ---------- guards ----------
function requireAdmin(user: AuthUser) {
  if (user.role !== ROLES.ADMIN && user.role !== ROLES.SUPER_ADMIN) throw new AuthorizationError("Only administrators can manage courses");
}

async function loadCourse(id: string): Promise<CourseRow> {
  if (!UUID.test(id)) throw new ValidationError("Invalid course");
  const row = await LearningRepository.getCourse(id);
  if (!row) throw new NotFoundError("Course not found");
  return row;
}

/** Courses created in Moodle are imported from Moodle: their content is edited there, not in YurCore. */
async function loadBuildableCourse(id: string): Promise<CourseRow> {
  const row = await loadCourse(id);
  if (row.origin === "moodle") throw new ValidationError("This course was created in Moodle. Edit its content in Moodle; changes appear here after a sync.");
  return row;
}

async function loadStructure(courseId: string) {
  const [sections, content] = await Promise.all([LearningRepository.listSections([courseId]), LearningRepository.listContent([courseId])]);
  return { sections, content };
}

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const r = schema.safeParse(input);
  if (!r.success) throw new ValidationError(r.error.issues[0]?.message ?? "Invalid input");
  return r.data;
}

const folderOf = (courseId: string, kind: UploadKind) => `courses/${courseId}/${UPLOAD_RULES[kind].folder}/`;
const uploadKindFor = (type: ContentType): UploadKind | null => (isFileType(type) ? type : type === "assignment" ? "attachment" : null);

/** Checks an uploaded object: it must sit in this course's folder for the kind and exist with an allowed type. */
async function verifyUpload(courseId: string, kind: UploadKind, path: string) {
  if (!path.startsWith(folderOf(courseId, kind)) || path.includes("..")) throw new ValidationError("The uploaded file does not belong to this course");
  const info = await LearningRepository.fileInfo(path);
  if (!info) throw new ValidationError("The upload did not finish. Please upload the file again");
  if (info.contentType && !allowedFor(kind, info.contentType)) throw new ValidationError("This file type is not allowed here");
  return info;
}

const courseWrite = (input: z.infer<typeof courseUpdateSchema>): CourseWrite => {
  const out: CourseWrite = {};
  if (input.title !== undefined) out.title = input.title;
  if (input.shortDescription !== undefined) out.short_description = input.shortDescription;
  if (input.description !== undefined) out.description = input.description;
  if (input.category !== undefined) out.category_name = input.category?.trim() || null;
  if (input.level !== undefined) out.level = input.level;
  if (input.instructorId !== undefined) out.instructor_id = input.instructorId;
  if (input.durationMinutes !== undefined) out.duration_minutes = input.durationMinutes || null;
  if (input.learningObjectives !== undefined) out.learning_objectives = input.learningObjectives.filter(Boolean);
  return out;
};

/** Everything that must be true before learners can see a course. */
export function publishProblems(content: Pick<ContentRow, "content_type" | "title" | "storage_path" | "id">[], questionCounts: Map<string, number>): string[] {
  const problems: string[] = [];
  if (content.length === 0) problems.push("Add at least one content item before publishing");
  for (const c of content) {
    if (isFileType(c.content_type) && !c.storage_path) problems.push(`"${c.title}" has no file`);
    if (isQuizType(c.content_type) && !(questionCounts.get(c.id) ?? 0)) problems.push(`"${c.title}" has no questions`);
  }
  return problems;
}

// ---------- Moodle course lifecycle ----------

const MOODLE_FAILED: Record<string, string> = {
  create: "The course could not be created in Moodle, so nothing was saved. Please try again.",
  update: "The changes could not be saved to Moodle, so nothing was changed. Please try again.",
  publish: "The course could not be published in Moodle, so it is still a draft. Please try again.",
  unpublish: "The course could not be hidden in Moodle, so it is still published. Please try again.",
};

/** Runs a Moodle step; on failure logs the detail and stops the operation before YurCore is changed. */
async function moodleStep<T>(step: keyof typeof MOODLE_FAILED, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if (!(err instanceof MoodleError)) throw err;
    console.error(`[learning] Moodle ${step} failed: ${err.kind} in ${err.fn}: ${err.detail ?? ""}`);
    const reason = err.kind === "not_configured" ? " Moodle is not configured." : err.kind === "unavailable" || err.kind === "timeout" ? " Moodle is not reachable." : "";
    throw new AppError(MOODLE_FAILED[step] + reason, err.kind === "not_configured" ? 503 : 502);
  }
}

/** Live Moodle courses for the linked rows; null when Moodle cannot be reached (status unknown). */
async function moodleCourses(rows: CourseRow[]): Promise<Map<number, MoodleCourse> | null> {
  const ids = rows.map((r) => r.moodle_course_id).filter((x): x is number => x !== null);
  if (ids.length === 0) return new Map();
  try {
    return await Moodle.getCoursesByIds(ids);
  } catch {
    return null;
  }
}

export class LearningAdminService {
  private static async toAdmin(rows: CourseRow[]): Promise<AdminCourse[]> {
    const [{ list }, emails, enrollments, moodle] = await Promise.all([
      summaries(rows),
      LearningRepository.getUserEmails([...new Set(rows.map((r) => r.created_by))]),
      LearningRepository.listEnrollments({ courseIds: rows.map((r) => r.id) }),
      moodleCourses(rows),
    ]);
    return list.map((c, i) => {
      const mid = rows[i].moodle_course_id;
      return {
        ...c,
        createdBy: emails.get(rows[i].created_by) ?? null,
        learners: enrollments.filter((e) => e.course_id === c.id).length,
        moodleCourseId: mid,
        moodleStatus: mid === null ? "not_linked" : moodle === null ? "unknown" : moodle.has(mid) ? "linked" : "missing",
        origin: rows[i].origin,
        moodleSync: { syncedAt: rows[i].moodle_synced_at, error: rows[i].moodle_sync_error, busy: LearningMoodleSync.isBusy(c.id) },
        moodleUrl: mid === null ? null : `${getMoodleConfig().publicUrl}/course/view.php?id=${mid}`,
      };
    });
  }

  // ---------- courses ----------
  static async list(user: AuthUser): Promise<AdminCourse[]> {
    requireAdmin(user);
    // Courses created in Moodle get a row here right away; their content is imported in the background.
    await LearningMoodleSync.discover(user.id);
    return this.toAdmin(await LearningRepository.listCourses());
  }

  /** Syncs one course with Moodle now: pushes a YurCore-built course, or re-imports a Moodle-built one. */
  static async syncCourse(user: AuthUser, courseId: string): Promise<AdminCourse> {
    requireAdmin(user);
    const course = await loadCourse(courseId);
    if (course.moodle_course_id === null) throw new ValidationError("This course is not linked to a Moodle course");
    await LearningMoodleSync.syncCourse(courseId).catch(() => undefined); // the outcome is recorded on the course
    return (await this.toAdmin([await loadCourse(courseId)]))[0];
  }

  /** Imports courses created in Moodle and syncs every course both ways. */
  static async syncAll(user: AuthUser): Promise<{ imported: number; synced: number; failed: number }> {
    requireAdmin(user);
    if (!getMoodleConfig().configured) throw new AppError("Moodle is not configured.", 503);
    try {
      return await LearningMoodleSync.syncAll(user.id);
    } catch (err) {
      if (!(err instanceof MoodleError)) throw err;
      console.error(`[learning] Moodle sync failed: ${err.kind} in ${err.fn}: ${err.detail ?? ""}`);
      throw new AppError(err.kind === "unavailable" || err.kind === "timeout" ? "Moodle is not reachable. Please try again." : "Moodle refused the sync. Check the Moodle web-service token.", 502);
    }
  }

  static async categories(user: AuthUser): Promise<string[]> {
    requireAdmin(user);
    return LearningRepository.categories(false);
  }

  static async getDetails(user: AuthUser, courseId: string): Promise<AdminCourseDetails> {
    requireAdmin(user);
    const row = await loadCourse(courseId);
    const { sections, content } = await loadStructure(courseId);
    const [[course], built] = await Promise.all([this.toAdmin([row]), buildSections(sections, content, { withQuestions: true })]);
    return { course, sections: built.sections };
  }

  /**
   * Moodle first, then YurCore: the course is created (hidden) in Moodle, and its Moodle id is stored in
   * meyveda_learning_courses.moodle_course_id. If the Supabase insert fails, the Moodle course is removed again.
   */
  static async createCourse(user: AuthUser, input: unknown): Promise<AdminCourse> {
    requireAdmin(user);
    const data = parse(courseInputSchema, input);
    if (data.instructorId && !(await LearningRepository.getPractitioner(data.instructorId))) throw new ValidationError("Choose an instructor from the practitioner list");

    const slug = data.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "course";
    const moodleCourseId = await moodleStep("create", () =>
      Moodle.createCourse({
        fullname: data.title,
        shortname: `mv-${slug}-${randomBytes(3).toString("hex")}`,
        summary: toHtml(data.description),
        categoryId: getMoodleConfig().defaultCategoryId,
        visible: false, // draft until published
        completion: true,
      }),
    );

    let row: CourseRow;
    try {
      row = await LearningRepository.insertCourse({ ...courseWrite(data), title: data.title, status: "draft", created_by: user.id, moodle_course_id: moodleCourseId });
    } catch (err) {
      await Moodle.deleteCourse(moodleCourseId).catch((e) => console.error("[learning] rollback of Moodle course failed", moodleCourseId, e instanceof MoodleError ? e.detail : e));
      throw err;
    }
    // A course always starts with one section so the builder is never empty.
    await LearningRepository.insertSection({ course_id: row.id, title: "Introduction", description: "", position: 0 });
    LearningMoodleSync.schedulePush(row.id);
    return (await this.toAdmin([row]))[0];
  }

  static async updateCourse(user: AuthUser, courseId: string, input: unknown): Promise<AdminCourse> {
    requireAdmin(user);
    const current = await loadCourse(courseId);
    const data = parse(courseUpdateSchema, input);
    if (current.origin === "moodle" && ((data.title !== undefined && data.title !== current.title) || (data.description !== undefined && data.description !== current.description))) {
      throw new ValidationError("This course was created in Moodle. Change its name and description in Moodle.");
    }
    const patch = courseWrite(data);
    if (data.instructorId && !(await LearningRepository.getPractitioner(data.instructorId))) throw new ValidationError("Choose an instructor from the practitioner list");

    let oldThumb: string | null = null;
    if (data.thumbnailPath !== undefined && data.thumbnailPath !== current.thumbnail_path) {
      if (data.thumbnailPath) await verifyUpload(courseId, "thumbnail", data.thumbnailPath);
      patch.thumbnail_path = data.thumbnailPath;
      oldThumb = current.thumbnail_path;
    }
    // Name and summary are mirrored to the Moodle course before YurCore is changed.
    const titleChanged = patch.title !== undefined && patch.title !== current.title;
    const descChanged = patch.description !== undefined && patch.description !== current.description;
    if (current.moodle_course_id !== null && (titleChanged || descChanged)) {
      const mid = current.moodle_course_id;
      await moodleStep("update", () => Moodle.updateCourse(mid, { ...(titleChanged ? { fullname: patch.title } : {}), ...(descChanged ? { summary: toHtml(patch.description ?? "") } : {}) }));
    }
    // Only real changes are written, so saving an unchanged form does not mark the course as updated.
    for (const key of Object.keys(patch) as (keyof CourseWrite)[]) {
      if (JSON.stringify(patch[key] ?? null) === JSON.stringify(current[key] ?? null)) delete patch[key];
    }
    if (Object.keys(patch).length === 0) return (await this.toAdmin([current]))[0];
    const row = await LearningRepository.updateCourse(courseId, patch);
    if (oldThumb) await LearningRepository.removeFiles([oldThumb]);
    LearningMoodleSync.schedulePush(courseId);
    return (await this.toAdmin([row]))[0];
  }

  /** Publishing shows the course in Moodle too; unpublishing hides it there. Moodle is changed first. */
  static async setPublished(user: AuthUser, courseId: string, published: boolean): Promise<AdminCourse> {
    requireAdmin(user);
    const current = await loadCourse(courseId);
    if (published) {
      const { content } = await loadStructure(courseId);
      const quizzes = await LearningRepository.getQuizzes(content.filter((c) => isQuizType(c.content_type)).map((c) => c.id), false);
      const problems = publishProblems(content, new Map([...quizzes].map(([id, q]) => [id, q.questions.length])));
      if (problems.length) throw new ValidationError(problems[0], { problems });
    }
    if (current.moodle_course_id !== null) {
      const mid = current.moodle_course_id;
      await moodleStep(published ? "publish" : "unpublish", () => Moodle.updateCourse(mid, { visible: published }));
    }
    const row = await LearningRepository.updateCourse(courseId, { status: published ? "published" : "draft", published_at: published ? new Date().toISOString() : null });
    LearningMoodleSync.schedulePush(courseId);
    return (await this.toAdmin([row]))[0];
  }

  /**
   * Permanent deletion, Moodle first. The YurCore course (and its sections, content, quizzes, learner
   * records and files) is only deleted after Moodle has confirmed the Moodle course is gone. If Moodle
   * fails, nothing in YurCore is touched, so a retry starts from the same consistent state. A Moodle
   * course that no longer exists (e.g. removed in Moodle directly) counts as already deleted.
   */
  static async deleteCourse(user: AuthUser, courseId: string): Promise<void> {
    requireAdmin(user);
    const course = await loadCourse(courseId);
    if (course.moodle_course_id !== null) {
      try {
        await Moodle.deleteCourse(course.moodle_course_id);
      } catch (err) {
        if (!(err instanceof MoodleError && err.kind === "not_found")) {
          console.error(`[learning] Moodle deletion of course ${course.moodle_course_id} failed:`, err instanceof MoodleError ? `${err.kind} ${err.detail ?? ""}` : err);
          throw new AppError("The course could not be completely deleted from Moodle. The course has not been removed. Please try again.", 502);
        }
      }
    }
    const files = await LearningRepository.listFolder(`courses/${courseId}`);
    try {
      await LearningRepository.deleteCourse(courseId); // sections, content, quizzes and learner records cascade
    } catch (err) {
      console.error(`[learning] ${SITE_NAME} deletion failed after Moodle deletion:`, err instanceof Error ? err.message : err);
      throw new AppError(`The course was deleted from Moodle but could not be removed from ${SITE_NAME} Learning. Please try again to finish deleting it.`, 500);
    }
    await LearningRepository.removeFiles(files);
  }

  // ---------- uploads (browser -> Supabase Storage directly, via a signed upload URL) ----------
  static async createUpload(user: AuthUser, courseId: string, input: unknown): Promise<{ path: string; signedUrl: string; mimeType: string }> {
    requireAdmin(user);
    await loadBuildableCourse(courseId);
    const data = parse(uploadRequestSchema, input);
    const mime = resolveMime(data.fileName, data.mimeType);
    if (!allowedFor(data.kind, mime)) throw new ValidationError(`This file type is not supported. Use ${UPLOAD_RULES[data.kind].label}.`);
    const safe = data.fileName.normalize("NFKD").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-+/g, "-").slice(-100) || "file";
    const target = await LearningRepository.createUploadUrl(`${folderOf(courseId, data.kind)}${randomUUID()}-${safe}`);
    return { path: target.path, signedUrl: target.signedUrl, mimeType: mime };
  }

  /** Removes an upload the admin abandoned (never a file that content still uses). */
  static async discardUpload(user: AuthUser, courseId: string, path: string): Promise<void> {
    requireAdmin(user);
    await loadCourse(courseId);
    if (!path.startsWith(`courses/${courseId}/`) || path.includes("..")) throw new ValidationError("Invalid file");
    if (await LearningRepository.isPathReferenced(path)) return;
    await LearningRepository.removeFiles([path]);
  }

  // ---------- sections ----------
  static async addSection(user: AuthUser, courseId: string, input: unknown) {
    requireAdmin(user);
    await loadBuildableCourse(courseId);
    const data = parse(sectionInputSchema, input);
    const existing = await LearningRepository.listSections([courseId]);
    const row = await LearningRepository.insertSection({ course_id: courseId, ...data, position: existing.reduce((m, s) => Math.max(m, s.position + 1), 0) });
    await LearningRepository.touchCourse(courseId);
    LearningMoodleSync.schedulePush(courseId);
    return { id: row.id };
  }

  private static async loadSection(courseId: string, sectionId: string) {
    if (!UUID.test(sectionId)) throw new ValidationError("Invalid section");
    const sections = await LearningRepository.listSections([courseId]);
    const section = sections.find((s) => s.id === sectionId);
    if (!section) throw new NotFoundError("Section not found in this course");
    return { section, sections };
  }

  static async updateSection(user: AuthUser, courseId: string, sectionId: string, input: unknown): Promise<void> {
    requireAdmin(user);
    await loadBuildableCourse(courseId);
    await this.loadSection(courseId, sectionId);
    await LearningRepository.updateSection(sectionId, parse(sectionInputSchema.partial(), input));
    await LearningRepository.touchCourse(courseId);
    LearningMoodleSync.schedulePush(courseId);
  }

  static async deleteSection(user: AuthUser, courseId: string, sectionId: string): Promise<void> {
    requireAdmin(user);
    await loadBuildableCourse(courseId);
    const { sections } = await this.loadSection(courseId, sectionId);
    if (sections.length === 1) throw new ValidationError("A course needs at least one section");
    const files = (await LearningRepository.listContent([courseId])).filter((c) => c.section_id === sectionId).map((c) => c.storage_path ?? "");
    await LearningRepository.deleteSection(sectionId);
    await LearningRepository.removeFiles(files);
    await LearningRepository.touchCourse(courseId);
    LearningMoodleSync.schedulePush(courseId);
  }

  /** Saves the complete order: sections, and which items are in which section in which order. */
  static async saveLayout(user: AuthUser, courseId: string, input: unknown): Promise<void> {
    requireAdmin(user);
    await loadBuildableCourse(courseId);
    const data = parse(layoutSchema, input);
    const { sections, content } = await loadStructure(courseId);
    const sectionIds = data.sections.map((s) => s.id);
    const itemIds = data.sections.flatMap((s) => s.items);
    const same = (a: string[], b: string[]) => a.length === b.length && new Set(a).size === a.length && a.every((x) => b.includes(x));
    if (!same(sectionIds, sections.map((s) => s.id)) || !same(itemIds, content.map((c) => c.id))) {
      throw new ValidationError("The course changed in the meantime. Reload and try again");
    }
    await LearningRepository.applyLayout(
      data.sections.map((s, i) => ({ id: s.id, position: i })),
      data.sections.flatMap((s) => s.items.map((id, i) => ({ id, section_id: s.id, position: i }))),
    );
    await LearningRepository.touchCourse(courseId);
    LearningMoodleSync.schedulePush(courseId);
  }

  // ---------- content ----------
  private static async saveQuiz(type: ContentType, contentId: string, courseId: string, quiz: z.infer<typeof quizInputSchema> | undefined) {
    if (!quiz) return;
    if (type === "question" && quiz.questions.length > 1) throw new ValidationError("A single question item holds one question. Use a Quiz for more");
    const row = await LearningRepository.upsertQuiz({
      content_id: contentId,
      course_id: courseId,
      passing_score: type === "question" ? 100 : quiz.passingScore,
      time_limit_minutes: type === "question" ? null : quiz.timeLimitMinutes,
      attempts_allowed: type === "question" ? null : quiz.attemptsAllowed,
    });
    await LearningRepository.saveQuestions(row.id, quiz.questions);
  }

  private static async fileFields(courseId: string, type: ContentType, file: { path: string; name: string } | null | undefined) {
    if (file === undefined) return {};
    const kind = uploadKindFor(type);
    if (!file) {
      if (isFileType(type)) throw new ValidationError("Upload a file for this item");
      return { storage_path: null, file_name: null, mime_type: null, size_bytes: null };
    }
    if (!kind) throw new ValidationError("This content type does not take a file");
    const info = await verifyUpload(courseId, kind, file.path);
    return { storage_path: file.path, file_name: file.name, mime_type: info.contentType || resolveMime(file.name, ""), size_bytes: info.size };
  }

  static async addContent(user: AuthUser, courseId: string, input: unknown): Promise<{ id: string }> {
    requireAdmin(user);
    await loadBuildableCourse(courseId);
    const data = parse(contentInputSchema, input);
    await this.loadSection(courseId, data.sectionId);
    if (isFileType(data.type) && !data.file) throw new ValidationError("Upload a file for this item");
    if (isQuizType(data.type) && !data.quiz) throw new ValidationError("Quiz settings are missing");
    if (data.type === "lesson" && !data.body?.trim()) throw new ValidationError("Write the lesson text");

    const files = await this.fileFields(courseId, data.type, data.file);
    const siblings = (await LearningRepository.listContent([courseId])).filter((c) => c.section_id === data.sectionId);
    const row = await LearningRepository.insertContent({
      course_id: courseId,
      section_id: data.sectionId,
      content_type: data.type,
      title: data.title,
      description: data.description,
      body: data.body ?? null,
      settings: data.settings,
      position: siblings.reduce((m, c) => Math.max(m, c.position + 1), 0),
      ...files,
    });
    try {
      await this.saveQuiz(data.type, row.id, courseId, data.quiz);
    } catch (err) {
      await LearningRepository.deleteContent(row.id); // never leave a quiz item without its quiz
      throw err;
    }
    await LearningRepository.touchCourse(courseId);
    LearningMoodleSync.schedulePush(courseId);
    return { id: row.id };
  }

  private static async loadContent(courseId: string, contentId: string): Promise<ContentRow> {
    if (!UUID.test(contentId)) throw new ValidationError("Invalid content");
    const row = await LearningRepository.getContent(contentId);
    if (!row || row.course_id !== courseId) throw new NotFoundError("Content not found in this course");
    return row;
  }

  static async updateContent(user: AuthUser, courseId: string, contentId: string, input: unknown): Promise<{ id: string }> {
    requireAdmin(user);
    await loadBuildableCourse(courseId);
    const current = await this.loadContent(courseId, contentId);
    const data = parse(contentUpdateSchema, input);
    if (current.content_type === "lesson" && data.body !== undefined && !data.body?.trim()) throw new ValidationError("Write the lesson text");

    const files = await this.fileFields(courseId, current.content_type, data.file);
    await LearningRepository.updateContent(contentId, {
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.body !== undefined ? { body: data.body } : {}),
      ...(data.settings !== undefined ? { settings: data.settings } : {}),
      ...files,
    });
    if (isQuizType(current.content_type)) await this.saveQuiz(current.content_type, contentId, courseId, data.quiz);
    // A replaced or removed file is deleted from storage once the row points elsewhere.
    if ("storage_path" in files && current.storage_path && current.storage_path !== files.storage_path) await LearningRepository.removeFiles([current.storage_path]);
    await LearningRepository.touchCourse(courseId);
    LearningMoodleSync.schedulePush(courseId);
    return { id: contentId };
  }

  static async deleteContent(user: AuthUser, courseId: string, contentId: string): Promise<void> {
    requireAdmin(user);
    await loadBuildableCourse(courseId);
    const current = await this.loadContent(courseId, contentId);
    await LearningRepository.deleteContent(contentId);
    if (current.storage_path) await LearningRepository.removeFiles([current.storage_path]);
    await LearningRepository.touchCourse(courseId);
    LearningMoodleSync.schedulePush(courseId);
  }

  // ---------- learners ----------
  static async learners(user: AuthUser, courseId: string): Promise<LearnerRow[]> {
    requireAdmin(user);
    await loadCourse(courseId);
    const [enrollments, content] = await Promise.all([LearningRepository.listEnrollments({ courseIds: [courseId] }), LearningRepository.listContent([courseId])]);
    const userIds = enrollments.map((e) => e.user_id);
    const [pros, emails, progress] = await Promise.all([
      LearningRepository.getPractitioners(userIds),
      LearningRepository.getUserEmails(userIds),
      LearningRepository.listProgress({ courseIds: [courseId] }),
    ]);
    const itemIds = new Set(content.map((c) => c.id));
    const total = itemIds.size;
    return enrollments.map((e) => {
      const completed = progress.filter((p) => p.user_id === e.user_id && itemIds.has(p.content_id)).length;
      return {
        userId: e.user_id,
        name: pros.get(e.user_id)?.full_name ?? "Practitioner",
        email: emails.get(e.user_id) ?? null,
        startedAt: e.started_at,
        completedAt: e.completed_at,
        progress: { completed, total, percent: total ? Math.round((completed / total) * 100) : 0 },
      };
    });
  }

  static async responses(user: AuthUser, courseId: string, contentId: string): Promise<ResponseRow[]> {
    requireAdmin(user);
    await loadCourse(courseId);
    await this.loadContent(courseId, contentId);
    const rows = await LearningRepository.listResponses({ contentIds: [contentId] });
    const pros = await LearningRepository.getPractitioners(rows.map((r) => r.user_id));
    return rows.map((r) => ({ userId: r.user_id, name: pros.get(r.user_id)?.full_name ?? "Practitioner", text: r.response_text, rating: r.rating, submittedAt: r.submitted_at }));
  }

  static async searchPractitioners(user: AuthUser, q: string) {
    requireAdmin(user);
    return (await LearningRepository.searchPractitioners(q.slice(0, 100))).map((p) => ({ id: p.user_id, name: p.full_name, specialty: p.specializations?.[0] ?? null, photoUrl: p.photo_url }));
  }
}
