/**
 * Credit-year and target arithmetic for the Learning Profile (AyurLearn spec, "Calculations & business rules").
 * Pure functions: the server is the only caller that produces numbers shown to learners, so every screen and
 * email uses the same formulas. All dates are interpreted in IST (UTC+05:30, no daylight saving).
 */

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The IST calendar date of an instant, as a UTC-midnight Date (so date differences are whole days). */
export function istDate(at: Date): Date {
  const shifted = new Date(at.getTime() + IST_OFFSET_MS);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()));
}

/** The credit year an instant belongs to, named by the calendar year it starts in. */
export function creditYearOf(at: Date, startMonth: number): number {
  const d = istDate(at);
  return d.getUTCMonth() + 1 >= startMonth ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
}

/** First and last IST day of a credit year (UTC-midnight dates) and the exact instants that bound it. */
export function creditYearBounds(year: number, startMonth: number) {
  const firstDay = new Date(Date.UTC(year, startMonth - 1, 1));
  const nextFirstDay = new Date(Date.UTC(year + 1, startMonth - 1, 1));
  const lastDay = new Date(nextFirstDay.getTime() - DAY_MS);
  return {
    firstDay,
    lastDay,
    /** inclusive start instant (00:00 IST on the first day) */
    startsAt: new Date(firstDay.getTime() - IST_OFFSET_MS),
    /** exclusive end instant (00:00 IST on the first day of the next year) */
    endsBefore: new Date(nextFirstDay.getTime() - IST_OFFSET_MS),
    daysInYear: Math.round((nextFirstDay.getTime() - firstDay.getTime()) / DAY_MS),
  };
}

/** "2026" for a calendar credit year, "2026–27" when the year starts in another month. */
export function creditYearLabel(year: number, startMonth: number): string {
  return startMonth === 1 ? String(year) : `${year}–${String((year + 1) % 100).padStart(2, "0")}`;
}

export type TargetStatus = "target_met" | "on_track" | "behind";

export type TargetProgress = {
  creditYear: number;
  creditYearLabel: string;
  yearStart: string; // YYYY-MM-DD (IST)
  yearEnd: string; // YYYY-MM-DD (IST)
  target: number;
  completed: number;
  remaining: number;
  /** completed / target × 100, one decimal, not capped (the bar caps at 100 for display) */
  percent: number;
  overTarget: number;
  /** days from today to the year's last day, today not counted */
  daysRemaining: number;
  daysElapsed: number;
  /** credits per 30-day month needed to finish on time; null when nothing remains or on the last day */
  requiredPace: number | null;
  expectedSoFar: number;
  status: TargetStatus;
  /** true once the credit year has ended (status is frozen at year end) */
  yearEnded: boolean;
};

const round1 = (n: number) => Math.round(n * 10) / 10;
const ymd = (d: Date) => d.toISOString().slice(0, 10);

/**
 * remaining = max(0, target − completed); days remaining = year end − today (today not counted);
 * pace = remaining ÷ (max(1, days remaining) ÷ 30), shown only when remaining > 0 and days remaining > 0;
 * expected so far = target × days elapsed ÷ days in year; met ≥ target, on track ≥ expected, else behind.
 * Worked example (27 Oct 2026, target 50, completed 32): remaining 18, 65 days, pace 8.3, expected 41.1, behind.
 */
export function computeTargetProgress(input: { now: Date; creditYear: number; startMonth: number; target: number; completed: number }): TargetProgress {
  const { creditYear, startMonth, target } = input;
  const completed = round1(input.completed);
  const b = creditYearBounds(creditYear, startMonth);
  const today = istDate(input.now);
  // Outside the year (e.g. viewing last year) the clock is clamped: a finished year is frozen at its end.
  const clamped = today < b.firstDay ? b.firstDay : today > b.lastDay ? b.lastDay : today;
  const daysRemaining = Math.max(0, Math.round((b.lastDay.getTime() - clamped.getTime()) / DAY_MS));
  const daysElapsed = Math.round((clamped.getTime() - b.firstDay.getTime()) / DAY_MS) + 1; // today counts as elapsed
  const remaining = round1(Math.max(0, target - completed));
  const expectedSoFar = round1((target * daysElapsed) / b.daysInYear);
  const status: TargetStatus = completed >= target ? "target_met" : completed >= expectedSoFar ? "on_track" : "behind";
  return {
    creditYear,
    creditYearLabel: creditYearLabel(creditYear, startMonth),
    yearStart: ymd(b.firstDay),
    yearEnd: ymd(b.lastDay),
    target,
    completed,
    remaining,
    percent: target > 0 ? round1((completed / target) * 100) : 0,
    overTarget: round1(Math.max(0, completed - target)),
    daysRemaining,
    daysElapsed,
    requiredPace: remaining > 0 && daysRemaining > 0 ? round1(remaining / (Math.max(1, daysRemaining) / 30)) : null,
    expectedSoFar,
    status,
    yearEnded: today > b.lastDay,
  };
}

export const CREDIT_TYPE_LABEL = { cme: "CME", participation: "Participation", manual: "Manual adjustment" } as const;
export type CreditType = keyof typeof CREDIT_TYPE_LABEL;

/** "2.5" / "10" — credits are stored with one decimal place. */
export function formatCredits(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export type AnnualYearStatus = "in_progress" | "exceeded" | "achieved" | "not_reached" | "no_target";

export type AnnualCreditYear = {
  year: number;
  label: string;
  /** the target saved for that year (null if the learner never set one) */
  target: number | null;
  /** credits awarded in that year only: nothing carries in from or out to other years */
  completed: number;
  status: AnnualYearStatus;
  current: boolean;
};

/**
 * One row per credit year, newest first: each year's own saved target and its own completed credits. Years are
 * strictly independent: excess credits or an unmet target never move to another year, and a year with no target
 * row is shown as such rather than borrowing another year's target. Future years are never listed.
 */
export function annualHistory(input: {
  currentYear: number;
  startMonth: number;
  targets: { year: number; target: number }[];
  credits: { year: number; credits: number }[];
}): AnnualCreditYear[] {
  const years = new Set<number>([input.currentYear]);
  for (const t of input.targets) if (t.year <= input.currentYear) years.add(t.year);
  for (const c of input.credits) if (c.year <= input.currentYear) years.add(c.year);
  return [...years]
    .sort((a, b) => b - a)
    .map((year) => {
      const target = input.targets.find((t) => t.year === year)?.target ?? null;
      const completed = round1(input.credits.filter((c) => c.year === year).reduce((n, c) => n + c.credits, 0));
      const current = year === input.currentYear;
      const status: AnnualYearStatus = current ? "in_progress" : target === null ? "no_target" : completed > target ? "exceeded" : completed === target ? "achieved" : "not_reached";
      return { year, label: creditYearLabel(year, input.startMonth), target, completed, status, current };
    });
}
