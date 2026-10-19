import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/db/supabase.server", () => ({ createClient: () => { throw new Error("db must not be reached"); } }));

import { LearningAdminService } from "@/backend/service/learning-admin.service";
import { LearningRepository, type CourseRow } from "@/backend/repo/learning.repo";
import { Moodle } from "@/backend/integration/moodle/moodle.service";
import { MoodleError } from "@/backend/integration/moodle/moodle.client";
import type { AuthUser } from "@/shared/auth/auth.types";

const admin: AuthUser = { id: "11111111-1111-4111-8111-111111111111", email: "a@meyveda.in", role: "admin", permissions: [] };
const ID = "22222222-2222-4222-8222-222222222222";
const row = (over: Partial<CourseRow> = {}): CourseRow => ({
  id: ID, moodle_course_id: 42, title: "Ayurveda", short_description: "", description: "", category_name: null, level: null, instructor_id: null,
  duration_minutes: null, learning_objectives: [], thumbnail_path: null, status: "draft", published_at: null, created_by: admin.id,
  origin: "yurcore", moodle_synced_at: null, moodle_sync_error: null, moodle_image_sig: null,
  created_at: "2026-09-26T00:00:00Z", updated_at: "2026-09-26T00:00:00Z", ...over,
});

describe("course deletion keeps YurCore and Moodle in sync", () => {
  let order: string[];
  beforeEach(() => {
    vi.restoreAllMocks();
    order = [];
    vi.spyOn(LearningRepository, "getCourse").mockResolvedValue(row());
    vi.spyOn(LearningRepository, "listFolder").mockResolvedValue(["courses/x/videos/a.mp4"]);
    vi.spyOn(LearningRepository, "deleteCourse").mockImplementation(async () => { order.push("supabase"); });
    vi.spyOn(LearningRepository, "removeFiles").mockImplementation(async () => { order.push("storage"); });
  });

  it("deletes from Moodle first, then YurCore data, then files", async () => {
    vi.spyOn(Moodle, "deleteCourse").mockImplementation(async (id) => { order.push(`moodle:${id}`); });
    await LearningAdminService.deleteCourse(admin, ID);
    expect(order).toEqual(["moodle:42", "supabase", "storage"]);
  });

  it("leaves YurCore untouched and reports failure when Moodle refuses or is unreachable", async () => {
    for (const kind of ["rejected", "unavailable", "timeout", "missing_function"] as const) {
      order = [];
      vi.spyOn(Moodle, "deleteCourse").mockRejectedValue(new MoodleError(kind, "core_course_delete_courses"));
      await expect(LearningAdminService.deleteCourse(admin, ID)).rejects.toMatchObject({ statusCode: 502, message: expect.stringContaining("could not be completely deleted from Moodle") });
      expect(order).toEqual([]);
    }
  });

  it("treats a course already missing in Moodle as deleted there", async () => {
    vi.spyOn(Moodle, "deleteCourse").mockRejectedValue(new MoodleError("not_found", "core_course_delete_courses"));
    await LearningAdminService.deleteCourse(admin, ID);
    expect(order).toEqual(["supabase", "storage"]);
  });
});

describe("course creation", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("creates the Moodle course first (hidden) and stores its id", async () => {
    vi.spyOn(Moodle, "createCourse").mockResolvedValue(77);
    vi.spyOn(Moodle, "getCoursesByIds").mockResolvedValue(new Map());
    const insert = vi.spyOn(LearningRepository, "insertCourse").mockResolvedValue(row({ moodle_course_id: 77 }));
    vi.spyOn(LearningRepository, "insertSection").mockResolvedValue({ id: "s", course_id: ID, title: "Introduction", description: "", position: 0, moodle_section_id: null });
    vi.spyOn(LearningRepository, "listSections").mockResolvedValue([]);
    vi.spyOn(LearningRepository, "listContent").mockResolvedValue([]);
    vi.spyOn(LearningRepository, "getPractitioners").mockResolvedValue(new Map());
    vi.spyOn(LearningRepository, "signedUrls").mockResolvedValue(new Map());
    vi.spyOn(LearningRepository, "getUserEmails").mockResolvedValue(new Map());
    vi.spyOn(LearningRepository, "listEnrollments").mockResolvedValue([]);

    const course = await LearningAdminService.createCourse(admin, { title: "Ayurveda basics" });
    expect(Moodle.createCourse).toHaveBeenCalledWith(expect.objectContaining({ fullname: "Ayurveda basics", visible: false }));
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ moodle_course_id: 77, status: "draft" }));
    expect(course.moodleCourseId).toBe(77);
  });

  it("saves nothing when Moodle creation fails, and removes the Moodle course if saving fails", async () => {
    vi.spyOn(Moodle, "createCourse").mockRejectedValue(new MoodleError("unavailable", "core_course_create_courses"));
    const insert = vi.spyOn(LearningRepository, "insertCourse");
    await expect(LearningAdminService.createCourse(admin, { title: "Ayurveda basics" })).rejects.toMatchObject({ statusCode: 502 });
    expect(insert).not.toHaveBeenCalled();

    vi.spyOn(Moodle, "createCourse").mockResolvedValue(78);
    insert.mockRejectedValue(new Error("course insert failed"));
    const del = vi.spyOn(Moodle, "deleteCourse").mockResolvedValue();
    await expect(LearningAdminService.createCourse(admin, { title: "Ayurveda basics" })).rejects.toThrow("course insert failed");
    expect(del).toHaveBeenCalledWith(78);
  });
});

