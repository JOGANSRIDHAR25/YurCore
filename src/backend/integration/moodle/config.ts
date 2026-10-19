import "server-only";

/** Moodle settings. Read server-side only; never expose these to the browser. */
export function getMoodleConfig() {
  const baseUrl = (process.env.MOODLE_BASE_URL ?? "").replace(/\/$/, "");
  const token = process.env.MOODLE_WS_TOKEN ?? "";
  return {
    configured: Boolean(baseUrl && token),
    baseUrl,
    token,
    /** URL used in links opened by the user's browser (may differ from the server-side URL). */
    publicUrl: (process.env.MOODLE_PUBLIC_URL ?? baseUrl).replace(/\/$/, ""),
    timeoutMs: Number(process.env.MOODLE_TIMEOUT_MS) || 10000,
    defaultCategoryId: Number(process.env.MOODLE_DEFAULT_CATEGORY_ID) || 1,
    teacherRoleId: Number(process.env.MOODLE_TEACHER_ROLE_ID) || 3,
    studentRoleId: Number(process.env.MOODLE_STUDENT_ROLE_ID) || 5,
  };
}
