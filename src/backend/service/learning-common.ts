import "server-only";

import type { ContentItem, CourseCounts, CourseSummary, QuizQuestion, Section } from "@/shared/learning/types";
import { LearningRepository, type ContentRow, type CourseRow, type PractitionerInfo, type QuestionRow, type QuizRow, type SectionRow } from "../repo/learning.repo";

/** Helpers shared by the admin (course building) and practitioner (learning) services. */

/** Signed URLs for private course files. Long enough to watch a long video without the link expiring. */
export const FILE_URL_TTL = 3 * 60 * 60;

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function countsFor(courseId: string, sections: SectionRow[], content: ContentRow[]): CourseCounts {
  const items = content.filter((c) => c.course_id === courseId);
  return {
    sections: sections.filter((s) => s.course_id === courseId).length,
    items: items.length,
    videos: items.filter((c) => c.content_type === "video").length,
    documents: items.filter((c) => c.content_type === "document" || c.content_type === "file").length,
    quizzes: items.filter((c) => c.content_type === "quiz" || c.content_type === "question").length,
  };
}

const instructorDto = (p: PractitionerInfo | undefined) =>
  p ? { id: p.user_id, name: p.full_name, specialty: p.specializations?.[0] ?? null, photoUrl: p.photo_url } : null;

/** Course cards/headers for a list of courses: counts, instructor and a signed thumbnail URL. */
export async function summaries(rows: CourseRow[]): Promise<{ list: CourseSummary[]; sections: SectionRow[]; content: ContentRow[] }> {
  const ids = rows.map((r) => r.id);
  const [sections, content, instructors, thumbs] = await Promise.all([
    LearningRepository.listSections(ids),
    LearningRepository.listContent(ids),
    LearningRepository.getPractitioners([...new Set(rows.map((r) => r.instructor_id).filter((x): x is string => Boolean(x)))]),
    LearningRepository.signedUrls(rows.map((r) => r.thumbnail_path ?? ""), FILE_URL_TTL).catch(() => new Map<string, string>()),
  ]);
  const list = rows.map<CourseSummary>((r) => ({
    id: r.id,
    title: r.title,
    shortDescription: r.short_description ?? "",
    description: r.description ?? "",
    category: r.category_name,
    level: r.level,
    durationMinutes: r.duration_minutes,
    learningObjectives: r.learning_objectives ?? [],
    instructor: instructorDto(r.instructor_id ? instructors.get(r.instructor_id) : undefined),
    thumbnailUrl: r.thumbnail_path ? thumbs.get(r.thumbnail_path) ?? null : null,
    status: r.status,
    publishedAt: r.published_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    counts: countsFor(r.id, sections, content),
  }));
  return { list, sections, content };
}

const questionDto = (q: QuestionRow): QuizQuestion => ({
  id: q.id,
  question: q.question,
  explanation: q.explanation,
  options: q.options.map((o) => ({ id: o.id, text: o.option_text, correct: o.is_correct })),
});

/**
 * The ordered course structure with signed file URLs. Admins also get quiz questions with the
 * correct answers; learners only get question counts (questions come with an attempt).
 */
export async function buildSections(sectionRows: SectionRow[], contentRows: ContentRow[], opts: { withQuestions: boolean }): Promise<{ sections: Section[]; quizzes: Map<string, QuizRow & { questions: QuestionRow[] }> }> {
  const quizIds = contentRows.filter((c) => c.content_type === "quiz" || c.content_type === "question").map((c) => c.id);
  const [urls, quizzes] = await Promise.all([
    LearningRepository.signedUrls(contentRows.map((c) => c.storage_path ?? ""), FILE_URL_TTL),
    LearningRepository.getQuizzes(quizIds, opts.withQuestions),
  ]);

  const item = (c: ContentRow): ContentItem => {
    const quiz = quizzes.get(c.id);
    return {
      id: c.id,
      sectionId: c.section_id,
      type: c.content_type,
      title: c.title,
      description: c.description ?? "",
      body: c.body,
      settings: (c.settings ?? {}) as ContentItem["settings"],
      file: c.storage_path
        ? { path: c.storage_path, name: c.file_name ?? "file", mimeType: c.mime_type ?? "application/octet-stream", size: Number(c.size_bytes ?? 0), url: urls.get(c.storage_path) ?? null }
        : null,
      quiz: quiz
        ? {
            passingScore: quiz.passing_score,
            timeLimitMinutes: quiz.time_limit_minutes,
            attemptsAllowed: quiz.attempts_allowed,
            questionCount: quiz.questions.length,
            ...(opts.withQuestions ? { questions: quiz.questions.map(questionDto) } : {}),
          }
        : null,
    };
  };

  const sections = [...sectionRows]
    .sort((a, b) => a.position - b.position)
    .map<Section>((s) => ({
      id: s.id,
      title: s.title,
      description: s.description ?? "",
      items: contentRows.filter((c) => c.section_id === s.id).sort((a, b) => a.position - b.position).map(item),
    }));
  return { sections, quizzes };
}
