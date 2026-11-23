/**
 * Pure availability rules shared by the server (slot generation, conflict
 * checks, booking guards) and the doctor's Availability page (previews).
 *
 * How a doctor's hours for a given date are decided — first match wins:
 *   1. A date override (calendar_availability row) — custom hours or leave.
 *   2. The weekly schedule (availability_schedules) — a weekday that is
 *      missing or switched off means "day off".
 *   3. No weekly schedule at all → DEFAULT_WEEKLY_SCHEDULE.
 *
 * Weekday numbering follows the database: 0 = Monday … 6 = Sunday.
 */

export type TimeRange = { start: string; end: string };

export type WeeklyDay = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  breaks: TimeRange[];
  opTimings: TimeRange[];
  isActive: boolean;
};

export type DateOverride = {
  date: string;
  working_start: string | null;
  working_end: string | null;
  breaks: TimeRange[];
  op_timings?: TimeRange[];
  is_holiday: boolean;
  is_leave: boolean;
};

export type DayPlan =
  | { available: false; reason: "leave" | "day-off"; source: "date" | "weekly" }
  | {
      available: true;
      start: string;
      end: string;
      breaks: TimeRange[];
      opTimings: TimeRange[];
      source: "date" | "weekly" | "default";
    };

export const WEEKDAY_LABELS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
export const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/** Every new doctor starts from this: Mon–Sat, 9 AM – 5 PM, lunch 1–2 PM, Sunday off. */
export const DEFAULT_WEEKLY_SCHEDULE: WeeklyDay[] = Array.from({ length: 7 }, (_, dayOfWeek) => ({
  dayOfWeek,
  startTime: "09:00",
  endTime: "17:00",
  breaks: [{ start: "13:00", end: "14:00" }],
  opTimings: [],
  isActive: dayOfWeek !== 6,
}));

export function timeToMinutes(time: string | null | undefined): number {
  if (!time) return 0;
  const match = time.match(/(\d+):(\d+)\s*(am|pm)?/i);
  if (!match) return 0;
  let hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2], 10);
  const mod = match[3]?.toLowerCase();
  if (mod === "pm" && hours < 12) hours += 12;
  if (mod === "am" && hours === 12) hours = 0;
  return Number.isNaN(hours) || Number.isNaN(minutes) ? 0 : hours * 60 + minutes;
}

/** "HH:MM" (or "HH:MM:SS") → "h:mm AM/PM" */
export function formatTime12(time: string | null | undefined): string {
  if (!time) return "";
  const mins = timeToMinutes(time);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

export function hhmm(time: string | null | undefined): string {
  return (time ?? "").slice(0, 5);
}

/** YYYY-MM-DD → database weekday (0 = Monday … 6 = Sunday). */
export function dbWeekday(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const js = new Date(y, m - 1, d).getDay();
  return js === 0 ? 6 : js - 1;
}

export function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return toIsoDate(new Date(y, m - 1, d + days));
}

export function datesBetween(start: string, end: string): string[] {
  const out: string[] = [];
  for (let cur = start; cur <= end && out.length < 400; cur = addDays(cur, 1)) out.push(cur);
  return out;
}

export function resolveDayPlan(
  date: string,
  override: DateOverride | null | undefined,
  weekly: WeeklyDay[],
): DayPlan {
  if (override) {
    if (override.is_holiday || override.is_leave || !override.working_start || !override.working_end) {
      return { available: false, reason: "leave", source: "date" };
    }
    return {
      available: true,
      start: hhmm(override.working_start),
      end: hhmm(override.working_end),
      breaks: override.breaks ?? [],
      opTimings: override.op_timings ?? [],
      source: "date",
    };
  }

  if (weekly.length > 0) {
    const row = weekly.find((w) => w.dayOfWeek === dbWeekday(date));
    if (!row || !row.isActive || !row.startTime || !row.endTime) {
      return { available: false, reason: "day-off", source: "weekly" };
    }
    return {
      available: true,
      start: hhmm(row.startTime),
      end: hhmm(row.endTime),
      breaks: row.breaks ?? [],
      opTimings: row.opTimings ?? [],
      source: "weekly",
    };
  }

  const fallback = DEFAULT_WEEKLY_SCHEDULE[dbWeekday(date)];
  if (!fallback.isActive) return { available: false, reason: "day-off", source: "weekly" };
  return {
    available: true,
    start: fallback.startTime,
    end: fallback.endTime,
    breaks: fallback.breaks,
    opTimings: fallback.opTimings,
    source: "default",
  };
}

function overlaps(start: number, end: number, range: TimeRange): boolean {
  const rs = timeToMinutes(range.start);
  let re = timeToMinutes(range.end);
  if (re <= rs) re += 1440;
  return start < re && end > rs;
}

/**
 * Whether an appointment starting at `time` for `durationMin` minutes still
 * fits the doctor's plan for that day. Returns the human-readable reason when
 * it doesn't (used in the doctor's confirmation dialog and patient emails).
 */
export function checkTimeAgainstPlan(
  plan: DayPlan,
  time: string,
  durationMin: number,
): { ok: true } | { ok: false; reason: string } {
  if (!plan.available) {
    return { ok: false, reason: plan.reason === "leave" ? "Doctor on leave" : "Doctor not working this day" };
  }
  const start = timeToMinutes(time);
  const end = start + Math.max(durationMin, 1);
  const workStart = timeToMinutes(plan.start);
  let workEnd = timeToMinutes(plan.end);
  if (workEnd <= workStart) workEnd += 1440;

  if (start < workStart || end > workEnd) return { ok: false, reason: "Outside the new working hours" };
  if (plan.breaks.some((b) => overlaps(start, end, b))) return { ok: false, reason: "Falls in a break" };
  if (plan.opTimings.some((o) => overlaps(start, end, o))) return { ok: false, reason: "Falls in OP timing" };
  return { ok: true };
}

/** Validates hours/breaks the doctor typed. Returns an error message or null. */
export function validateHours(start: string, end: string, breaks: TimeRange[], opTimings: TimeRange[]): string | null {
  if (!start || !end) return "Start and end time are required";
  const s = timeToMinutes(start);
  const e = timeToMinutes(end);
  if (e <= s) return "End time must be after start time";
  for (const [label, list] of [["Break", breaks], ["OP timing", opTimings]] as const) {
    for (const r of list) {
      const rs = timeToMinutes(r.start);
      const re = timeToMinutes(r.end);
      if (re <= rs) return `${label} ${formatTime12(r.start)} – ${formatTime12(r.end)}: end must be after start`;
      if (rs < s || re > e) return `${label} ${formatTime12(r.start)} – ${formatTime12(r.end)} is outside working hours`;
    }
  }
  return null;
}
