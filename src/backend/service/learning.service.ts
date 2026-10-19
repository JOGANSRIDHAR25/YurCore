import { SITE_NAME } from "@/shared/config/site";
import { z } from "zod";
import { AuthorizationError, NotFoundError, ValidationError } from "@/shared/api/api-error";
import type { AuthUser } from "@/shared/auth/auth.types";
import { ROLES } from "@/shared/security/roles";
import { isFileType, isQuizType } from "@/shared/learning/content";
import type { AttemptResult, AttemptStart, ItemProgress, LearnerCourse, LearnerCourseDetails, LearnerState } from "@/shared/learning/types";
import { LearningRepository, type AttemptRow, type ContentRow, type CourseRow, type QuizRow } from "../repo/learning.repo";
import { UUID, buildSections, summaries } from "./learning-common";
import { LearningMoodleSync } from "./learning-moodle-sync.service";

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

const expired = (a: AttemptRow, limit: number | null) => limit !== null && Date.now() > new Date(a.started_at).getTime() + limit * 60000 + GRACE_MS;

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
    if (!complete && enrollment.completed_at) await LearningRepository.setCompleted(courseId, userId, null);
  }

  // ---------- queries ----------
  static async list(user: AuthUser, scope: ScopeFilter, filters: { q?: string; category?: string }): Promise<LearnerCourse[]> {
    await this.requirePractitioner(user);
    // Courses created or changed in Moodle are picked up in the background (at most every few minutes).
    LearningMoodleSync.scheduleRefresh(null);
    const enrollments = await LearningRepository.listEnrollments({ userId: user.id });
    const rows = await LearningRepository.listCourses({ status: "published", ...(scope === "all" ? filters : { ids: enrollments.map((e) => e.course_id) }) });
    const { list, content } = await summaries(rows);
    const progress = await LearningRepository.listProgress({ userId: user.id, courseIds: rows.map((r) => r.id) });
    const done = new Set(progress.map((p) => p.content_id));

    const out = list.map<LearnerCourse>((c) => {
      const e = enrollments.find((x) => x.course_id === c.id);
      const items = content.filter((x) => x.course_id === c.id);
      const completed = items.filter((x) => done.has(x.id)).length;
      const state: LearnerState = !e ? "not_started" : e.completed_at ? "completed" : "in_progress";
      return { ...c, enrolled: Boolean(e), state, progress: e ? { completed, total: items.length, percent: items.length ? Math.round((completed / items.length) * 100) : 0 } : null };
    });
    return scope === "completed" ? out.filter((c) => c.state === "completed") : out;
  }

  static async categories(user: AuthUser): Promise<string[]> {
    await this.requirePractitioner(user);
    return LearningRepository.categories(true);
  }

  static async getDetails(user: AuthUser, courseId: string): Promise<LearnerCourseDetails> {
    await this.requirePractitioner(user);
    const row = await this.loadPublished(courseId);
    const [{ list, sections: sectionRows, content }, enrollment, progressRows] = await Promise.all([
      summaries([row]),
      LearningRepository.getEnrollment(courseId, user.id),
      LearningRepository.listProgress({ userId: user.id, courseIds: [courseId] }),
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
      course: { ...list[0], enrolled: Boolean(enrollment), state, progress: enrollment ? { completed, total, percent: total ? Math.round((completed / total) * 100) : 0 } : null },
      sections,
      progress,
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
