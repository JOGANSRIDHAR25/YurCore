import { SITE_NAME } from "@/shared/config/site";
import { z } from "zod";
import { AuthorizationError, NotFoundError, ValidationError } from "@/shared/api/api-error";
import type { AuthUser } from "@/shared/auth/auth.types";
import { ROLES } from "@/shared/security/roles";
import { isFileType, isQuizType } from "@/shared/learning/content";
import type { AttemptResult, AttemptStart, CourseCompletion, CourseRating, ItemProgress, LearnerCourse, LearnerCourseCard, LearnerCourseDetails, LearnerCoursePage, LearnerState } from "@/shared/learning/types";
import { LearningRepository, type AttemptRow, type ContentRow, type CourseCardRow, type CourseCursor, type CourseRow, type CourseSort, type QuizRow } from "../repo/learning.repo";
import { LearningProfileRepository } from "../repo/learning-profile.repo";
import { FILE_URL_TTL, UUID, buildSections, summaries } from "./learning-common";
import { LearningMoodleSync } from "./learning-moodle-sync.service";
import { LearningCredentials } from "./learning-credentials.service";
import { LearningNotify } from "./learning-notify.service";
import { LearningProfileService } from "./learning-profile.service";

/**
 * Practitioner-facing learning. Read/learn only: there is deliberately no create, edit,
 * delete or publish here (those live in LearningAdminService, admin roles only).
 * Only published courses exist as far as learners are concerned.
 */

export type ScopeFilter = "all" | "mine" | "completed";

/** Extra time accepted after a quiz's time limit (network latency, auto-submit). */
const GRACE_MS = 2 * 60 * 1000;

export const attemptSubmitSchema = z.object({ answers: z.record(z.string().regex(UUID), z.string().regex(UUID)).default({}) });
export const responseSchema = z.object({ text: z.string().trim().max(20000).default(""), rating: z.number().int().min(1).max(5).nullable().optional() });
export const courseFeedbackSchema = z.object({
  rating: z.number({ error: "Choose a rating from 1 to 5" }).int("Choose a rating from 1 to 5").min(1, "Choose a rating from 1 to 5").max(5, "Choose a rating from 1 to 5"),
  comment: z.string().trim().max(5000, "Your comment is too long").default(""),
});

/** The default course feedback title when the admin has not set one: always follows the current course title. */
export const feedbackTitleFor = (course: Pick<CourseRow, "title" | "feedback_title">) => course.feedback_title?.trim() || `${course.title} — Course Feedback`;

const expired = (a: AttemptRow, limit: number | null) => limit !== null && Date.now() > new Date(a.started_at).getTime() + limit * 60000 + GRACE_MS;

/** Catalogue batch size ("Show more" loads this many at a time) and the most a client may ask for at once. */
export const LIST_PAGE_SIZE = 12;
export const LIST_PAGE_MAX = 48;

/** The cursor is opaque to clients: base64url JSON of the last card's sort key. Anything malformed is rejected. */
export function encodeCursor(c: CourseCursor): string {
  return Buffer.from(JSON.stringify(c.sort && c.sort !== "published" ? [c.publishedAt, c.id, c.sort] : [c.publishedAt, c.id])).toString("base64url");
}
export function decodeCursor(raw: string | null | undefined): CourseCursor | null {
  if (!raw) return null;
  try {
    const [publishedAt, id, sort = "published"] = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as unknown[];
    const validDate = publishedAt === null || (typeof publishedAt === "string" && publishedAt.length <= 40 && !Number.isNaN(Date.parse(publishedAt)) && /^[0-9T:.+\-Z ]+$/.test(publishedAt));
    const validSort = sort === "published" || sort === "newest" || sort === "oldest";
    if (typeof id === "string" && UUID.test(id) && validDate && validSort) return sort === "published" ? { publishedAt: publishedAt as string | null, id } : { publishedAt: publishedAt as string | null, id, sort: sort as CourseSort };
  } catch { /* fall through */ }
  throw new ValidationError("Invalid page cursor");
}

