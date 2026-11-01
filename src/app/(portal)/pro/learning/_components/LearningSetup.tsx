"use client";

import { SITE_NAME } from "@/shared/config/site";
import { useState } from "react";
import { ArrowRight, CalendarDays, Check, GraduationCap, Heart, History, Info, Loader2, ShieldCheck, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { creditYearLabel, creditYearOf, formatCredits } from "@/shared/learning/credits";
import type { LearningProfile } from "@/shared/learning/types";
import { CategoryPicker, TargetInput, btnPrimary, targetError } from "./profile-ui";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/**
 * Learning Setup, shown before the course listing until the learner has chosen their favourite categories and set
 * this credit year's target. A new credit year always needs its own target: the input starts at the admin default,
 * never at last year's value, and nothing (credits or unmet target) carries over. On a failed save the
 * selections stay.
 */
export function LearningSetup({ profile, onSave }: { profile: LearningProfile; onSave: (input: { categoryIds: string[]; target: number }) => Promise<void> }) {
  const s = profile.settings;
  const [categoryIds, setCategoryIds] = useState(profile.interests.map((c) => c.id));
  const [target, setTarget] = useState(String(profile.savedTarget ?? s.defaultTarget));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const available = profile.categories.length;
  const needCategories = available > 0 && categoryIds.length === 0;
  const tErr = targetError(target, s.minimumTarget, s.creditUnit);
  const canContinue = !needCategories && !tErr && !saving;
  const year = creditYearOf(new Date(), s.creditYearStartMonth);
  const yearLabel = creditYearLabel(year, s.creditYearStartMonth);
  const endMonth = MONTHS[(s.creditYearStartMonth + 10) % 12];
  // A returning learner whose favourites are intact only needs this year's target.
  const newYear = !profile.firstTime && profile.interests.length > 0;
  const step = needCategories ? 1 : tErr ? 2 : 3;
  const completedThisYear = profile.history.find((h) => h.current)?.completed ?? 0;
  const steps = ["Favourite categories", "Annual target", "Continue"];

  async function submit() {
    if (!canContinue) return;
    setSaving(true);
    setError(null);
    try {
      await onSave({ categoryIds, target: Number(target) });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Your settings could not be saved. Please try again.");
      setSaving(false);
    }
  }

  const card = "rounded-2xl border border-neutral-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]";

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:py-10">
      <header className="flex items-start gap-3.5">
        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-herb-green/[0.08] text-herb-green ring-1 ring-inset ring-herb-green/15" aria-hidden>
          <GraduationCap size={21} strokeWidth={1.75} />
        </div>
        <div className="min-w-0">
          <h1 className="text-[26px] font-semibold leading-8 tracking-[-0.02em] text-neutral-900">{newYear ? `Set Your ${yearLabel} Learning Target` : `${SITE_NAME} Learning`}</h1>
          <p className="mt-1 max-w-xl text-[15px] leading-6 text-slate-500">
            {newYear ? "Define your CME learning goal for the year and track your progress." : "Discover courses, earn CME credits, and stay on track with your professional learning goals."}
          </p>
        </div>
      </header>

      {!profile.firstTime && (
        <div className="mt-6 flex items-start gap-2.5 rounded-xl border border-herb-green/15 bg-herb-green/[0.04] px-4 py-3 text-sm text-neutral-800">
          <Info size={16} className="mt-0.5 flex-shrink-0 text-herb-green" aria-hidden />
          <p>
            {profile.interests.length === 0
              ? "Your saved favourite categories are no longer available. Please choose your categories again."
              : <>A new credit year (<b>{yearLabel}</b>) has started and its completed credits are counted from <b>0</b>. Credits and targets from earlier years are not carried forward; they stay in your annual history.</>}
          </p>
        </div>
      )}

      <ol className="mt-7 flex flex-wrap items-center gap-y-2 text-[13px] font-medium text-slate-500" aria-label="Setup progress">
        {steps.map((label, i) => {
          const done = i + 1 < step;
          const active = i + 1 === step;
          return (
            <li key={label} className="flex items-center">
              <span className={cn("flex items-center gap-2 rounded-full py-1 pl-1 pr-3 transition-colors", active && "bg-herb-green/[0.07]")} aria-current={active ? "step" : undefined}>
                <span className={cn("flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums transition-colors", done ? "bg-herb-green text-white" : active ? "bg-white text-herb-green ring-[1.5px] ring-herb-green" : "bg-white text-slate-400 ring-1 ring-neutral-200")}>
                  {done ? <Check size={13} strokeWidth={3} aria-hidden /> : i + 1}
                </span>
                <span className={cn(active ? "text-herb-green" : done ? "text-neutral-800" : "text-slate-400")}>{label}</span>
              </span>
              {i < steps.length - 1 && <span className={cn("mx-2 h-px w-6 sm:w-12", done ? "bg-herb-green/40" : "bg-neutral-200")} aria-hidden />}
            </li>
          );
        })}
      </ol>

      <section className={cn(card, "mt-5 p-5 sm:p-7")} aria-labelledby="setup-categories">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-herb-green/[0.08] text-herb-green" aria-hidden><Heart size={17} /></span>
          <div>
            <h2 id="setup-categories" className="text-[17px] font-semibold tracking-[-0.01em] text-neutral-900">Select Your Favourite Learning Categories</h2>
            <p className="mt-0.5 text-sm text-slate-500">Choose all the learning areas you are interested in to personalize your learning experience.</p>
          </div>
        </div>
        <div className="mt-5">
          {available === 0 ? (
            <p className="rounded-xl border border-dashed border-neutral-200 px-4 py-6 text-center text-sm text-slate-500">No learning categories have been set up yet. You can choose your favourites later from your Learning Profile.</p>
          ) : (
            <CategoryPicker categories={profile.categories} value={categoryIds} onChange={setCategoryIds} />
          )}
        </div>
      </section>

      <section className={cn(card, "mt-5 p-5 sm:p-7")} aria-labelledby="setup-target">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-copper/[0.08] text-copper" aria-hidden><Target size={17} /></span>
          <div>
            <h2 id="setup-target" className="text-[17px] font-semibold tracking-[-0.01em] text-neutral-900">{newYear ? `Your ${yearLabel} Annual Learning Target` : "Set Your Annual Learning Target"}</h2>
            <p className="mt-0.5 text-sm text-slate-500">This target applies to {yearLabel} only. You can edit it at any time during the year.</p>
          </div>
        </div>

        <div className="mt-6 grid gap-5 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] md:items-stretch">
          <div className="rounded-xl border border-neutral-200/80 p-4">
            <label htmlFor="setup-target-input" className="mb-2.5 block text-[13px] font-semibold text-neutral-900">Your {yearLabel} target</label>
            <TargetInput id="setup-target-input" value={target} onChange={(v) => { setTarget(v); setError(null); }} min={s.minimumTarget} unit={s.creditUnit} />
            {target !== "" && tErr && <p className="mt-2 text-[13px] font-medium text-red-600" role="alert">{tErr}</p>}
          </div>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <InfoTile label="Default target" value={`${formatCredits(s.defaultTarget)} ${s.creditUnit}`} />
            <InfoTile label="Minimum target" value={`${formatCredits(s.minimumTarget)} ${s.creditUnit}`} icon={<ShieldCheck size={12} aria-hidden />} />
            <InfoTile label="Credit year" value={`${yearLabel} · ${MONTHS[s.creditYearStartMonth - 1].slice(0, 3)} – ${endMonth.slice(0, 3)} (IST)`} icon={<CalendarDays size={12} aria-hidden />} />
            <InfoTile label={`Completed in ${yearLabel}`} value={`${formatCredits(completedThisYear)} ${s.creditUnit}`} sub="Counted from zero each year" />
            {newYear && profile.lastYear && (
              <div className="col-span-2 flex items-start gap-2 rounded-xl bg-neutral-50 px-3.5 py-2.5 text-[13px] text-slate-600 ring-1 ring-inset ring-neutral-200/70">
                <History size={14} className="mt-0.5 flex-shrink-0 text-slate-400" aria-hidden />
                <span>
                  {profile.lastYear.label}: {formatCredits(profile.lastYear.completed)} {s.creditUnit} completed{profile.lastYear.target !== null ? ` of a ${formatCredits(profile.lastYear.target)} target` : ""}. Not carried forward.
                </span>
              </div>
            )}
          </dl>
        </div>
        <p className="mt-5 text-xs leading-5 text-slate-500">
          Credits are added when a course&apos;s certificate is issued and count only toward the credit year in which you complete the course. Each year has its own target and starts at zero completed credits: extra credits and unmet targets are never carried forward. Your target cannot be set below the minimum.
        </p>
      </section>

      <div className={cn(card, "mt-5 flex flex-col-reverse items-stretch gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between")}>
        <p className={cn("text-sm", needCategories || tErr ? "text-slate-500" : "text-emerald-700")} aria-live="polite">
          {needCategories ? "Select at least one category to continue." : tErr ? "Enter a valid annual target to continue." : <span className="inline-flex items-center gap-1.5"><Check size={15} aria-hidden /> All set. You can change these later from your Learning Profile.</span>}
        </p>
        <button type="button" onClick={submit} disabled={!canContinue} className={cn(btnPrimary, "h-11 px-6")}>
          {saving ? <><Loader2 size={16} className="animate-spin" aria-hidden /> Saving…</> : <>{newYear ? `Save ${yearLabel} target` : "Continue to Learning"} <ArrowRight size={16} aria-hidden /></>}
        </button>
      </div>
      {error && <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</p>}
    </div>
  );
}

function InfoTile({ label, value, icon, sub }: { label: string; value: string; icon?: React.ReactNode; sub?: string }) {
  return (
    <div className="rounded-xl bg-neutral-50 px-3.5 py-3 ring-1 ring-inset ring-neutral-200/70">
      <dt className="flex items-center gap-1 text-xs text-slate-500">{icon}{label}</dt>
      <dd className="mt-0.5 font-semibold text-neutral-900">{value}</dd>
      {sub && <dd className="text-[11px] text-slate-400">{sub}</dd>}
    </div>
  );
}
