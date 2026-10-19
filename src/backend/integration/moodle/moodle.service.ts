import "server-only";

import { randomBytes } from "crypto";
import { callMoodle, MoodleError } from "./moodle.client";
import { getMoodleConfig } from "./config";

/**
 * Typed wrappers over the Moodle Web Service functions this integration uses.
 * Core functions cover courses, users, enrolment, completion and grades. Everything
 * Moodle core cannot do over web services (creating activities, quiz questions,
 * sections, single sign-on) goes through the `local_meyveda_*` functions of the
 * YurCore bridge plugin (moodle/local/meyveda). See docs/MOODLE_INTEGRATION.md.
 */

export type MoodleCourse = {
  id: number;
  fullname: string;
  shortname: string;
  summary: string;
  visible: number;
  categoryid: number;
  startdate: number;
  enddate: number;
  enablecompletion: boolean;
  imageUrl: string | null;
};

export type CompletionMode = "none" | "manual" | "auto";
export type Availability = { from: number | null; until: number | null; afterCmid: number | null };

/** Any Moodle module name (quiz, assign, page, resource, url, folder, book, forum, lesson, label, ...). */
export type MoodleActivity = {
  cmid: number;
  instance: number;
  modname: string;
  name: string;
  visible: boolean;
  completion: CompletionMode;
  availability: Availability;
  url: string | null;
  dates: { open?: number; close?: number; due?: number };
  questions?: number;
  timelimit?: number;
};
export type MoodleSection = { id: number; section: number; name: string; summary: string; visible: boolean; activities: MoodleActivity[] };

export type QuizQuestion = {
  slot: number;
  id: number;
  type: string;
  name: string;
  text: string;
  mark: number;
  single?: boolean;
  correct?: boolean;
  answers?: { text: string; correct: boolean }[];
};
export type BankCategory = { id: number; name: string; questions: { id: number; name: string; type: string; text: string; mark: number }[] };

/** One entry of Moodle's "Add an activity or resource" list. */
export type ModuleType = { name: string; label: string; kind: "activity" | "resource"; help: string };

/** Moodle's own settings form for one activity, as read from the installed mod_<name>_mod_form. */
export type FormElement = {
  name: string;
  type: "text" | "number" | "password" | "textarea" | "select" | "checkbox" | "datetime" | "duration" | "editor" | "file" | "grade" | "radio" | "static" | "group";
  label: string;
  required?: boolean;
  help?: string;
  text?: string;
  value?: string | number;
  optional?: boolean;
  options?: { value: string; label: string }[];
  units?: { value: number; label: string }[];
  defaultUnit?: number;
  files?: string[];
  elements?: FormElement[];
};
export type FormSection = { id: string; title: string; elements: FormElement[] };
export type FormRule = { kind: "disable" | "hide"; on: string; cond: string; value: string; targets: string[] };
export type ActivityForm = { modname: string; label: string; cmid: number; sections: FormSection[]; rules: FormRule[]; availability: Availability };
export type SaveResult = { ok: true; cmid: number } | { ok: false; errors: Record<string, string> };

export type MoodleEnrolledUser = { id: number; fullname: string; username: string; email: string; roles: string[]; lastaccess: number | null };
export type CourseStructure = { sections: number; activities: number; quizzes: number; assignments: number };
export type MoodleCategory = { id: number; name: string };
export type ActivityStatus = { cmid: number; state: number; tracked: boolean };
export type ActivityGrade = { cmid: number; grade: string; percentage: string; max: number };
/** A file of an activity as listed by core_course_get_contents (fileurl needs the token: use downloadFile). */
export type MoodleFile = { filename: string; mimetype: string; filesize: number; fileurl: string; timemodified: number };

export function generatePassword(): string {
  // Meets Moodle's default policy (upper, lower, digit, symbol, >= 8 chars).
  return `Mv!${randomBytes(12).toString("base64url")}9a`;
}

const parse = <T>(raw: unknown): T => JSON.parse(String(raw)) as T;

function toCourse(c: any): MoodleCourse {
  return {
    id: c.id,
    fullname: c.fullname,
    shortname: c.shortname,
    summary: c.summary ?? "",
    visible: c.visible ?? 1,
    categoryid: c.categoryid ?? 0,
    startdate: c.startdate ?? 0,
    enddate: c.enddate ?? 0,
    enablecompletion: Boolean(c.enablecompletion),
    // Moodle files need the WS token, so browsers only ever get the YurCore image proxy.
    imageUrl: c.overviewfiles?.[0]?.fileurl ?? null,
  };
}

