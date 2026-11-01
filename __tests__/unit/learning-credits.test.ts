import { describe, expect, it } from "vitest";
import { computeTargetProgress, creditYearBounds, creditYearOf } from "@/shared/learning/credits";

describe("learning credit-year arithmetic (AyurLearn spec)", () => {
  it("matches the spec's worked example on 27 Oct 2026 (target 50, 32 completed)", () => {
    const p = computeTargetProgress({ now: new Date("2026-10-27T06:00:00Z"), creditYear: 2026, startMonth: 1, target: 50, completed: 32 });
    expect(p.remaining).toBe(18);
    expect(p.daysRemaining).toBe(65);
    expect(p.requiredPace).toBe(8.3);
    expect(p.expectedSoFar).toBe(41.1);
    expect(p.status).toBe("behind");
    expect(p.percent).toBe(64);
  });

  it("counts a completion at 11:30 pm IST on 31 Dec toward that year", () => {
    const at = new Date("2026-12-31T18:00:00Z"); // 23:30 IST
    expect(creditYearOf(at, 1)).toBe(2026);
    const b = creditYearBounds(2026, 1);
    expect(at >= b.startsAt && at < b.endsBefore).toBe(true);
    expect(creditYearOf(new Date("2026-12-31T18:30:00Z"), 1)).toBe(2027); // 00:00 IST 1 Jan
  });

  it("shows credits above target and hides the pace once met", () => {
    const p = computeTargetProgress({ now: new Date("2026-06-01T06:00:00Z"), creditYear: 2026, startMonth: 1, target: 50, completed: 55 });
    expect(p.status).toBe("target_met");
    expect(p.overTarget).toBe(5);
    expect(p.remaining).toBe(0);
    expect(p.requiredPace).toBeNull();
  });

  it("hides the pace on the last day", () => {
    const p = computeTargetProgress({ now: new Date("2026-12-31T06:00:00Z"), creditYear: 2026, startMonth: 1, target: 10, completed: 2 });
    expect(p.daysRemaining).toBe(0);
    expect(p.requiredPace).toBeNull();
  });

  it("supports credit years that start in another month", () => {
    expect(creditYearOf(new Date("2026-02-15T06:00:00Z"), 3)).toBe(2025);
    expect(creditYearOf(new Date("2026-03-01T06:00:00Z"), 3)).toBe(2026);
    expect(creditYearBounds(2026, 3).lastDay.toISOString().slice(0, 10)).toBe("2027-02-28");
  });
});