/** Card text: whitespace collapsed and cut at a word boundary, so a long full description is not sent whole. */
const SUMMARY_MAX = 220;
function summarize(text: string | null | undefined): string {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  if (t.length <= SUMMARY_MAX) return t;
  const cut = t.slice(0, SUMMARY_MAX);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), SUMMARY_MAX - 40)).trimEnd()}…`;
}

export class LearningService {
  /** Only practitioners (not assistants/patients/admins) may use the learner experience. */
  private static async requirePractitioner(user: AuthUser) {
    if (user.role !== ROLES.DOCTOR) throw new AuthorizationError(`${SITE_NAME} Learning is available to practitioners only`);
    const p = await LearningRepository.getPractitioner(user.id);
    if (!p) throw new AuthorizationError("No practitioner profile found for this account");
  }

  private static async loadPublished(id: string): Promise<CourseRow> {
    if (!UUID.test(id)) throw new ValidationError("Invalid course");
    const row = await LearningRepository.getCourse(id);
    if (!row || row.status !== "published") throw new NotFoundError("Course not found");
    return row;
  }

  private static async loadItem(courseId: string, contentId: string): Promise<ContentRow> {
    if (!UUID.test(contentId)) throw new ValidationError("Invalid content");
    const row = await LearningRepository.getContent(contentId);
    if (!row || row.course_id !== courseId) throw new NotFoundError("Content not found");
    return row;
  }

  private static async loadQuiz(contentId: string, withQuestions: boolean) {
    const quiz = (await LearningRepository.getQuizzes([contentId], withQuestions)).get(contentId);
    if (!quiz) throw new NotFoundError("Quiz not found");
    return quiz;
  }

  /** Marks the course complete (or not) from the learner's item progress. */
  private static async syncCompletion(courseId: string, userId: string) {
    const [content, progress, enrollment] = await Promise.all([
      LearningRepository.listContent([courseId]),
      LearningRepository.listProgress({ userId, courseIds: [courseId] }),
      LearningRepository.getEnrollment(courseId, userId),
    ]);
    if (!enrollment) return;
    const done = new Set(progress.map((p) => p.content_id));
    const complete = content.length > 0 && content.every((c) => done.has(c.id));
    if (complete && !enrollment.completed_at) await LearningRepository.setCompleted(courseId, userId, new Date().toISOString());
    // A completion is never undone once the certificate exists (the certificate and its credits stand).
    if (!complete && enrollment.completed_at && !(await LearningProfileRepository.getCertificateFor(userId, courseId))) await LearningRepository.setCompleted(courseId, userId, null);
    if (complete) await this.issueIfEligible(courseId, userId);
  }

  /**
   * Issues the certificate (and credits) as soon as every rule is met. The database re-checks completion and
   * feedback under a lock, so this is safe to call repeatedly and concurrently. PDF, emails and the target check
   * run after the response.
   */
  private static async issueIfEligible(courseId: string, userId: string) {
    try {
      const r = await LearningCredentials.issueIfEligible(userId, courseId);
      if (r.created && r.certificate) LearningNotify.scheduleCertificateIssued(r.certificate.id);
      return r;
    } catch (err) {
      // Completion is already stored; issuing is retried on the next course visit.
      console.error("[learning] certificate issue failed:", err instanceof Error ? err.message : err);
      return null;
    }
  }

  // ---------- queries ----------
  /**
   * One batch of the learner's catalogue. Filters (scope, search, category) are applied in the database before
   * paging, and only the batch's courses get counts, progress, instructors and signed thumbnail URLs.
   */
  static async list(
    user: AuthUser,
    scope: ScopeFilter,
    filters: { q?: string; category?: string; categoryIds?: string[]; sort?: CourseSort },
    page: { limit?: number; cursor?: string | null } = {},
  ): Promise<LearnerCoursePage> {
    await this.requirePractitioner(user);
    const limit = Math.min(Math.max(Math.trunc(page.limit ?? LIST_PAGE_SIZE), 1), LIST_PAGE_MAX);
    const cursor = decodeCursor(page.cursor);
    const sort = filters.sort ?? "published";
    if (cursor && (cursor.sort ?? "published") !== sort) throw new ValidationError("Invalid page cursor");
    // Courses created or changed in Moodle are picked up in the background (at most every few minutes).
    if (!cursor) LearningMoodleSync.scheduleRefresh(null);

    const enrollments = await LearningRepository.listUserEnrollments(user.id);
    // My Learning = started and not yet completed; completed courses live only under Completed Courses.
    let scoped = scope === "all" ? undefined : enrollments.filter((e) => (scope === "mine" ? !e.completed_at : Boolean(e.completed_at))).map((e) => e.course_id);
    // Category filter (any of the chosen categories). An explicit filter never falls back to other courses.
    if (filters.categoryIds?.length) {
      const inCategories = new Set(await LearningProfileRepository.courseIdsInCategories(filters.categoryIds));
      scoped = (scoped ?? [...inCategories]).filter((id) => inCategories.has(id));
    }
    if (scoped && scoped.length === 0) return { items: [], nextCursor: null, hasMore: false, total: cursor ? null : 0 };

    const { rows, hasMore, total } = await LearningRepository.listPublishedCoursePage({ q: filters.q, category: filters.category, ids: scoped, cursor, limit, withTotal: !cursor, sort });
    const items = await this.cards(user.id, rows, enrollments);
    const last = rows.at(-1);
    const key = last ? (sort === "published" ? last.published_at : last.created_at) : null;
    return { items, hasMore, nextCursor: hasMore && last ? encodeCursor({ publishedAt: key, id: last.id, sort }) : null, total };
  }

  /** Card DTOs for a batch: counts, progress, instructors and signed thumbnail URLs for those courses only. */
  private static async cards(userId: string, rows: CourseCardRow[], enrollments: Awaited<ReturnType<typeof LearningRepository.listUserEnrollments>>): Promise<LearnerCourseCard[]> {
    const ids = rows.map((r) => r.id);
    const [content, progress, instructors, thumbs, ratings] = await Promise.all([
      LearningRepository.listContentIds(ids),
      LearningRepository.listUserProgress(userId, ids),
      LearningRepository.getPractitioners([...new Set(rows.map((r) => r.instructor_id).filter((x): x is string => Boolean(x)))]),
      LearningRepository.signedUrls(rows.map((r) => r.thumbnail_path ?? ""), FILE_URL_TTL).catch(() => new Map<string, string>()),
      ratingsFor(ids),
    ]);
    const done = new Set(progress.map((p) => p.content_id));
    const enrolled = new Map(enrollments.map((e) => [e.course_id, e]));

    return rows.map<LearnerCourseCard>((r) => {
      const e = enrolled.get(r.id);
      const own = content.filter((x) => x.course_id === r.id);
      const completed = own.filter((x) => done.has(x.id)).length;
      const state: LearnerState = !e ? "not_started" : e.completed_at ? "completed" : "in_progress";
      return {
        id: r.id,
        title: r.title,
        summary: summarize(r.short_description || r.description),
        category: r.category_name,
        level: r.level,
        durationMinutes: r.duration_minutes,
        items: own.length,
        thumbnailUrl: r.thumbnail_path ? thumbs.get(r.thumbnail_path) ?? null : null,
        instructorName: r.instructor_id ? instructors.get(r.instructor_id)?.full_name ?? null : null,
        credits: Number(r.credits ?? 0),
        creditType: r.credit_type ?? "cme",
        createdAt: r.created_at,
        rating: ratings?.get(r.id) ?? null,
        enrolled: Boolean(e),
        state,
        progress: e ? { completed, total: own.length, percent: own.length ? Math.round((completed / own.length) * 100) : 0 } : null,
      };
    });
  }

  /** "Recommended for You" cards (see LearningProfileService.recommendations for the ranking). */
  static async recommended(user: AuthUser): Promise<LearnerCourseCard[]> {
    const { ids, interestCourses } = await LearningProfileService.recommendations(user);
    if (ids.length === 0) return [];
    const [rows, enrollments] = await Promise.all([LearningRepository.listPublishedCards({ ids: ids.map((x) => x.id), limit: ids.length }), LearningRepository.listUserEnrollments(user.id)]);
    const order = new Map(ids.map((x, i) => [x.id, i]));
    const cards = await this.cards(user.id, rows.sort((a, b) => order.get(a.id)! - order.get(b.id)!), enrollments);
    return cards.map((c) => ({ ...c, matchesInterests: interestCourses.has(c.id) }));
  }

  /** Category names for the catalogue's category dropdown (primary categories of published courses). */
  static async categories(user: AuthUser): Promise<string[]> {
    await this.requirePractitioner(user);
    return LearningRepository.categories(true);
  }

  static async getDetails(user: AuthUser, courseId: string): Promise<LearnerCourseDetails> {
    await this.requirePractitioner(user);
    const row = await this.loadPublished(courseId);
    const [{ list, sections: sectionRows, content }, enrollment, progressRows, ratings] = await Promise.all([
      summaries([row]),
      LearningRepository.getEnrollment(courseId, user.id),
      LearningRepository.listProgress({ userId: user.id, courseIds: [courseId] }),
      ratingsFor([courseId]),
    ]);
    const { sections, quizzes } = await buildSections(sectionRows, content, { withQuestions: false });
    const quizByContent = new Map([...quizzes].map(([cid, q]) => [cid, q]));
    const attempts = await LearningRepository.listAttempts([...quizzes.values()].map((q) => q.id), user.id);
    const responses = await LearningRepository.listResponses({ contentIds: content.filter((c) => c.content_type === "assignment" || c.content_type === "feedback").map((c) => c.id), userId: user.id });
    const done = new Set(progressRows.map((p) => p.content_id));

    const progress: Record<string, ItemProgress> = {};
    for (const c of content) {
      const p: ItemProgress = { completed: done.has(c.id) };
      const quiz = quizByContent.get(c.id);
      if (quiz) {
        const mine = attempts.filter((a) => a.quiz_id === quiz.id);
        const submitted = mine.filter((a) => a.submitted_at);
        p.attemptsUsed = submitted.length + mine.filter((a) => !a.submitted_at && expired(a, quiz.time_limit_minutes)).length;
        p.bestScore = submitted.length ? Math.max(...submitted.map((a) => a.score_percent ?? 0)) : null;
        p.passed = submitted.length ? submitted.some((a) => a.passed) : null;
      }
      const r = responses.find((x) => x.content_id === c.id);
      if (r) p.response = { text: r.response_text, rating: r.rating, submittedAt: r.submitted_at };
      progress[c.id] = p;
    }

    const total = content.length;
    const completed = content.filter((c) => done.has(c.id)).length;
    const state: LearnerState = !enrollment ? "not_started" : enrollment.completed_at ? "completed" : "in_progress";
    return {
      course: { ...list[0], enrolled: Boolean(enrollment), state, rating: ratings?.get(courseId) ?? null, progress: enrollment ? { completed, total, percent: total ? Math.round((completed / total) * 100) : 0 } : null },
      sections,
      progress,
      completion: await this.completion(row, user.id, Boolean(enrollment?.completed_at) && total > 0 && completed === total),
    };
  }

  /** What the learner still needs before the certificate. Issues it now if everything is met but it is missing (e.g. a failed earlier attempt). */
  private static async completion(row: CourseRow, userId: string, contentComplete: boolean): Promise<CourseCompletion> {
    const [feedback, existing] = await Promise.all([LearningProfileRepository.getFeedback(row.id, userId), LearningProfileRepository.getCertificateFor(userId, row.id)]);
    let cert = existing;
    const feedbackDone = !row.feedback_enabled || Boolean(feedback);
    if (contentComplete && feedbackDone && !cert) cert = (await this.issueIfEligible(row.id, userId))?.certificate ?? null;
    const stage: CourseCompletion["stage"] = cert ? (cert.status === "revoked" ? "revoked" : "issued") : !contentComplete ? "in_progress" : !feedbackDone ? "feedback_required" : "issuing";
    return {
      contentComplete,
      credits: Number(row.credits ?? 0),
      creditType: row.credit_type ?? "cme",
      feedback: {
        enabled: row.feedback_enabled,
        title: feedbackTitleFor(row),
        allowComment: row.feedback_allow_comment,
        submitted: feedback ? { rating: feedback.rating, comment: feedback.comment, submittedAt: feedback.submitted_at } : null,
      },
      certificate: cert ? LearningCredentials.toDto(cert) : null,
      stage,
    };
  }

  // ---------- commands ----------
  static async start(user: AuthUser, courseId: string): Promise<void> {
    await this.requirePractitioner(user);
    await this.loadPublished(courseId);
    await LearningRepository.enroll(courseId, user.id);
  }

  /** Viewing items (media, documents, lessons) are completed by the learner. Assessments complete through their own flow. */
  static async complete(user: AuthUser, courseId: string, contentId: string): Promise<void> {
    await this.requirePractitioner(user);
    await this.loadPublished(courseId);
    const item = await this.loadItem(courseId, contentId);
    if (!isFileType(item.content_type) && item.content_type !== "lesson") throw new ValidationError("This item is completed by submitting it");
    await LearningRepository.enroll(courseId, user.id);
    await LearningRepository.markComplete(courseId, contentId, user.id);
    await this.syncCompletion(courseId, user.id);
  }

  static async startAttempt(user: AuthUser, courseId: string, contentId: string): Promise<AttemptStart> {
    await this.requirePractitioner(user);
    await this.loadPublished(courseId);
    const item = await this.loadItem(courseId, contentId);
    if (!isQuizType(item.content_type)) throw new ValidationError("This item is not a quiz");
    const quiz = await this.loadQuiz(contentId, true);
    if (quiz.questions.length === 0) throw new ValidationError("This quiz has no questions yet");
    await LearningRepository.enroll(courseId, user.id);

    const mine = await LearningRepository.listAttempts([quiz.id], user.id);
    // Resume an attempt that is still running instead of starting (and using up) another one.
    let attempt = mine.find((a) => !a.submitted_at && !expired(a, quiz.time_limit_minutes)) ?? null;
    if (!attempt) {
      const used = mine.filter((a) => a.submitted_at || expired(a, quiz.time_limit_minutes)).length;
      if (quiz.attempts_allowed !== null && used >= quiz.attempts_allowed) throw new ValidationError("You have used all attempts for this quiz");
      attempt = await LearningRepository.insertAttempt(quiz.id, user.id);
    }
    return {
      attemptId: attempt.id,
      startedAt: attempt.started_at,
      timeLimitMinutes: quiz.time_limit_minutes,
      questions: quiz.questions.map((q) => ({ id: q.id, question: q.question, options: q.options.map((o) => ({ id: o.id, text: o.option_text })) })),
    };
  }

  static async submitAttempt(user: AuthUser, courseId: string, contentId: string, attemptId: string, input: unknown): Promise<AttemptResult> {
    await this.requirePractitioner(user);
    await this.loadPublished(courseId);
    await this.loadItem(courseId, contentId);
    const parsed = attemptSubmitSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError("Invalid answers");
    const quiz = await this.loadQuiz(contentId, true);
    if (!UUID.test(attemptId)) throw new ValidationError("Invalid attempt");
    const attempt = await LearningRepository.getAttempt(attemptId);
    if (!attempt || attempt.user_id !== user.id || attempt.quiz_id !== quiz.id) throw new NotFoundError("Attempt not found");
    if (attempt.submitted_at) throw new ValidationError("This attempt was already submitted");

    // Answers sent after the time limit (plus grace) are not counted.
    const answers = expired(attempt, quiz.time_limit_minutes) ? {} : parsed.data.answers;
    const result = grade(quiz, answers);
    const ok = await LearningRepository.submitAttempt(attemptId, { answers, correct_count: result.correct, total_count: result.total, score_percent: result.scorePercent, passed: result.passed });
    if (!ok) throw new ValidationError("This attempt was already submitted");

    const item = await LearningRepository.getContent(contentId);
    // A quiz completes when passed; a single knowledge-check question completes once answered.
    if (result.passed || item?.content_type === "question") {
      await LearningRepository.markComplete(courseId, contentId, user.id);
      await this.syncCompletion(courseId, user.id);
    }
    return result;
  }

  static async respond(user: AuthUser, courseId: string, contentId: string, input: unknown): Promise<void> {
    await this.requirePractitioner(user);
    await this.loadPublished(courseId);
    const item = await this.loadItem(courseId, contentId);
    if (item.content_type !== "assignment" && item.content_type !== "feedback") throw new ValidationError("This item does not take a response");
    const parsed = responseSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid response");
    const wantsRating = item.content_type === "feedback" && (item.settings as { rating?: boolean })?.rating;
    if (!parsed.data.text && !(wantsRating && parsed.data.rating)) throw new ValidationError(item.content_type === "assignment" ? "Write your submission" : "Write your feedback");
    await LearningRepository.enroll(courseId, user.id);
    await LearningRepository.saveResponse({ course_id: courseId, content_id: contentId, user_id: user.id, response_text: parsed.data.text, rating: wantsRating ? parsed.data.rating ?? null : null });
    await LearningRepository.markComplete(courseId, contentId, user.id);
    await this.syncCompletion(courseId, user.id);
  }

  /**
   * Course-level feedback (configured by the admin per course, separate from course content). Available once
   * all course content is complete; the rating is required, the comment optional. Submitting it is what unlocks
   * the certificate when feedback is enabled. One feedback per learner per course: a resubmission revises it.
   */
  static async submitFeedback(user: AuthUser, courseId: string, input: unknown): Promise<CourseCompletion> {
    await this.requirePractitioner(user);
    const row = await this.loadPublished(courseId);
    if (!row.feedback_enabled) throw new ValidationError("Feedback is not enabled for this course");
    const parsed = courseFeedbackSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid feedback");
    const [content, progress, enrollment] = await Promise.all([
      LearningRepository.listContent([courseId]),
      LearningRepository.listProgress({ userId: user.id, courseIds: [courseId] }),
      LearningRepository.getEnrollment(courseId, user.id),
    ]);
    const done = new Set(progress.map((p) => p.content_id));
    const contentComplete = Boolean(enrollment) && content.length > 0 && content.every((c) => done.has(c.id));
    if (!contentComplete) throw new ValidationError("Complete all course content before giving feedback");
    const comment = row.feedback_allow_comment ? parsed.data.comment : "";
    await LearningProfileRepository.saveFeedback(courseId, user.id, parsed.data.rating, comment);
    await this.syncCompletion(courseId, user.id);
    return this.completion(row, user.id, true);
  }
}

/** Rating aggregates for a batch of courses; null (shown as no rating at all) if they cannot be loaded, so a ratings problem never breaks the catalogue. */
async function ratingsFor(courseIds: string[]): Promise<Map<string, CourseRating> | null> {
  try {
    return await LearningProfileRepository.courseRatings(courseIds);
  } catch (err) {
    console.error("[learning] course ratings unavailable:", err instanceof Error ? err.message : err);
    return null;
  }
}

/** Scores answers against the stored correct options. Unknown question/option ids score nothing. */
export function grade(quiz: QuizRow & { questions: { id: string; explanation: string; options: { id: string; is_correct: boolean }[] }[] }, answers: Record<string, string>): AttemptResult {
  const review = quiz.questions.map((q) => {
    const correct = q.options.find((o) => o.is_correct);
    const chosen = answers[q.id] && q.options.some((o) => o.id === answers[q.id]) ? answers[q.id] : null;
    return { questionId: q.id, chosen, correctOptionId: correct?.id ?? "", explanation: q.explanation };
  });
  const correct = review.filter((r) => r.chosen && r.chosen === r.correctOptionId).length;
  const total = quiz.questions.length;
  const scorePercent = total ? Math.round((correct / total) * 100) : 0;
  return { scorePercent, correct, total, passed: scorePercent >= quiz.passing_score, passingScore: quiz.passing_score, review };
}
