"use client";

import Link from "next/link";
import { CalendarClock, ChevronRight, Pencil, Sparkles, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCredits } from "@/shared/learning/credits";
import type { TargetSummary } from "@/shared/learning/types";
import { ProgressRing, StatusBadge } from "./profile-ui";

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

/**
 * "Your Annual Learning Target": every number comes from the server (ledger + saved target), computed with the
 * spec's formulas; this component only lays them out.
 */
export function TargetSummaryCard({ progress, onEditTarget, compact = false }: { progress: TargetSummary; onEditTarget?: () => void; compact?: boolean }) {
  const p = progress;
  const u = p.creditUnit;
  const met = p.status === "target_met";
  const stats = [
    { label: "Target", value: formatCredits(p.target) },
    { label: "Completed", value: formatCredits(p.completed) },
    { label: met ? "Above target" : "Remaining", value: met ? `+${formatCredits(p.overTarget)}` : formatCredits(p.remaining) },
  ];
  return (
    <section aria-labelledby="target-summary-title" className={cn("rounded-2xl border bg-white shadow-xs", met ? "border-emerald-200/80" : "border-neutral-200/80")}>
      <div className={cn("flex flex-col gap-5 p-5 sm:flex-row sm:items-center", compact ? "sm:p-5" : "sm:p-6")}>
        <ProgressRing percent={p.percent} status={p.status} size={compact ? 84 : 96} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="target-summary-title" className="text-base font-semibold text-neutral-900">Your Annual Learning Target</h2>
            <StatusBadge status={p.status} exceeded={p.overTarget > 0} />
            <span className="text-xs text-slate-400">Credit year {p.creditYearLabel}</span>
          </div>
          {met ? (
            <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-emerald-700">
              <Sparkles size={15} aria-hidden /> Target Met{p.overTarget > 0 ? ` — ${formatCredits(p.overTarget)} ${u} above target` : ""}{p.targetMetOn ? ` · completed on ${fmtDate(p.targetMetOn)}` : ""}
            </p>
          ) : (
            <p className="mt-1 text-sm text-slate-500">{formatCredits(p.remaining)} {u} to go · {p.daysRemaining} {p.daysRemaining === 1 ? "day" : "days"} left in the credit year</p>
          )}

          <dl className="mt-4 grid grid-cols-3 gap-2 sm:max-w-md">
            {stats.map((s) => (
              <div key={s.label} className="rounded-xl bg-neutral-50 px-3 py-2.5">
                <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{s.label}</dt>
                <dd className="mt-0.5 text-xl font-semibold tabular-nums text-neutral-900">{s.value}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-neutral-100 sm:max-w-md" role="progressbar" aria-label="Progress toward annual target" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.round(p.percent))}>
            <div className={cn("h-full rounded-full transition-[width] duration-500", met ? "bg-emerald-500" : p.status === "behind" ? "bg-amber-500" : "bg-copper")} style={{ width: `${Math.min(100, p.percent)}%` }} />
          </div>
          <p className="mt-1.5 text-xs text-slate-500"><b className="tabular-nums text-neutral-900">{formatCredits(p.completed)} / {formatCredits(p.target)}</b> {u} completed · {formatCredits(p.percent)}%{p.overTarget > 0 ? " (not carried into next year)" : ""}</p>
        </div>

        <div className="flex flex-col gap-2 border-t border-neutral-100 pt-4 sm:w-56 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
          {!met && p.requiredPace !== null && (
            <div className={cn("rounded-xl px-3 py-2.5", p.status === "behind" ? "bg-amber-50 text-amber-900" : "bg-neutral-50 text-neutral-700")}>
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide"><TrendingUp size={12} aria-hidden /> Required pace</p>
              <p className={cn("mt-0.5 font-semibold tabular-nums", p.status === "behind" ? "text-lg" : "text-sm")}>{formatCredits(p.requiredPace)} {u} / month</p>
            </div>
          )}
          <p className="flex items-center gap-1.5 text-xs text-slate-500"><CalendarClock size={13} aria-hidden /> {p.daysRemaining} days remaining · ends {fmtDate(`${p.yearEnd}T12:00:00+05:30`)}</p>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {onEditTarget && (
              <button type="button" onClick={onEditTarget} className="inline-flex items-center gap-1 text-xs font-semibold text-copper hover:underline"><Pencil size={12} aria-hidden /> Edit target</button>
            )}
            {!compact ? null : (
              <Link href="/pro/learning/profile" className="inline-flex items-center gap-0.5 text-xs font-semibold text-slate-600 hover:text-neutral-900">Learning profile <ChevronRight size={13} aria-hidden /></Link>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
