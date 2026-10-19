import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/db/supabase.server", () => ({ createClient: () => { throw new Error("db must not be reached"); } }));

import { LearningAdminService, contentInputSchema, courseInputSchema, layoutSchema, publishProblems, questionInputSchema, uploadRequestSchema } from "@/backend/service/learning-admin.service";
import { LearningService, grade } from "@/backend/service/learning.service";
import { allowedFor, resolveMime } from "@/shared/learning/content";
import type { AuthUser } from "@/shared/auth/auth.types";

const user = (role: AuthUser["role"]): AuthUser => ({ id: "11111111-1111-4111-8111-111111111111", email: "u@meyveda.in", role, permissions: [] });
const ID = "22222222-2222-4222-8222-222222222222";
const q = (correct: number, n = 4) => ({ question: "Which dosha governs movement?", explanation: "", options: Array.from({ length: n }, (_, i) => ({ text: `Option ${i}`, correct: i === correct })) });

describe("YurCore Learning authorization", () => {
  it("rejects every course-building action for practitioners and other non-admin roles before touching data", async () => {
    for (const role of ["doctor", "assistant", "patient", "staff"] as const) {
      const u = user(role);
      const calls = [
        LearningAdminService.list(u),
        LearningAdminService.getDetails(u, ID),
        LearningAdminService.createCourse(u, { title: "Hacked course" }),
        LearningAdminService.updateCourse(u, ID, { title: "x" }),
        LearningAdminService.setPublished(u, ID, true),
        LearningAdminService.deleteCourse(u, ID),
        LearningAdminService.createUpload(u, ID, { kind: "video", fileName: "a.mp4", mimeType: "video/mp4", size: 10 }),
        LearningAdminService.discardUpload(u, ID, `courses/${ID}/videos/a.mp4`),
        LearningAdminService.addSection(u, ID, { title: "x" }),
        LearningAdminService.updateSection(u, ID, ID, { title: "x" }),
        LearningAdminService.deleteSection(u, ID, ID),
        LearningAdminService.saveLayout(u, ID, { sections: [] }),
        LearningAdminService.addContent(u, ID, { sectionId: ID, type: "lesson", title: "x", body: "y" }),
        LearningAdminService.updateContent(u, ID, ID, { title: "x" }),
        LearningAdminService.deleteContent(u, ID, ID),
        LearningAdminService.learners(u, ID),
        LearningAdminService.responses(u, ID, ID),
        LearningAdminService.searchPractitioners(u, "abc"),
      ];
      for (const c of calls) await expect(c).rejects.toMatchObject({ statusCode: 403 });
    }
  });

  it("only exposes read/learn operations to practitioners", () => {
    const methods = Object.getOwnPropertyNames(LearningService).filter((n) => typeof (LearningService as never)[n] === "function");
    for (const m of ["createCourse", "updateCourse", "deleteCourse", "setPublished", "addContent", "saveLayout"]) expect(methods).not.toContain(m);
  });

  it("does not let admins, patients or assistants use the learner experience", async () => {
    for (const role of ["admin", "super_admin", "patient", "assistant"] as const) {
      await expect(LearningService.list(user(role), "all", {})).rejects.toMatchObject({ statusCode: 403 });
      await expect(LearningService.startAttempt(user(role), ID, ID)).rejects.toMatchObject({ statusCode: 403 });
    }
  });
});

describe("YurCore Learning validation", () => {
  it("requires exactly one correct answer and at least two options per question", () => {
    expect(questionInputSchema.safeParse(q(1)).success).toBe(true);
    expect(questionInputSchema.safeParse({ ...q(1), options: q(1).options.map((o) => ({ ...o, correct: true })) }).success).toBe(false);
    expect(questionInputSchema.safeParse({ ...q(0), options: q(0).options.map((o) => ({ ...o, correct: false })) }).success).toBe(false);
    expect(questionInputSchema.safeParse(q(0, 1)).success).toBe(false);
    expect(questionInputSchema.safeParse({ ...q(0), question: "  " }).success).toBe(false);
  });

  it("validates course and content payloads", () => {
    expect(courseInputSchema.safeParse({ title: "Ab" }).success).toBe(false);
    expect(courseInputSchema.safeParse({ title: "Ayurveda basics", level: "expert" }).success).toBe(false);
    expect(courseInputSchema.safeParse({ title: "Ayurveda basics", level: "beginner", durationMinutes: 90, learningObjectives: ["Explain doshas"] }).success).toBe(true);
    expect(contentInputSchema.safeParse({ sectionId: "not-a-uuid", type: "video", title: "x" }).success).toBe(false);
    expect(contentInputSchema.safeParse({ sectionId: ID, type: "podcast", title: "x" }).success).toBe(false);
    expect(contentInputSchema.safeParse({ sectionId: ID, type: "quiz", title: "Quiz", quiz: { passingScore: 70, questions: [q(2)] } }).success).toBe(true);
    expect(layoutSchema.safeParse({ sections: [{ id: ID, items: ["x"] }] }).success).toBe(false);
  });

  it("has no count or size cap on uploads, only file-type rules", () => {
    expect(uploadRequestSchema.safeParse({ kind: "video", fileName: "lecture.mp4", mimeType: "video/mp4", size: 40 * 1024 ** 3 }).success).toBe(true);
    expect(allowedFor("video", "video/mp4")).toBe(true);
    expect(allowedFor("video", "application/pdf")).toBe(false);
    expect(allowedFor("image", "image/svg+xml")).toBe(false);
    expect(allowedFor("document", resolveMime("notes.docx", ""))).toBe(true);
    expect(allowedFor("file", "application/x-msdownload")).toBe(false);
  });

  it("blocks publishing empty courses, files without uploads and quizzes without questions", () => {
    expect(publishProblems([], new Map())).toHaveLength(1);
    const items = [
      { id: "a", content_type: "video" as const, title: "Intro", storage_path: null },
      { id: "b", content_type: "quiz" as const, title: "Quiz 1", storage_path: null },
      { id: "c", content_type: "lesson" as const, title: "Lesson", storage_path: null },
    ];
    expect(publishProblems(items, new Map([["b", 0]]))).toEqual(['"Intro" has no file', '"Quiz 1" has no questions']);
    expect(publishProblems([{ ...items[0], storage_path: "courses/x/videos/a.mp4" }, items[1], items[2]], new Map([["b", 3]]))).toEqual([]);
  });
});

describe("quiz grading", () => {
  const quiz = {
    id: "quiz", content_id: "c", course_id: "k", passing_score: 70, time_limit_minutes: null, attempts_allowed: null,
    questions: [1, 2, 3].map((n) => ({ id: `q${n}`, explanation: `why ${n}`, options: [0, 1, 2, 3].map((i) => ({ id: `q${n}o${i}`, is_correct: i === n })) })),
  };

  it("scores against stored answers and applies the passing score", () => {
    const all = grade(quiz, { q1: "q1o1", q2: "q2o2", q3: "q3o3" });
    expect(all).toMatchObject({ correct: 3, total: 3, scorePercent: 100, passed: true });
    const two = grade(quiz, { q1: "q1o1", q2: "q2o2", q3: "q3o0" });
    expect(two).toMatchObject({ correct: 2, scorePercent: 67, passed: false });
    expect(two.review[2]).toEqual({ questionId: "q3", chosen: "q3o0", correctOptionId: "q3o3", explanation: "why 3" });
  });

  it("ignores options that belong to another question", () => {
    expect(grade(quiz, { q1: "q2o2", q2: "q2o2" }).correct).toBe(1);
  });
});
