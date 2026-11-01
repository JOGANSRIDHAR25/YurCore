import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/db/supabase.server", () => ({ createClient: () => { throw new Error("db must not be reached"); } }));

import { annualHistory, computeTargetProgress, creditYearOf } from "@/shared/learning/credits";
import { interestsSchema, setupSchema } from "@/backend/service/learning-profile.service";

const uuid = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;

describe("favourite categories: no upper limit", () => {
  it("accepts one, three, more than three and every category", () => {
    for (const n of [1, 3, 7, 25]) {
      expect(interestsSchema.safeParse({ categoryIds: Array.from({ length: n }, (_, i) => uuid(i)) }).success).toBe(true);
      expect(setupSchema.safeParse({ categoryIds: Array.from({ length: n }, (_, i) => uuid(i)), target: 10 }).success).toBe(true);
    }
  });

  it("still rejects ids that are not category ids", () => {
    expect(interestsSchema.safeParse({ categoryIds: ["not-a-uuid"] }).success).toBe(false);
  });
});

describe("annual CME credits: every year is independent", () => {
  it("scenario 1: 15 of 10 in 2026; 2027 starts at 0 and the extra 5 are not carried", () => {
    const h = annualHistory({ currentYear: 2027, startMonth: 1, targets: [{ year: 2026, target: 10 }], credits: [{ year: 2026, credits: 10 }, { year: 2026, credits: 5 }] });
    expect(h).toEqual([
      expect.objectContaining({ year: 2027, target: null, completed: 0, status: "in_progress", current: true }),
      expect.objectContaining({ year: 2026, target: 10, completed: 15, status: "exceeded", current: false }),
    ]);
  });

  it("scenario 2: 6 of 10 in 2026; 2027 starts at 0 and the unused 4 are not carried", () => {
    const h = annualHistory({ currentYear: 2027, startMonth: 1, targets: [{ year: 2026, target: 10 }, { year: 2027, target: 12 }], credits: [{ year: 2026, credits: 6 }] });
    expect(h[0]).toMatchObject({ year: 2027, target: 12, completed: 0 });
    expect(h[1]).toMatchObject({ year: 2026, target: 10, completed: 6, status: "not_reached" });
  });

  it("scenarios 3-5: 2027 target 12 then 15, 3 credits in January 2027; 2026 untouched", () => {
    const targets2026 = [{ year: 2026, target: 10 }];
    const jan15 = creditYearOf(new Date("2027-01-15T06:00:00Z"), 1);
    expect(jan15).toBe(2027);
    const before = annualHistory({ currentYear: 2027, startMonth: 1, targets: [...targets2026, { year: 2027, target: 12 }], credits: [{ year: 2026, credits: 15 }] });
    const after = annualHistory({ currentYear: 2027, startMonth: 1, targets: [...targets2026, { year: 2027, target: 15 }], credits: [{ year: 2026, credits: 15 }, { year: jan15, credits: 3 }] });
    expect(before[0]).toMatchObject({ year: 2027, target: 12, completed: 0 });
    expect(after[0]).toMatchObject({ year: 2027, target: 15, completed: 3 });
    expect(after[1]).toEqual(before[1]); // 2026 unchanged
    expect(computeTargetProgress({ now: new Date("2027-01-20T06:00:00Z"), creditYear: 2027, startMonth: 1, target: 15, completed: 3 })).toMatchObject({ completed: 3, target: 15, remaining: 12 });
  });

  it("scenario 7: above target shows the real total, never capped", () => {
    const p = computeTargetProgress({ now: new Date("2026-11-01T06:00:00Z"), creditYear: 2026, startMonth: 1, target: 10, completed: 15 });
    expect(p).toMatchObject({ completed: 15, target: 10, overTarget: 5, remaining: 0, percent: 150, status: "target_met" });
  });

  it("marks an exactly met past year as achieved and a year without a target as such", () => {
    const h = annualHistory({ currentYear: 2026, startMonth: 1, targets: [{ year: 2024, target: 10 }], credits: [{ year: 2024, credits: 10 }, { year: 2025, credits: 4 }] });
    expect(h.map((x) => [x.year, x.status])).toEqual([[2026, "in_progress"], [2025, "no_target"], [2024, "achieved"]]);
  });

  it("a revoked certificate's reversal reduces only its own year", () => {
    const h = annualHistory({ currentYear: 2027, startMonth: 1, targets: [], credits: [{ year: 2026, credits: 2.5 }, { year: 2026, credits: -2.5 }, { year: 2027, credits: 3 }] });
    expect(h.find((x) => x.year === 2026)?.completed).toBe(0);
    expect(h.find((x) => x.year === 2027)?.completed).toBe(3);
  });

  it("never lists future years", () => {
    const h = annualHistory({ currentYear: 2026, startMonth: 1, targets: [{ year: 2027, target: 20 }], credits: [] });
    expect(h.map((x) => x.year)).toEqual([2026]);
  });
});
