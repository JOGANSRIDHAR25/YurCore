import "server-only";

import { after } from "next/server";
import { createHash, randomUUID } from "crypto";
import { SITE_NAME } from "@/shared/config/site";
import { UPLOAD_RULES, allowedFor, isFileType, isQuizType, resolveMime } from "@/shared/learning/content";
import type { ContentType, FileContentType } from "@/shared/learning/types";
import { Moodle, type MoodleActivity, type MoodleCourse, type MoodleFile, type MoodleSection, type QuizQuestion as MoodleQuizQuestion } from "@/backend/integration/moodle/moodle.service";
import { MoodleError } from "@/backend/integration/moodle/moodle.client";
import { getMoodleConfig } from "@/backend/integration/moodle/config";
import { LearningRepository, type ContentRow, type ContentWrite, type QuestionRow, type QuizRow, type SectionRow } from "../repo/learning.repo";

/**
 * Keeps YurCore Learning and Moodle in step.
 *
 * - Push (origin "yurcore"): the course built in YurCore is mirrored into its Moodle course. Sections become
 *   Moodle sections; Video/Image/PDF/File items become Moodle "File" resources (the file itself is uploaded),
 *   Text lessons become Pages, Quiz/Question items become Quizzes with their multiple-choice questions, and
 *   Assignment/Feedback items become Assignments. YurCore is the source of truth for these courses: anything
 *   in the Moodle course that YurCore does not know about is removed (except Moodle's Announcements forum).
 * - Pull (origin "moodle"): a course created directly in Moodle is imported into YurCore (files are copied to
 *   Storage) and refreshed from Moodle on every sync, so admins and practitioners see it in YurCore Learning.
 *
 * Each row remembers its Moodle section / activity id and a fingerprint of what was last synced, so a sync only
 * touches what changed. Syncs of one course never overlap (they are queued per course in this server process).
 */

