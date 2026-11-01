"use client";

import { SITE_NAME } from "@/shared/config/site";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Download, FileText, Loader2, Pencil, RotateCw, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery } from "@/hooks/useQuery";
import { CREDIT_TYPE_LABEL, formatCredits } from "@/shared/learning/credits";
import type { LearningProfile } from "@/shared/learning/types";
import { LearningHeader } from "../_components/LearningTabs";
import { LearningSetup } from "../_components/LearningSetup";
import { TargetSummaryCard } from "../_components/TargetSummaryCard";
import { EditInterestsDialog, EditTargetDialog, btnSecondary } from "../_components/profile-ui";
import { learningApi } from "../_lib/api";

const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

/** Learning Profile: target and progress, interests, last year's summary and the credit ledger with exports. */
export default function LearningProfilePage() {
  const { data, loading, error, refetch } = useQuery(() => learningApi.profile(), []);
  const [profile, setProfile] = useState<LearningProfile | null>(null);
  const [editTarget, setEditTarget] = useState(false);
  const [editInterests, setEditInterests] = useState(false);
  useEffect(() => {
    if (data) setProfile(data);
  }, [data]);

  if (!profile) {
    return loading || !error ? (
      <div className="flex justify-center py-32"><Loader2 className="h-7 w-7 animate-spin text-copper" aria-label="Loading" /></div>
    ) : (
      <div className="mx-auto max-w-xl px-4 py-24 text-center" role="alert">
        <p className="text-sm text-amber-800">{error}</p>
        <button type="button" onClick={refetch} className={cn(btnSecondary, "mt-3")}><RotateCw size={14} /> Try again</button>
      </div>
    );
  }
  if (profile.needsSetup) return <LearningSetup profile={profile} onSave={async (input) => setProfile(await learningApi.saveSetup(input))} />;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <LearningHeader title="Learning Profile" subtitle={`Your ${SITE_NAME} Learning target, interests and credit record.`} />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-5">
          {profile.progress && <TargetSummaryCard progress={profile.progress} onEditTarget={() => setEditTarget(true)} />}
          {profile.progress?.status === "behind" && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 px-5 py-4">
              <p className="text-sm text-amber-900">You are behind the pace needed to reach your target this year.</p>
              <Link href="/pro/learning" className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700">Find courses</Link>
            </div>
          )}
          <AnnualHistory profile={profile} />
          <CreditsLedger unit={profile.settings.creditUnit} />
        </div>

        <aside className="space-y-5">
          <section className="rounded-2xl border border-neutral-200/80 bg-white p-5 shadow-xs" aria-labelledby="interests-title">
            <div className="flex items-center justify-between gap-2">
              <h2 id="interests-title" className="text-sm font-semibold text-neutral-900">Favourite categories <span className="font-normal text-slate-400">({profile.interests.length})</span></h2>
              <button type="button" onClick={() => setEditInterests(true)} className="inline-flex items-center gap-1 text-xs font-semibold text-herb-green hover:underline"><Pencil size={12} /> Edit</button>
            </div>
            {profile.interests.length ? (
              <ul className="mt-3 flex flex-wrap gap-2">
                {profile.interests.map((c) => (
                  <li key={c.id} className="inline-flex max-w-full items-center gap-1 rounded-full border border-herb-green/20 bg-herb-green/[0.06] py-1 pl-3 pr-1.5 text-xs font-medium text-herb-green">
                    {c.name}
                    {profile.interests.length > 1 && (
                      <button type="button" aria-label={`Remove ${c.name}`} onClick={async () => setProfile(await learningApi.updateInterests(profile.interests.filter((x) => x.id !== c.id).map((x) => x.id)))} className="rounded-full px-1 hover:bg-herb-green/10">×</button>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-slate-500">No favourite categories chosen yet.</p>
            )}
            <p className="mt-3 text-xs text-slate-500">Used to recommend courses and to email you when a new course in these categories is published.</p>
          </section>

          <section className="rounded-2xl border border-neutral-200/80 bg-white p-5 shadow-xs">
            <h2 className="text-sm font-semibold text-neutral-900">How credits work</h2>
            <ul className="mt-2 space-y-1.5 text-xs leading-5 text-slate-500">
              <li>Each course awards a fixed number of credits once, when its certificate is issued.</li>
              <li>Credits count toward the credit year in which you complete the course (IST).</li>
              <li>Every year has its own target and starts at zero: extra credits and unmet targets are never carried forward.</li>
              <li>A revoked certificate removes its credits from your record.</li>
              <li>Recognition of credits for registration renewal is decided by your council.</li>
            </ul>
          </section>
        </aside>
      </div>

      {editTarget && <EditTargetDialog profile={profile} onClose={() => setEditTarget(false)} onSave={async (t) => setProfile(await learningApi.updateTarget(t))} />}
      {editInterests && <EditInterestsDialog profile={profile} onClose={() => setEditInterests(false)} onSave={async (ids) => setProfile(await learningApi.updateInterests(ids))} />}
    </div>
  );
}

const YEAR_STATUS = {
  in_progress: { label: "In progress", cls: "bg-herb-green/[0.07] text-herb-green ring-herb-green/20" },
  exceeded: { label: "Target exceeded", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200/70" },
  achieved: { label: "Target achieved", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200/70" },
  not_reached: { label: "Target not reached", cls: "bg-amber-50 text-amber-800 ring-amber-200/70" },
  no_target: { label: "No target set", cls: "bg-neutral-100 text-slate-600 ring-neutral-200" },
} as const;

/** Year-by-year record: each year's own target and completed credits, straight from saved targets and the ledger. */
function AnnualHistory({ profile }: { profile: LearningProfile }) {
  const unit = profile.settings.creditUnit;
  const rows = profile.history;
  return (
    <section className="rounded-2xl border border-neutral-200/80 bg-white shadow-xs" aria-labelledby="history-title">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-neutral-100 p-5">
        <div>
          <h2 id="history-title" className="text-base font-semibold text-neutral-900">Annual CME history</h2>
          <p className="mt-1 text-sm text-slate-500">Each year is tracked on its own. Extra or unused credits are not carried forward.</p>
        </div>
      </div>
      <div className="overflow-x-auto px-5 pb-4 pt-2">
        <table className="w-full min-w-[30rem] text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-100 text-[11px] uppercase tracking-wide text-slate-500">
              <th className="py-2 pr-3 font-semibold">Year</th>
              <th className="py-2 pr-3 text-right font-semibold">Target</th>
              <th className="py-2 pr-3 text-right font-semibold">Completed</th>
              <th className="py-2 pr-3 text-right font-semibold">Difference</th>
              <th className="py-2 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((h) => {
              const diff = h.target === null ? null : Math.round((h.completed - h.target) * 10) / 10;
              const st = YEAR_STATUS[h.status];
              return (
                <tr key={h.year} className={cn("border-b border-neutral-50 last:border-0", h.current && "bg-herb-green/[0.03]")}>
                  <td className="py-2.5 pr-3 font-semibold text-neutral-900">{h.label}{h.current && <span className="ml-1.5 text-xs font-medium text-slate-400">current</span>}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums text-slate-700">{h.target === null ? "—" : formatCredits(h.target)}</td>
                  <td className="py-2.5 pr-3 text-right font-semibold tabular-nums text-neutral-900">{formatCredits(h.completed)}</td>
                  <td className={cn("py-2.5 pr-3 text-right tabular-nums", diff === null ? "text-slate-400" : diff > 0 ? "text-emerald-700" : diff < 0 ? "text-amber-700" : "text-slate-600")}>{diff === null ? "—" : `${diff > 0 ? "+" : ""}${formatCredits(diff)}`}</td>
                  <td className="py-2.5"><span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset", st.cls)}>{st.label}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-slate-500">Credits ({unit}) count in the year the course was completed (IST). Differences are shown for reference only and never move to another year.</p>
      </div>
    </section>
  );
}

function CreditsLedger({ unit }: { unit: string }) {
  const [year, setYear] = useState<number | null>(null);
  const [type, setType] = useState<string>("");
  const { data, loading, error, refetch } = useQuery(() => learningApi.credits({ year, type }), [year, type]);
  const [q, setQ] = useState("");
  const rows = (data?.entries ?? []).filter((e) => !q.trim() || (e.courseTitle ?? e.reason).toLowerCase().includes(q.trim().toLowerCase()));
  const select = "h-9 rounded-lg border border-neutral-200 bg-white px-2.5 text-sm text-neutral-800 outline-none focus:border-copper/60 focus:ring-2 focus:ring-copper/15";

  return (
    <section className="rounded-2xl border border-neutral-200/80 bg-white shadow-xs" aria-labelledby="credits-title">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-neutral-100 p-5">
        <div>
          <h2 id="credits-title" className="text-base font-semibold text-neutral-900">Credits</h2>
          {data && (
            <p className="mt-1 text-sm text-slate-500">
              This year <b className="tabular-nums text-neutral-900">{formatCredits(data.totals.thisYear)}</b> · Last year <b className="tabular-nums text-neutral-900">{formatCredits(data.totals.lastYear)}</b> · Lifetime <b className="tabular-nums text-neutral-900">{formatCredits(data.totals.lifetime)}</b> {unit}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <a href={learningApi.creditsExportUrl("csv", { year, type })} className={cn(btnSecondary, "px-3 py-2")}><Download size={14} /> CSV</a>
          <a href={learningApi.creditsExportUrl("pdf", { year, type })} className={cn(btnSecondary, "px-3 py-2")}><FileText size={14} /> PDF</a>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 px-5 pt-4">
        <label className="sr-only" htmlFor="credit-year">Credit year</label>
        <select id="credit-year" value={year ?? ""} onChange={(e) => setYear(e.target.value ? Number(e.target.value) : null)} className={select}>
          <option value="">All years</option>
          {data?.years.map((y) => <option key={y.year} value={y.year}>{y.label}</option>)}
        </select>
        <label className="sr-only" htmlFor="credit-type">Credit type</label>
        <select id="credit-type" value={type} onChange={(e) => setType(e.target.value)} className={select}>
          <option value="">All types</option>
          {Object.entries(CREDIT_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <div className="relative ml-auto">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search credits" className={cn(select, "w-44 pl-8")} />
        </div>
      </div>
      <div className="overflow-x-auto p-5 pt-3">
        {loading && !data ? (
          <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-copper" /></div>
        ) : error ? (
          <p className="py-6 text-center text-sm text-amber-800">{error} <button onClick={refetch} className="font-semibold underline">Retry</button></p>
        ) : rows.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-sm font-medium text-neutral-800">No credits yet</p>
            <p className="mt-1 text-sm text-slate-500">Complete a course to earn your first credits.</p>
            <Link href="/pro/learning" className="mt-3 inline-block text-sm font-semibold text-copper hover:underline">Browse recommended courses</Link>
          </div>
        ) : (
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-100 text-[11px] uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-3 font-semibold">Date</th><th className="py-2 pr-3 font-semibold">Course</th><th className="py-2 pr-3 font-semibold">Type</th><th className="py-2 pr-3 text-right font-semibold">Credits</th><th className="py-2 pr-3 font-semibold">Reason</th><th className="py-2 font-semibold">Certificate</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} className="border-b border-neutral-50 last:border-0">
                  <td className="whitespace-nowrap py-2.5 pr-3 text-slate-600">{fmt(e.date)}</td>
                  <td className="py-2.5 pr-3 font-medium text-neutral-900">{e.courseTitle ?? "—"}</td>
                  <td className="py-2.5 pr-3 text-slate-600">{CREDIT_TYPE_LABEL[e.creditType]}</td>
                  <td className={cn("py-2.5 pr-3 text-right font-semibold tabular-nums", e.credits < 0 ? "text-red-600" : "text-emerald-700")}>{e.credits > 0 ? "+" : ""}{formatCredits(e.credits)}</td>
                  <td className="py-2.5 pr-3 text-slate-600">{e.reason}</td>
                  <td className="py-2.5">{e.certificateId ? <Link href={`/pro/learning/certificates?highlight=${e.certificateId}`} className="font-mono text-xs text-copper hover:underline">{e.certificateNumber}</Link> : <span className="text-slate-400">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