// ---------------------------------------------------------------- content sync
import { LearningMoodleSync, htmlToText } from "@/backend/service/learning-moodle-sync.service";
import type { ContentRow, SectionRow } from "@/backend/repo/learning.repo";
import type { MoodleSection } from "@/backend/integration/moodle/moodle.service";

describe("YurCore content is mirrored into Moodle", () => {
  const S1 = "33333333-3333-4333-8333-333333333333";
  const item = (over: Partial<ContentRow>): ContentRow => ({
    id: "", course_id: ID, section_id: S1, content_type: "lesson", title: "", description: "", body: null, settings: {}, storage_path: null, file_name: null,
    mime_type: null, size_bytes: null, position: 0, moodle_cmid: null, moodle_sync_hash: null, moodle_file_sig: null, ...over,
  });
  let sections: SectionRow[];
  let content: ContentRow[];
  let moodle: MoodleSection[];
  let nextCmid: number;

  beforeEach(() => {
    vi.restoreAllMocks();
    nextCmid = 500;
    sections = [{ id: S1, course_id: ID, title: "Basics", description: "", position: 0, moodle_section_id: null }];
    content = [
      item({ id: "c-lesson", title: "Lesson 1", body: "Vata moves.", position: 0 }),
      item({ id: "c-video", content_type: "video", title: "Intro video", storage_path: "courses/x/videos/a.mp4", file_name: "a.mp4", mime_type: "video/mp4", position: 1 }),
      item({ id: "c-quiz", content_type: "quiz", title: "Check", position: 2 }),
    ];
    // A fresh Moodle course: General (announcements) + one empty default section.
    moodle = [
      { id: 1, section: 0, name: "General", summary: "", visible: true, activities: [{ cmid: 9, modname: "forum", name: "Announcements" } as never] },
      { id: 2, section: 1, name: "Topic 1", summary: "", visible: true, activities: [] },
    ];
    vi.spyOn(LearningRepository, "getCourse").mockImplementation(async () => row({ title: "Doshas", status: "published" }));
    vi.spyOn(LearningRepository, "listSections").mockImplementation(async () => sections);
    vi.spyOn(LearningRepository, "listContent").mockImplementation(async () => content);
    vi.spyOn(LearningRepository, "getQuizzes").mockResolvedValue(new Map([["c-quiz", { id: "q", content_id: "c-quiz", course_id: ID, passing_score: 60, time_limit_minutes: 5, attempts_allowed: null, questions: [{ id: "qq", quiz_id: "q", question: "Which dosha moves?", explanation: "", position: 0, options: [{ id: "o1", question_id: "qq", option_text: "Vata", is_correct: true, position: 0 }, { id: "o2", question_id: "qq", option_text: "Kapha", is_correct: false, position: 1 }] }] }]]));
    vi.spyOn(LearningRepository, "updateSection").mockImplementation(async (id, p) => { sections = sections.map((s) => (s.id === id ? { ...s, ...p } : s)); });
    vi.spyOn(LearningRepository, "setContentSync").mockImplementation(async (id, p) => { content = content.map((c) => (c.id === id ? { ...c, ...p } : c)); });
    vi.spyOn(LearningRepository, "setCourseSync").mockResolvedValue();
    vi.spyOn(LearningRepository, "downloadFile").mockResolvedValue(new ArrayBuffer(4));
    vi.spyOn(Moodle, "getCoursesByIds").mockResolvedValue(new Map([[42, { id: 42, fullname: "Doshas", summary: "", visible: 1 } as never]]));
    vi.spyOn(Moodle, "getStructure").mockImplementation(async () => structuredClone(moodle));
    vi.spyOn(Moodle, "addSection").mockImplementation(async (_c, name) => { const s = { id: 3, section: moodle.length, name, summary: "", visible: true, activities: [] }; moodle.push(s); return s; });
    vi.spyOn(Moodle, "deleteSection").mockImplementation(async (_c, n) => { moodle = moodle.filter((s) => s.section !== n).map((s) => (s.section > n ? { ...s, section: s.section - 1 } : s)); });
    vi.spyOn(Moodle, "deleteActivity").mockResolvedValue();
    vi.spyOn(Moodle, "updateSection").mockResolvedValue();
    vi.spyOn(Moodle, "moveSection").mockResolvedValue();
    vi.spyOn(Moodle, "moveActivity").mockResolvedValue();
    vi.spyOn(Moodle, "uploadDraft").mockResolvedValue(900);
    vi.spyOn(Moodle, "getQuiz").mockResolvedValue({ questions: [], grade: 10, sumgrades: 0 });
    vi.spyOn(Moodle, "addQuestion").mockResolvedValue([]);
    vi.spyOn(Moodle, "saveActivity").mockImplementation(async (_c, target, values) => {
      if (target.cmid) return { ok: true, cmid: target.cmid };
      const cmid = nextCmid++;
      moodle.find((s) => s.section === target.section)!.activities.push({ cmid, modname: target.modname!, name: String(values.name) } as never);
      return { ok: true, cmid };
    });
  });

  it("creates sections, files, pages and quizzes with their questions, then skips unchanged items", async () => {
    await LearningMoodleSync.syncCourse(ID);

    expect(Moodle.addSection).toHaveBeenCalledWith(42, "Basics");
    expect(Moodle.deleteSection).toHaveBeenCalledWith(42, 1); // Moodle's empty default section
    expect(Moodle.deleteActivity).not.toHaveBeenCalled(); // Announcements stays
    const saved = vi.mocked(Moodle.saveActivity).mock.calls.map(([, t, v]) => [t.modname, v.name]);
    expect(saved).toEqual([["page", "Lesson 1"], ["resource", "Intro video"], ["quiz", "Check"]]);
    expect(vi.mocked(Moodle.saveActivity).mock.calls[1][2]).toMatchObject({ files: 900, display: "1" });
    expect(vi.mocked(Moodle.saveActivity).mock.calls[2][2]).toMatchObject({ timelimit: 300, gradepass: "6.00" });
    expect(Moodle.addQuestion).toHaveBeenCalledWith(502, { type: "multichoice", text: "Which dosha moves?", mark: 1, answers: [{ text: "Vata", correct: true }, { text: "Kapha", correct: false }] });
    expect(content.map((c) => c.moodle_cmid)).toEqual([500, 501, 502]);
    expect(LearningRepository.setCourseSync).toHaveBeenLastCalledWith(ID, expect.objectContaining({ moodle_sync_error: null }));

    vi.mocked(Moodle.saveActivity).mockClear();
    vi.mocked(Moodle.uploadDraft).mockClear();
    vi.mocked(Moodle.addQuestion).mockClear();
    await LearningMoodleSync.syncCourse(ID);
    expect(Moodle.saveActivity).not.toHaveBeenCalled();
    expect(Moodle.uploadDraft).not.toHaveBeenCalled();
    expect(Moodle.addQuestion).not.toHaveBeenCalled();
  });

  it("updates a renamed item without re-uploading its file, and removes deleted items from Moodle", async () => {
    await LearningMoodleSync.syncCourse(ID);
    vi.mocked(Moodle.saveActivity).mockClear();
    vi.mocked(Moodle.uploadDraft).mockClear();
    content = content.filter((c) => c.id !== "c-lesson").map((c) => (c.id === "c-video" ? { ...c, title: "Welcome video" } : c));

    await LearningMoodleSync.syncCourse(ID);
    expect(Moodle.saveActivity).toHaveBeenCalledTimes(1);
    expect(vi.mocked(Moodle.saveActivity).mock.calls[0][1]).toEqual({ cmid: 501 });
    expect(vi.mocked(Moodle.saveActivity).mock.calls[0][2]).not.toHaveProperty("files");
    expect(Moodle.uploadDraft).not.toHaveBeenCalled();
    expect(Moodle.deleteActivity).toHaveBeenCalledWith(500);
  });

  it("records a Moodle validation message on the course instead of failing the whole sync", async () => {
    vi.mocked(Moodle.saveActivity).mockResolvedValueOnce({ ok: false, errors: { page: "Required" } });
    await LearningMoodleSync.syncCourse(ID);
    expect(LearningRepository.setCourseSync).toHaveBeenLastCalledWith(ID, expect.objectContaining({ moodle_sync_error: '"Lesson 1": Required' }));
    expect(content.find((c) => c.id === "c-video")!.moodle_cmid).not.toBeNull();
  });
});

describe("courses created in Moodle", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("are read-only in the YurCore builder", async () => {
    vi.spyOn(LearningRepository, "getCourse").mockResolvedValue(row({ origin: "moodle" }));
    const insert = vi.spyOn(LearningRepository, "insertSection");
    await expect(LearningAdminService.addSection(admin, ID, { title: "New" })).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining("created in Moodle") });
    await expect(LearningAdminService.updateCourse(admin, ID, { title: "Renamed here" })).rejects.toMatchObject({ statusCode: 400 });
    expect(insert).not.toHaveBeenCalled();
  });

  it("have their Moodle HTML turned into YurCore text", () => {
    expect(htmlToText('<p class="p1">Vata &amp; Pitta</p><p>Line<br>two&nbsp;</p><ul><li>One</li><li>Two</li></ul>')).toBe("Vata & Pitta\n\nLine\ntwo\n\n• One\n\n• Two");
  });
});