// ---------- text helpers ----------
const escapeHtml = (t: string) => t.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export const toHtml = (text: string) => text.split(/\n{2,}/).filter(Boolean).map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`).join("");

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };
/** Moodle HTML -> the plain text with paragraphs that YurCore stores and renders. */
export function htmlToText(html: unknown): string {
  return String(html ?? "")
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr|blockquote|pre)>/gi, "\n\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+\d*);/gi, (m, e: string) => {
      if (e[0] === "#") {
        const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(n) ? String.fromCodePoint(n) : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/[ \t ]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex").slice(0, 40);
const clip = (t: string, max: number) => (t.length > max ? t.slice(0, max - 1) + "…" : t);
const baseName = (path: string) => path.split("/").pop()!.replace(/^[0-9a-f-]{36}-/, "");
const safeName = (name: string) => name.normalize("NFKD").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-+/g, "-").slice(-100) || "file";

/** A short, admin-facing reason (never Moodle internals). */
function reason(err: unknown): string {
  if (err instanceof MoodleError) {
    if (err.kind === "not_configured") return "Moodle is not configured.";
    if (err.kind === "unavailable" || err.kind === "timeout") return "Moodle is not reachable.";
    if (err.kind === "missing_function") return "The Moodle web-service token is invalid or lacks a required function.";
    if (err.kind === "not_found") return "The Moodle course no longer exists.";
    return "Moodle rejected the change.";
  }
  return err instanceof Error ? err.message : "Unexpected error.";
}

class ItemError extends Error {}

// ---------- per-course queue (one sync at a time per course) ----------
type SyncState = { running: Map<string, Promise<void>>; queued: Set<string>; lastRefresh: number; lastDiscover: number; refreshing: Promise<void> | null };
const state: SyncState = ((globalThis as { __learningMoodleSync?: SyncState }).__learningMoodleSync ??= {
  running: new Map(),
  queued: new Set(),
  lastRefresh: 0,
  lastDiscover: 0,
  refreshing: null,
});

function exclusive(courseId: string, run: () => Promise<void>): Promise<void> {
  const prev = state.running.get(courseId) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(run);
  state.running.set(courseId, next);
  void next.catch(() => undefined).finally(() => {
    if (state.running.get(courseId) === next) state.running.delete(courseId);
  });
  return next;
}

// ======================================================================
// Push: YurCore course -> Moodle course
// ======================================================================
type QuizWithQuestions = QuizRow & { questions: QuestionRow[] };

type Planned = { modname: string; values: Record<string, unknown>; fileKey: string | null };

function plan(item: ContentRow, quiz: QuizWithQuestions | undefined): Planned {
  const base = { name: item.title, introeditor: toHtml(item.description ?? ""), showdescription: 0 };
  const type = item.content_type;
  if (isFileType(type)) {
    const embed = type === "image" || type === "video" || item.mime_type === "application/pdf";
    return { modname: "resource", values: { ...base, display: embed ? "1" : "0", printintro: 1 }, fileKey: "files" };
  }
  if (type === "lesson") return { modname: "page", values: { ...base, page: toHtml(item.body ?? "") || "<p></p>" }, fileKey: null };
  if (isQuizType(type)) {
    const passing = quiz?.passing_score ?? 70;
    return {
      modname: "quiz",
      values: {
        ...base,
        timelimit: (quiz?.time_limit_minutes ?? 0) * 60,
        attempts: String(Math.min(quiz?.attempts_allowed ?? 0, 10)),
        gradepass: (passing / 10).toFixed(2), // Moodle's default maximum grade for a quiz is 10
      },
      fileKey: null,
    };
  }
  const due = typeof item.settings?.dueAt === "string" ? Math.floor(Date.parse(item.settings.dueAt) / 1000) : 0;
  const assign = {
    ...base,
    allowsubmissionsfromdate: 0,
    duedate: due > 0 ? due : 0,
    cutoffdate: 0,
    gradingduedate: 0,
    assignsubmission_onlinetext_enabled: 1,
  };
  if (type === "assignment") return { modname: "assign", values: { ...assign, assignsubmission_file_enabled: 1 }, fileKey: "introattachments" };
  // feedback: a free-text, ungraded submission
  return { modname: "assign", values: { ...assign, assignsubmission_file_enabled: 0, grade: 0 }, fileKey: null };
}

const questionPayload = (q: QuestionRow) => {
  const options = [...q.options].sort((a, b) => a.position - b.position);
  return { type: "multichoice", text: q.question, mark: 1, answers: options.map((o) => ({ text: o.option_text, correct: o.is_correct })) };
};

async function pushCourse(courseId: string): Promise<void> {
  const course = await LearningRepository.getCourse(courseId);
  if (!course || course.origin !== "yurcore" || course.moodle_course_id === null) return;
  const mid = course.moodle_course_id;
  const problems: string[] = [];

  try {
    const [sections, content] = await Promise.all([LearningRepository.listSections([courseId]), LearningRepository.listContent([courseId])]);
    const quizzes = await LearningRepository.getQuizzes(content.filter((c) => isQuizType(c.content_type)).map((c) => c.id), true);
    const ordered = [...sections].sort((a, b) => a.position - b.position);

    // 0. Course name, summary and visibility (repairs drift, e.g. after Moodle was unreachable).
    const live = (await Moodle.getCoursesByIds([mid])).get(mid);
    if (!live) throw new MoodleError("not_found", "core_course_get_courses_by_field");
    const summary = toHtml(course.description ?? "");
    const visible = course.status === "published";
    if (live.fullname !== course.title || (live.summary ?? "") !== summary || Boolean(live.visible) !== visible) {
      await Moodle.updateCourse(mid, { fullname: course.title, summary, visible });
    }

    // 1. Course image.
    if (course.thumbnail_path && course.thumbnail_path !== course.moodle_image_sig) {
      const name = baseName(course.thumbnail_path);
      const data = await LearningRepository.downloadFile(course.thumbnail_path);
      const draft = await Moodle.uploadDraft({ name, type: resolveMime(name, ""), data });
      await Moodle.setCourseImage(mid, draft);
      await LearningRepository.setCourseSync(courseId, { moodle_image_sig: course.thumbnail_path });
    }

    // 2. Sections: create or rename.
    let structure = await Moodle.getStructure(mid);
    const sectionMap = new Map<string, number>(); // YurCore section id -> Moodle section id
    for (const s of ordered) {
      const existing = s.moodle_section_id !== null ? structure.find((m) => m.id === s.moodle_section_id && m.section > 0) : undefined;
      const sum = toHtml(s.description ?? "");
      if (existing) {
        if (existing.name !== s.title || (existing.summary ?? "") !== sum) await Moodle.updateSection(mid, existing.section, s.title, sum);
        sectionMap.set(s.id, existing.id);
      } else {
        const created = await Moodle.addSection(mid, s.title);
        if (sum) await Moodle.updateSection(mid, created.section, s.title, sum);
        await LearningRepository.updateSection(s.id, { moodle_section_id: created.id });
        sectionMap.set(s.id, created.id);
      }
    }

    // 3. Remove what YurCore no longer has (deleted items/sections, Moodle's empty default sections).
    structure = await Moodle.getStructure(mid);
    const known = new Set(content.map((c) => c.moodle_cmid).filter((x): x is number => x !== null));
    for (const sec of structure) {
      for (const a of sec.activities) {
        const isNews = sec.section === 0 && a.modname === "forum";
        if (!known.has(a.cmid) && !isNews) await Moodle.deleteActivity(a.cmid);
      }
    }
    const keepSections = new Set(sectionMap.values());
    for (const sec of [...structure].sort((a, b) => b.section - a.section)) {
      if (sec.section > 0 && !keepSections.has(sec.id)) await Moodle.deleteSection(mid, sec.section);
    }

    // 4. Section order.
    structure = await Moodle.getStructure(mid);
    for (const [i, s] of ordered.entries()) {
      const target = i + 1;
      const current = structure.find((m) => m.id === sectionMap.get(s.id));
      if (current && current.section !== target) {
        await Moodle.moveSection(mid, current.section, target);
        structure = await Moodle.getStructure(mid);
      }
    }
    const sectionNumber = (yurcoreSectionId: string) => structure.find((m) => m.id === sectionMap.get(yurcoreSectionId))?.section ?? 0;

    // 5. Activities: create, or update what changed.
    const liveCmids = new Set(structure.flatMap((s) => s.activities.map((a) => a.cmid)));
    const cmidOf = new Map<string, number>();
    for (const s of ordered) {
      const items = content.filter((c) => c.section_id === s.id).sort((a, b) => a.position - b.position);
      for (const item of items) {
        try {
          const cmid = await pushItem(mid, item, quizzes.get(item.id), sectionNumber(s.id), liveCmids);
          cmidOf.set(item.id, cmid);
        } catch (err) {
          if (!(err instanceof ItemError || err instanceof MoodleError)) throw err;
          if (err instanceof MoodleError) console.error(`[learning] Moodle sync of "${item.title}" failed: ${err.kind} in ${err.fn}: ${err.detail ?? ""}`);
          problems.push(`"${item.title}": ${err instanceof ItemError ? err.message : reason(err)}`);
          if (item.moodle_cmid !== null && liveCmids.has(item.moodle_cmid)) cmidOf.set(item.id, item.moodle_cmid);
        }
      }
    }

    // 6. Activity order within and across sections.
    structure = await Moodle.getStructure(mid);
    for (const s of ordered) {
      const want = content
        .filter((c) => c.section_id === s.id)
        .sort((a, b) => a.position - b.position)
        .map((c) => cmidOf.get(c.id))
        .filter((x): x is number => x !== undefined);
      const sec = structure.find((m) => m.id === sectionMap.get(s.id));
      const have = sec?.activities.map((a) => a.cmid) ?? [];
      if (sec && JSON.stringify(have) !== JSON.stringify(want)) {
        for (const cmid of want) await Moodle.moveActivity(cmid, sec.section, 0);
      }
    }

    await LearningRepository.setCourseSync(courseId, { moodle_synced_at: new Date().toISOString(), moodle_sync_error: problems.length ? problems.join(" · ") : null });
  } catch (err) {
    console.error(`[learning] Moodle push of course ${courseId} failed:`, err instanceof MoodleError ? `${err.kind} in ${err.fn}: ${err.detail ?? ""}` : err);
    await LearningRepository.setCourseSync(courseId, { moodle_sync_error: reason(err) }).catch(() => undefined);
    throw err;
  }
}

/** Creates or updates one Moodle activity for a YurCore item. Returns its cmid. */
async function pushItem(mid: number, item: ContentRow, quiz: QuizWithQuestions | undefined, section: number, liveCmids: Set<number>): Promise<number> {
  const planned = plan(item, quiz);
  const questions = quiz?.questions.map(questionPayload) ?? [];
  const fingerprint = hash({ m: planned.modname, v: planned.values, file: item.storage_path });
  const questionPrint = isQuizType(item.content_type) ? hash(questions) : "";
  const fullPrint = `${fingerprint}.${questionPrint}`;
  const exists = item.moodle_cmid !== null && liveCmids.has(item.moodle_cmid);
  if (exists && item.moodle_sync_hash === fullPrint) return item.moodle_cmid!;
  const [oldPrint, oldQuestions] = (exists ? item.moodle_sync_hash ?? "" : "").split(".");

  let cmid = exists ? item.moodle_cmid! : 0;
  if (!exists || oldPrint !== fingerprint) {
    const values = { ...planned.values };
    // Files are only (re)sent when new or replaced: videos can be large.
    const fileChanged = !exists || item.moodle_file_sig !== item.storage_path;
    if (planned.fileKey && item.storage_path && fileChanged) {
      const data = await LearningRepository.downloadFile(item.storage_path);
      values[planned.fileKey] = await Moodle.uploadDraft({ name: item.file_name ?? baseName(item.storage_path), type: item.mime_type ?? "", data });
    }
    const res = await Moodle.saveActivity(mid, exists ? { cmid } : { modname: planned.modname, section }, values);
    if (!res.ok) throw new ItemError(Object.values(res.errors)[0] ?? "Moodle rejected the settings");
    cmid = res.cmid;
    // Saved before the questions, so a failure below never leaves an untracked duplicate behind.
    await LearningRepository.setContentSync(item.id, { moodle_cmid: cmid, moodle_sync_hash: `${fingerprint}.`, moodle_file_sig: item.storage_path });
  }

  if (isQuizType(item.content_type) && (oldQuestions ?? "") !== questionPrint) {
    const current = await Moodle.getQuiz(cmid);
    for (const q of [...current.questions].sort((a, b) => b.slot - a.slot)) await Moodle.deleteQuestion(cmid, q.slot);
    for (const q of questions) await Moodle.addQuestion(cmid, q);
  }
  await LearningRepository.setContentSync(item.id, { moodle_cmid: cmid, moodle_sync_hash: fullPrint, moodle_file_sig: item.storage_path });
  return cmid;
}

// ======================================================================
// Pull: Moodle course -> YurCore course
// ======================================================================
type Mapped = {
  type: ContentType;
  title: string;
  description: string;
  body: string | null;
  settings: Record<string, unknown>;
  file: MoodleFile | null;
  quiz: { passingScore: number; timeLimitMinutes: number | null; attemptsAllowed: number | null; questions: { question: string; explanation: string; options: { text: string; correct: boolean }[] }[] } | null;
};

function fileKind(mime: string): FileContentType {
  if (allowedFor("image", mime)) return "image";
  if (allowedFor("video", mime)) return "video";
  if (allowedFor("document", mime)) return "document";
  return "file";
}

function mapQuestions(list: MoodleQuizQuestion[]) {
  const out: NonNullable<Mapped["quiz"]>["questions"] = [];
  for (const q of list) {
    const question = clip(htmlToText(q.text) || q.name, 4000);
    if (q.type === "truefalse") {
      out.push({ question, explanation: "", options: [{ text: "True", correct: q.correct === true }, { text: "False", correct: q.correct !== true }] });
    } else if (q.type === "multichoice" && q.answers && q.answers.length >= 2 && q.answers.length <= 6 && q.answers.filter((a) => a.correct).length === 1) {
      out.push({ question, explanation: "", options: q.answers.map((a) => ({ text: clip(htmlToText(a.text) || "-", 1000), correct: a.correct })) });
    }
  }
  return out;
}

/** What a Moodle activity becomes in YurCore. null: not shown (Announcements). */
async function mapActivity(mid: number, sec: MoodleSection, a: MoodleActivity, files: MoodleFile[]): Promise<Mapped | null> {
  if (sec.section === 0 && a.modname === "forum") return null;
  const values = await Moodle.getActivityValues(mid, a.cmid).catch(() => ({}) as Record<string, unknown>);
  const intro = htmlToText(values.introeditor);
  const title = clip(a.name || "Untitled", 200);
  const link = a.url ? a.url.replace(getMoodleConfig().baseUrl, getMoodleConfig().publicUrl) : null;
  const lesson = (body: string): Mapped => ({ type: "lesson", title, description: "", body: clip(body || title, 100000), settings: {}, file: null, quiz: null });
  const inMoodle = (what: string) => lesson([intro, `This ${what} is available in Moodle${link ? `: ${link}` : "."}`].filter(Boolean).join("\n\n"));

  switch (a.modname) {
    case "resource": {
      const f = files[0];
      const mime = f ? resolveMime(f.filename, f.mimetype) : "";
      if (!f || !allowedFor(fileKind(mime), mime)) return inMoodle("file"); // a type the learning bucket does not accept
      return { type: fileKind(mime), title, description: clip(intro, 5000), body: null, settings: {}, file: f, quiz: null };
    }
    case "page": {
      const body = htmlToText(values.page);
      return { ...lesson(body || intro), description: body && intro !== body ? clip(intro, 5000) : "" };
    }
    case "label":
      return lesson(intro);
    case "url":
      return lesson([intro, typeof values.externalurl === "string" ? values.externalurl : link ?? ""].filter(Boolean).join("\n\n"));
    case "quiz": {
      const q = await Moodle.getQuiz(a.cmid);
      const questions = mapQuestions(q.questions);
      if (questions.length === 0) return inMoodle("quiz");
      const grade = q.grade > 0 ? q.grade : 10;
      const gradepass = Number(values.gradepass) || 0;
      const timelimit = Number(values.timelimit) || 0;
      return {
        type: "quiz",
        title,
        description: clip(intro, 5000),
        body: null,
        settings: {},
        file: null,
        quiz: {
          passingScore: Math.max(0, Math.min(100, Math.round((gradepass / grade) * 100))),
          timeLimitMinutes: timelimit > 0 ? Math.max(1, Math.round(timelimit / 60)) : null,
          attemptsAllowed: Number(values.attempts) > 0 ? Number(values.attempts) : null,
          questions,
        },
      };
    }
    case "assign": {
      const due = Number(values.duedate) || 0;
      const text = [intro, htmlToText(values.activityeditor)].filter((t, i, all) => t && all.indexOf(t) === i).join("\n\n");
      return { type: "assignment", title, description: clip(text, 5000), body: null, settings: { dueAt: due > 0 ? new Date(due * 1000).toISOString() : null }, file: null, quiz: null };
    }
    case "feedback":
      return { type: "feedback", title, description: clip(intro, 5000), body: null, settings: { rating: false }, file: null, quiz: null };
    default:
      return inMoodle("activity");
  }
}

const fileSig = (f: MoodleFile | null) => (f ? `${f.filename}|${f.filesize}|${f.timemodified}` : null);

/** Copies a Moodle file into this course's Storage folder. Returns the content row's file fields. */
async function importFile(courseId: string, kind: FileContentType | "thumbnail", f: { filename: string; mimetype: string; fileurl: string }) {
  const mime = resolveMime(f.filename, f.mimetype);
  if (!allowedFor(kind, mime)) throw new ItemError(`the file type of "${f.filename}" is not supported in ${SITE_NAME} Learning`);
  const { data } = await Moodle.downloadFile(f.fileurl);
  const path = `courses/${courseId}/${UPLOAD_RULES[kind].folder}/${randomUUID()}-${safeName(f.filename)}`;
  await LearningRepository.uploadFile(path, data, mime);
  return { storage_path: path, file_name: f.filename, mime_type: mime, size_bytes: data.byteLength };
}

async function pullCourse(courseId: string, live?: MoodleCourse): Promise<void> {
  const course = await LearningRepository.getCourse(courseId);
  if (!course || course.origin !== "moodle" || course.moodle_course_id === null) return;
  const mid = course.moodle_course_id;
  const problems: string[] = [];
  try {
    const mc = live ?? (await Moodle.getCoursesByIds([mid])).get(mid);
    if (!mc) {
      // Deleted in Moodle: hide it from learners; the admin list flags it as missing.
      if (course.status === "published") await LearningRepository.updateCourse(courseId, { status: "draft", published_at: null });
      await LearningRepository.setCourseSync(courseId, { moodle_sync_error: "This course was deleted in Moodle." });
      return;
    }

    const [structure, filesByCmid, sections, content] = await Promise.all([
      Moodle.getStructure(mid),
      Moodle.getActivityFiles(mid),
      LearningRepository.listSections([courseId]),
      LearningRepository.listContent([courseId]),
    ]);
    const removedFiles: string[] = [];

    // Sections that hold something learners can see (Moodle courses start with several empty ones).
    let position = 0;
    const keptSections = new Set<string>();
    const keptContent = new Set<string>();
    for (const sec of structure) {
      if (!sec.visible) continue;
      const activities = sec.activities.filter((a) => a.visible && !(sec.section === 0 && a.modname === "forum"));
      if (activities.length === 0) continue;

      let row = sections.find((s) => s.moodle_section_id === sec.id);
      const title = clip(htmlToText(sec.name) || (sec.section === 0 ? "General" : `Section ${sec.section}`), 200);
      const description = clip(htmlToText(sec.summary), 2000);
      if (!row) {
        row = await LearningRepository.insertSection({ course_id: courseId, title, description, position, moodle_section_id: sec.id });
      } else if (row.title !== title || row.description !== description || row.position !== position) {
        await LearningRepository.updateSection(row.id, { title, description, position });
      }
      keptSections.add(row.id);
      position++;

      for (const [i, a] of activities.entries()) {
        try {
          const id = await pullItem(courseId, mid, sec, a, filesByCmid.get(a.cmid) ?? [], row as SectionRow, i, content, removedFiles);
          if (id) keptContent.add(id);
        } catch (err) {
          if (!(err instanceof ItemError || err instanceof MoodleError)) throw err;
          problems.push(`"${a.name}": ${err instanceof ItemError ? err.message : reason(err)}`);
          const old = content.find((c) => c.moodle_cmid === a.cmid);
          if (old) keptContent.add(old.id); // keep the last good copy
        }
      }
    }

    // Remove what is no longer in Moodle.
    for (const c of content) {
      if (!keptContent.has(c.id)) {
        await LearningRepository.deleteContent(c.id);
        if (c.storage_path) removedFiles.push(c.storage_path);
      }
    }
    for (const s of sections) if (!keptSections.has(s.id)) await LearningRepository.deleteSection(s.id);

    // Course details last, so learners never see a published course before its content exists.
    const patch: Parameters<typeof LearningRepository.updateCourse>[1] = {};
    const description = htmlToText(mc.summary);
    if (course.title !== mc.fullname) patch.title = clip(mc.fullname, 200);
    if ((course.description ?? "") !== description) patch.description = clip(description, 20000);
    const published = Boolean(mc.visible);
    if ((course.status === "published") !== published) {
      patch.status = published ? "published" : "draft";
      patch.published_at = published ? new Date().toISOString() : null;
    }
    if (mc.imageUrl && mc.imageUrl !== course.moodle_image_sig) {
      try {
        const name = decodeURIComponent(mc.imageUrl.split("?")[0].split("/").pop() || "image.jpg");
        const img = await importFile(courseId, "thumbnail", { filename: name, mimetype: "", fileurl: mc.imageUrl });
        patch.thumbnail_path = img.storage_path;
        if (course.thumbnail_path) removedFiles.push(course.thumbnail_path);
        await LearningRepository.setCourseSync(courseId, { moodle_image_sig: mc.imageUrl });
      } catch (err) {
        problems.push(`Course image: ${err instanceof ItemError ? err.message : reason(err)}`);
      }
    }
    if (Object.keys(patch).length) await LearningRepository.updateCourse(courseId, patch);
    await LearningRepository.removeFiles(removedFiles);
    await LearningRepository.setCourseSync(courseId, { moodle_synced_at: new Date().toISOString(), moodle_sync_error: problems.length ? problems.join(" · ") : null });
  } catch (err) {
    console.error(`[learning] Moodle import of course ${courseId} failed:`, err instanceof MoodleError ? `${err.kind} in ${err.fn}: ${err.detail ?? ""}` : err);
    await LearningRepository.setCourseSync(courseId, { moodle_sync_error: reason(err) }).catch(() => undefined);
    throw err;
  }
}

/** Creates or refreshes the YurCore item for one Moodle activity. Returns its id (null when not shown). */
async function pullItem(courseId: string, mid: number, sec: MoodleSection, a: MoodleActivity, files: MoodleFile[], section: SectionRow, position: number, content: ContentRow[], removedFiles: string[]): Promise<string | null> {
  let existing = content.find((c) => c.moodle_cmid === a.cmid);
  const mapped = await mapActivity(mid, sec, a, files);
  if (!mapped) return null;
  const print = hash({ ...mapped, file: fileSig(mapped.file) });

  if (existing && existing.moodle_sync_hash === print) {
    if (existing.section_id !== section.id || existing.position !== position) await LearningRepository.updateContent(existing.id, { section_id: section.id, position });
    return existing.id;
  }
  // A changed type (e.g. a quiz that now has supported questions) is replaced rather than converted.
  if (existing && existing.content_type !== mapped.type) {
    await LearningRepository.deleteContent(existing.id);
    if (existing.storage_path) removedFiles.push(existing.storage_path);
    existing = undefined;
  }

  let fileFields: ContentWrite = {};
  const sig = fileSig(mapped.file);
  if (mapped.file && isFileType(mapped.type) && (!existing || existing.moodle_file_sig !== sig)) {
    fileFields = await importFile(courseId, mapped.type, mapped.file);
    if (existing?.storage_path) removedFiles.push(existing.storage_path);
  }
  const fields = { title: mapped.title, description: mapped.description, body: mapped.body, settings: mapped.settings, section_id: section.id, position, ...fileFields };
  const row = existing
    ? await LearningRepository.updateContent(existing.id, fields)
    : await LearningRepository.insertContent({ course_id: courseId, content_type: mapped.type, ...fields });

  if (mapped.quiz) {
    const quiz = await LearningRepository.upsertQuiz({
      content_id: row.id,
      course_id: courseId,
      passing_score: mapped.quiz.passingScore,
      time_limit_minutes: mapped.quiz.timeLimitMinutes,
      attempts_allowed: mapped.quiz.attemptsAllowed,
    });
    await LearningRepository.saveQuestions(quiz.id, mapped.quiz.questions);
  }
  await LearningRepository.setContentSync(row.id, { moodle_cmid: a.cmid, moodle_sync_hash: print, moodle_file_sig: sig });
  return row.id;
}

// ======================================================================
// Discovery of courses created in Moodle
// ======================================================================
async function importNewCourses(createdBy: string | null): Promise<MoodleCourse[]> {
  const all = await Moodle.getAllCourses();
  const linked = new Set((await LearningRepository.listCourses()).map((c) => c.moodle_course_id));
  const fresh = all.filter((c) => !linked.has(c.id));
  if (fresh.length === 0) return all;
  const owner = createdBy ?? (await LearningRepository.findAdminUserId());
  if (!owner) return all;
  for (const c of fresh) {
    try {
      // Starts as a draft; the content import publishes it once its content is in place.
      await LearningRepository.insertCourse({ title: clip(c.fullname, 200), description: clip(htmlToText(c.summary), 20000), status: "draft", created_by: owner, moodle_course_id: c.id, origin: "moodle" });
    } catch (err) {
      // Another sync imported it at the same moment (moodle_course_id is unique).
      if (!(err instanceof Error && /duplicate|unique/i.test(err.message))) throw err;
    }
  }
  return all;
}

// ======================================================================
// Public API
// ======================================================================
export const LearningMoodleSync = {
  /** Mirrors a YurCore course into Moodle after the current request has been answered. */
  schedulePush(courseId: string) {
    if (!getMoodleConfig().configured) return;
    if (state.queued.has(courseId)) return; // a push that has not started yet will include this change
    state.queued.add(courseId); // marked at once, so the admin UI shows "syncing" right after the change
    try {
      after(() =>
        exclusive(courseId, async () => {
          state.queued.delete(courseId);
          await pushCourse(courseId);
        }).catch(() => undefined),
      );
    } catch (err) {
      state.queued.delete(courseId); // outside a request (scripts, tests): nothing was scheduled
      console.warn("[learning] Moodle push not scheduled:", err instanceof Error ? err.message : err);
    }
  },

  /** True while a sync of this course is running or waiting in this server process. */
  isBusy: (courseId: string) => state.running.has(courseId) || state.queued.has(courseId),

  /**
   * Creates YurCore rows for courses that were created in Moodle since the last look (one quick Moodle call,
   * at most once a minute), and starts importing their content in the background.
   */
  async discover(createdBy: string | null): Promise<void> {
    if (!getMoodleConfig().configured || Date.now() - state.lastDiscover < 60 * 1000) return;
    state.lastDiscover = Date.now();
    try {
      const before = (await LearningRepository.listCourses()).length;
      await importNewCourses(createdBy);
      const added = (await LearningRepository.listCourses()).length > before;
      this.scheduleRefresh(createdBy, added ? 0 : undefined);
    } catch (err) {
      console.error("[learning] Moodle course discovery failed:", err instanceof MoodleError ? `${err.kind} ${err.detail ?? ""}` : err);
    }
  },

  /** Syncs one course now (push or pull depending on where it was created). */
  async syncCourse(courseId: string): Promise<void> {
    const course = await LearningRepository.getCourse(courseId);
    if (!course) return;
    await exclusive(courseId, () => (course.origin === "moodle" ? pullCourse(courseId) : pushCourse(courseId)));
  },

  /**
   * Full two-way sync: imports courses created in Moodle, refreshes Moodle courses and pushes every
   * YurCore course. Returns a short summary for the admin.
   */
  async syncAll(createdBy: string | null): Promise<{ imported: number; synced: number; failed: number }> {
    const before = new Set((await LearningRepository.listCourses()).map((c) => c.id));
    const all = await importNewCourses(createdBy);
    const live = new Map(all.map((c) => [c.id, c]));
    const rows = await LearningRepository.listCourses();
    let synced = 0;
    let failed = 0;
    for (const row of rows) {
      if (row.moodle_course_id === null) continue;
      try {
        await exclusive(row.id, () => (row.origin === "moodle" ? pullCourse(row.id, live.get(row.moodle_course_id!)) : pushCourse(row.id)));
        synced++;
      } catch {
        failed++;
      }
    }
    state.lastRefresh = Date.now();
    return { imported: rows.filter((r) => !before.has(r.id)).length, synced, failed };
  },

  /**
   * Picks up courses created in Moodle (and changes made there) in the background, at most every few
   * minutes. Called when the course lists are opened, so new Moodle courses appear without a manual sync.
   */
  scheduleRefresh(createdBy: string | null, minIntervalMs = 5 * 60 * 1000) {
    if (!getMoodleConfig().configured || state.refreshing || Date.now() - state.lastRefresh < minIntervalMs) return;
    state.lastRefresh = Date.now();
    after(() => {
      state.refreshing = (async () => {
        try {
          const all = await importNewCourses(createdBy);
          const live = new Map(all.map((c) => [c.id, c]));
          for (const row of await LearningRepository.listCourses()) {
            if (row.origin !== "moodle" || row.moodle_course_id === null) continue;
            await exclusive(row.id, () => pullCourse(row.id, live.get(row.moodle_course_id!))).catch(() => undefined);
          }
        } catch (err) {
          console.error("[learning] background Moodle refresh failed:", err instanceof MoodleError ? `${err.kind} ${err.detail ?? ""}` : err);
        } finally {
          state.refreshing = null;
        }
      })();
      return state.refreshing;
    });
  },
};
