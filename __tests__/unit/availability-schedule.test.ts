import { describe, expect, it } from "vitest";

import {
  DEFAULT_WEEKLY_SCHEDULE,
  checkTimeAgainstPlan,
  dbWeekday,
  resolveDayPlan,
  validateHours,
  type WeeklyDay,
} from "@/shared/availability/schedule";

// 2026-11-23 is a Monday, 2026-11-29 a Sunday.
const MONDAY = "2026-11-23";
const SUNDAY = "2026-11-29";

const weekly: WeeklyDay[] = DEFAULT_WEEKLY_SCHEDULE.map((d) => ({ ...d }));

describe("resolveDayPlan", () => {
  it("maps dates to database weekdays (Mon = 0, Sun = 6)", () => {
    expect(dbWeekday(MONDAY)).toBe(0);
    expect(dbWeekday(SUNDAY)).toBe(6);
  });

  it("uses the default 9–5 schedule when the doctor has no weekly rows", () => {
    const plan = resolveDayPlan(MONDAY, undefined, []);
    expect(plan).toMatchObject({ available: true, start: "09:00", end: "17:00", source: "default" });
    expect(resolveDayPlan(SUNDAY, undefined, []).available).toBe(false);
  });

  it("treats a switched-off weekday as a day off (not the 9–5 fallback)", () => {
    const off = weekly.map((d) => (d.dayOfWeek === 0 ? { ...d, isActive: false } : d));
    expect(resolveDayPlan(MONDAY, undefined, off)).toMatchObject({ available: false, reason: "day-off" });
  });

  it("lets a date override win over the weekly schedule", () => {
    const leave = { date: MONDAY, working_start: null, working_end: null, breaks: [], is_holiday: false, is_leave: true };
    expect(resolveDayPlan(MONDAY, leave, weekly)).toMatchObject({ available: false, reason: "leave" });

    const custom = { ...leave, is_leave: false, working_start: "10:00:00", working_end: "12:00:00" };
    expect(resolveDayPlan(MONDAY, custom, weekly)).toMatchObject({ available: true, start: "10:00", end: "12:00", source: "date" });
  });
});

describe("checkTimeAgainstPlan", () => {
  const plan = resolveDayPlan(MONDAY, undefined, weekly);

  it("accepts appointments inside working hours", () => {
    expect(checkTimeAgainstPlan(plan, "09:00", 30).ok).toBe(true);
    expect(checkTimeAgainstPlan(plan, "16:30", 30).ok).toBe(true);
  });

  it("flags appointments outside hours or inside breaks", () => {
    expect(checkTimeAgainstPlan(plan, "16:45", 30)).toMatchObject({ ok: false, reason: "Outside the new working hours" });
    expect(checkTimeAgainstPlan(plan, "13:15", 20)).toMatchObject({ ok: false, reason: "Falls in a break" });
    expect(checkTimeAgainstPlan(plan, "12:50", 20)).toMatchObject({ ok: false });
  });

  it("flags every appointment on a leave day", () => {
    const leavePlan = resolveDayPlan(MONDAY, { date: MONDAY, working_start: null, working_end: null, breaks: [], is_holiday: false, is_leave: true }, weekly);
    expect(checkTimeAgainstPlan(leavePlan, "10:00", 20)).toMatchObject({ ok: false, reason: "Doctor on leave" });
  });
});

describe("validateHours", () => {
  it("rejects end before start and breaks outside hours", () => {
    expect(validateHours("17:00", "09:00", [], [])).toMatch(/after start/);
    expect(validateHours("09:00", "17:00", [{ start: "18:00", end: "19:00" }], [])).toMatch(/outside working hours/);
    expect(validateHours("09:00", "17:00", [{ start: "13:00", end: "14:00" }], [])).toBeNull();
  });
});