export const Moodle = {
  isConfigured: () => getMoodleConfig().configured,

  // ---- Users ----
  async findUserByUsername(username: string): Promise<{ id: number } | null> {
    const res = await callMoodle<{ users: { id: number }[] }>("core_user_get_users", {
      criteria: [{ key: "username", value: username }],
    });
    return res.users[0] ?? null;
  },

  async createUser(input: { username: string; password: string; email: string; firstname: string; lastname: string }): Promise<number> {
    const res = await callMoodle<{ id: number }[]>("core_user_create_users", {
      users: [{ ...input, auth: "manual", lang: "en" }],
    });
    return res[0].id;
  },

  // ---- Categories / courses ----
  async getCategories(): Promise<MoodleCategory[]> {
    const res = await callMoodle<any[]>("core_course_get_categories", {});
    return res.filter((c) => c.visible !== 0).map((c) => ({ id: c.id, name: c.name }));
  },

  async createCourse(input: { fullname: string; shortname: string; summary: string; categoryId: number; visible: boolean; startDate?: number; endDate?: number; completion: boolean }): Promise<number> {
    const res = await callMoodle<{ id: number }[]>("core_course_create_courses", {
      courses: [
        {
          fullname: input.fullname,
          shortname: input.shortname,
          summary: input.summary,
          summaryformat: 1,
          categoryid: input.categoryId,
          visible: input.visible,
          format: "topics",
          enablecompletion: input.completion,
          startdate: input.startDate,
          enddate: input.endDate,
        },
      ],
    });
    return res[0].id;
  },

  async updateCourse(id: number, input: { fullname?: string; shortname?: string; summary?: string; categoryId?: number; visible?: boolean; startDate?: number; endDate?: number; completion?: boolean }): Promise<void> {
    await callMoodle("core_course_update_courses", {
      courses: [
        {
          id,
          fullname: input.fullname,
          shortname: input.shortname,
          summary: input.summary,
          summaryformat: input.summary !== undefined ? 1 : undefined,
          categoryid: input.categoryId,
          visible: input.visible,
          startdate: input.startDate,
          enddate: input.endDate,
          enablecompletion: input.completion,
        },
      ],
    });
  },

  /**
   * Deletes a course and confirms it is gone. Moodle reports a refused deletion as a *warning* in a
   * successful response (not an exception), so warnings are checked explicitly, then the course is re-read.
   * A course that does not exist in Moodle throws `not_found` (callers may treat that as already deleted).
   */
  async deleteCourse(id: number): Promise<void> {
    const fn = "core_course_delete_courses";
    // Deleting a large course (files, grades, logs) can take much longer than a normal call.
    const res = await callMoodle<{ warnings?: { itemid?: number; warningcode?: string; message?: string }[] }>(fn, { courseids: [id] }, { timeoutMs: 120000 });
    const warning = res?.warnings?.find((w) => !w.itemid || w.itemid === id);
    if (warning) {
      const missing = warning.warningcode === "unknowncourseidnumber";
      throw new MoodleError(missing ? "not_found" : "rejected", fn, `${warning.warningcode}: ${warning.message}`);
    }
    const stillThere = await callMoodle<{ courses?: { id: number }[] }>("core_course_get_courses_by_field", { field: "id", value: id });
    if (stillThere.courses?.some((c) => c.id === id)) throw new MoodleError("rejected", fn, "course still exists after deletion");
  },

  /** Fetches live Moodle data for the mapped ids. Ids missing from the result no longer exist in Moodle. */
  async getCoursesByIds(ids: number[]): Promise<Map<number, MoodleCourse>> {
    const map = new Map<number, MoodleCourse>();
    if (ids.length === 0) return map;
    const res = await callMoodle<{ courses: any[] }>("core_course_get_courses_by_field", { field: "ids", value: ids.join(",") });
    for (const c of res.courses ?? []) map.set(c.id, toCourse(c));
    return map;
  },

  /** Every real course in Moodle (the site front page is not a course). */
  async getAllCourses(): Promise<MoodleCourse[]> {
    const res = await callMoodle<{ courses: any[] }>("core_course_get_courses_by_field", {});
    return (res.courses ?? []).filter((c) => c.format !== "site" && c.id !== 1).map(toCourse);
  },

  /** Files of every activity, keyed by cmid (page content, uploaded resources). */
  async getActivityFiles(courseId: number): Promise<Map<number, MoodleFile[]>> {
    const res = await callMoodle<{ modules: { id: number; contents?: any[] }[] }[]>("core_course_get_contents", { courseid: courseId });
    const map = new Map<number, MoodleFile[]>();
    for (const s of res) {
      for (const m of s.modules ?? []) {
        map.set(
          m.id,
          (m.contents ?? [])
            .filter((f) => f.type === "file" && f.fileurl)
            .map((f) => ({ filename: f.filename, mimetype: f.mimetype ?? "", filesize: Number(f.filesize ?? 0), fileurl: f.fileurl, timemodified: Number(f.timemodified ?? 0) })),
        );
      }
    }
    return map;
  },

  /** Downloads a Moodle file server-side; the host in Moodle data is never trusted (rebuilt on our base). */
  async downloadFile(fileUrl: string): Promise<{ data: ArrayBuffer; type: string }> {
    const cfg = getMoodleConfig();
    if (!cfg.configured) throw new MoodleError("not_configured", "download");
    const at = fileUrl.indexOf("/webservice/pluginfile.php/");
    const at2 = at < 0 ? fileUrl.indexOf("/pluginfile.php/") : -1;
    if (at < 0 && at2 < 0) throw new MoodleError("rejected", "download", "not a Moodle file URL");
    const u = new URL(cfg.baseUrl + (at >= 0 ? fileUrl.slice(at) : "/webservice" + fileUrl.slice(at2)));
    u.searchParams.set("token", cfg.token);
    let res: Response;
    try {
      res = await fetch(u, { cache: "no-store", signal: AbortSignal.timeout(cfg.timeoutMs * 30) });
    } catch (err) {
      throw new MoodleError("unavailable", "download", err instanceof Error ? err.message : undefined);
    }
    const type = res.headers.get("content-type") ?? "";
    // Moodle answers access errors with a JSON body instead of the file.
    if (!res.ok || type.startsWith("application/json")) throw new MoodleError("rejected", "download", `HTTP ${res.status}`);
    return { data: await res.arrayBuffer(), type };
  },

  /** Current values of an activity's settings (intro, dates, quiz options...), read from its Moodle form. */
  async getActivityValues(courseId: number, cmid: number): Promise<Record<string, unknown>> {
    const form = await this.getActivityForm(courseId, { cmid });
    const out: Record<string, unknown> = {};
    const walk = (els: FormElement[]) => {
      for (const e of els) {
        if (e.type === "group") walk(e.elements ?? []);
        else if (e.name) out[e.name] = e.value;
      }
    };
    for (const sec of form.sections) walk(sec.elements);
    return out;
  },

  // ---- Course structure and activities (YurCore bridge plugin) ----
  async getStructure(courseId: number): Promise<MoodleSection[]> {
    return parse<{ sections: MoodleSection[] }>(await callMoodle("local_meyveda_get_course_structure", { courseid: courseId })).sections;
  },

  /** Counts derived from the live Moodle structure (nothing is stored in YurCore). */
  summarize(sections: MoodleSection[]): CourseStructure {
    const out: CourseStructure = { sections: 0, activities: 0, quizzes: 0, assignments: 0 };
    for (const s of sections) {
      if (s.section > 0) out.sections++;
      for (const a of s.activities) {
        out.activities++;
        if (a.modname === "quiz") out.quizzes++;
        else if (a.modname === "assign") out.assignments++;
      }
    }
    return out;
  },

  // ---- Activities and resources: Moodle's own forms, read and saved through the bridge plugin ----
  async getModuleTypes(courseId: number): Promise<ModuleType[]> {
    return parse<{ modules: ModuleType[] }>(await callMoodle("local_meyveda_get_addable_modules", { courseid: courseId })).modules;
  },

  async getActivityForm(courseId: number, target: { modname?: string; section?: number; cmid?: number }): Promise<ActivityForm> {
    return parse(await callMoodle("local_meyveda_get_activity_form", { courseid: courseId, modname: target.modname ?? "", section: target.section ?? 0, cmid: target.cmid ?? 0 }));
  },

  /** Validated and saved by Moodle itself; field errors are Moodle's own messages. */
  async saveActivity(courseId: number, target: { modname?: string; section?: number; cmid?: number }, values: Record<string, unknown>, availability?: Availability): Promise<SaveResult> {
    return parse(
      await callMoodle("local_meyveda_save_activity", {
        courseid: courseId,
        modname: target.modname ?? "",
        section: target.section ?? 0,
        cmid: target.cmid ?? 0,
        values: JSON.stringify(values),
        availability: availability ? JSON.stringify(availability) : "",
      }),
    );
  },

  async setActivityVisibility(cmid: number, visible: boolean): Promise<void> {
    await callMoodle("local_meyveda_set_activity_visibility", { cmid, visible });
  },

  async deleteActivity(cmid: number): Promise<void> {
    await callMoodle("local_meyveda_delete_activity", { cmid });
  },

  async moveActivity(cmid: number, section: number, beforeCmid = 0): Promise<void> {
    await callMoodle("local_meyveda_move_activity", { cmid, section, beforecmid: beforeCmid });
  },

  // ---- Sections ----
  async addSection(courseId: number, name: string): Promise<{ id: number; section: number }> {
    return parse(await callMoodle("local_meyveda_add_section", { courseid: courseId, name }));
  },

  async updateSection(courseId: number, section: number, name: string, summary?: string): Promise<void> {
    await callMoodle("local_meyveda_update_section", { courseid: courseId, section, name, summary });
  },

  async deleteSection(courseId: number, section: number): Promise<void> {
    await callMoodle("local_meyveda_delete_section", { courseid: courseId, section });
  },

  async moveSection(courseId: number, section: number, destination: number): Promise<void> {
    await callMoodle("local_meyveda_move_section", { courseid: courseId, section, destination });
  },

  // ---- Quiz questions (Moodle question bank) ----
  async getQuiz(cmid: number): Promise<{ questions: QuizQuestion[]; grade: number; sumgrades: number }> {
    return parse(await callMoodle("local_meyveda_get_quiz", { cmid }));
  },

  async getQuestionBank(cmid: number): Promise<BankCategory[]> {
    return parse<{ categories: BankCategory[] }>(await callMoodle("local_meyveda_get_question_bank", { cmid })).categories;
  },

  async addBankQuestion(cmid: number, questionId: number, mark = 0): Promise<QuizQuestion[]> {
    return parse<{ questions: QuizQuestion[] }>(await callMoodle("local_meyveda_add_bank_question", { cmid, questionid: questionId, mark })).questions;
  },

  async addQuestion(cmid: number, data: Record<string, unknown>): Promise<QuizQuestion[]> {
    return parse<{ questions: QuizQuestion[] }>(await callMoodle("local_meyveda_add_quiz_question", { cmid, data: JSON.stringify(data) })).questions;
  },

  async updateQuestion(cmid: number, slot: number, data: Record<string, unknown>): Promise<QuizQuestion[]> {
    return parse<{ questions: QuizQuestion[] }>(await callMoodle("local_meyveda_update_quiz_question", { cmid, slot, data: JSON.stringify(data) })).questions;
  },

  async deleteQuestion(cmid: number, slot: number): Promise<QuizQuestion[]> {
    return parse<{ questions: QuizQuestion[] }>(await callMoodle("local_meyveda_delete_quiz_question", { cmid, slot })).questions;
  },

  // ---- Files (uploaded to the token user's Moodle draft area, then referenced by the plugin) ----
  async uploadDraft(file: { name: string; type: string; data: ArrayBuffer }): Promise<number> {
    const cfg = getMoodleConfig();
    if (!cfg.configured) throw new MoodleError("not_configured", "upload");
    const form = new FormData();
    form.append("token", cfg.token);
    form.append("file_1", new Blob([file.data], { type: file.type || "application/octet-stream" }), file.name);
    let res: Response;
    try {
      res = await fetch(`${cfg.baseUrl}/webservice/upload.php`, { method: "POST", body: form, cache: "no-store", signal: AbortSignal.timeout(cfg.timeoutMs * 6) });
    } catch (err) {
      throw new MoodleError("unavailable", "upload", err instanceof Error ? err.message : undefined);
    }
    const data = (await res.json().catch(() => null)) as { itemid?: number }[] | { errorcode?: string; error?: string } | null;
    if (!Array.isArray(data) || !data[0]?.itemid) {
      const e = data && !Array.isArray(data) ? data : {};
      throw new MoodleError(e.errorcode === "accessexception" ? "missing_function" : "rejected", "upload", `${e.errorcode ?? "no item"}: ${e.error ?? ""}`);
    }
    return data[0].itemid;
  },

  async setCourseImage(courseId: number, draftItemId: number): Promise<void> {
    await callMoodle("local_meyveda_set_course_image", { courseid: courseId, draftitemid: draftItemId });
  },

  /** Streams the course overview image server-side; the token never reaches the browser. */
  async fetchCourseImage(imageUrl: string): Promise<Response | null> {
    const cfg = getMoodleConfig();
    // Rebuild the URL on our own Moodle base: the host in Moodle data is never trusted.
    const at = imageUrl.indexOf("/webservice/pluginfile.php/");
    if (at < 0) return null;
    const u = new URL(cfg.baseUrl + imageUrl.slice(at));
    u.searchParams.set("token", cfg.token);
    const res = await fetch(u, { cache: "no-store", signal: AbortSignal.timeout(cfg.timeoutMs) }).catch(() => null);
    // Only ever relay real images (Moodle answers access errors with JSON).
    return res && res.ok && res.headers.get("content-type")?.startsWith("image/") ? res : null;
  },

  // ---- Enrolment ----
  async enrol(moodleUserId: number, courseId: number, roleId: number): Promise<void> {
    await callMoodle("enrol_manual_enrol_users", { enrolments: [{ roleid: roleId, userid: moodleUserId, courseid: courseId }] });
  },

  async unenrol(moodleUserId: number, courseId: number): Promise<void> {
    await callMoodle("enrol_manual_unenrol_users", { enrolments: [{ userid: moodleUserId, courseid: courseId }] });
  },

  async getEnrolledUsers(courseId: number): Promise<MoodleEnrolledUser[]> {
    const res = await callMoodle<any[]>("core_enrol_get_enrolled_users", { courseid: courseId });
    return res.map((u) => ({
      id: u.id,
      fullname: u.fullname,
      username: u.username ?? "",
      email: u.email ?? "",
      roles: (u.roles ?? []).map((r: any) => r.shortname as string),
      lastaccess: u.lastcourseaccess || u.lastaccess || null,
    }));
  },

  async getUserCourseIds(moodleUserId: number): Promise<Set<number>> {
    const res = await callMoodle<{ id: number }[]>("core_enrol_get_users_courses", { userid: moodleUserId });
    return new Set(res.map((c) => c.id));
  },

  // ---- Progress and results (Moodle calculates; YurCore displays) ----
  /** Per-activity completion for one learner. Untracked activities are flagged so they aren't counted. */
  async getActivityStatuses(courseId: number, moodleUserId: number): Promise<ActivityStatus[]> {
    try {
      const res = await callMoodle<{ statuses: { cmid: number; state: number; tracking: number }[] }>("core_completion_get_activities_completion_status", { courseid: courseId, userid: moodleUserId });
      return res.statuses.map((s) => ({ cmid: s.cmid, state: s.state, tracked: s.tracking > 0 }));
    } catch (err) {
      if (err instanceof MoodleError && err.kind === "rejected") return [];
      throw err;
    }
  },

  async getGrades(courseId: number, moodleUserId: number): Promise<ActivityGrade[]> {
    try {
      const res = await callMoodle<{ usergrades: { gradeitems: any[] }[] }>("gradereport_user_get_grade_items", { courseid: courseId, userid: moodleUserId });
      return (res.usergrades[0]?.gradeitems ?? [])
        .filter((g) => g.cmid)
        .map((g) => ({ cmid: g.cmid as number, grade: String(g.gradeformatted ?? "-"), percentage: String(g.percentageformatted ?? "-"), max: Number(g.grademax ?? 0) }));
    } catch (err) {
      if (err instanceof MoodleError && err.kind === "rejected") return [];
      throw err;
    }
  },

  // ---- Single sign-on ----
  /** One-time (60 s), single-use Moodle sign-in for a learner. Refused by Moodle for admins. */
  async createLoginUrl(moodleUserId: number, path: string): Promise<string> {
    const res = parse<{ url: string }>(await callMoodle("local_meyveda_create_login_url", { userid: moodleUserId, path }));
    // Moodle builds the URL from its own wwwroot; swap in the browser-facing base if it differs.
    const cfg = getMoodleConfig();
    return cfg.publicUrl === cfg.baseUrl ? res.url : res.url.replace(cfg.baseUrl, cfg.publicUrl);
  },

  // ---- Browser-facing links ----
  urls(courseId: number) {
    const base = getMoodleConfig().publicUrl;
    return {
      login: `${base}/login/index.php`,
      course: `/course/view.php?id=${courseId}`,
      activity: (modname: string, cmid: number) => `/mod/${modname}/view.php?id=${cmid}`,
      grades: `/grade/report/user/index.php?id=${courseId}`,
    };
  },
};
