"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCredits } from "@/shared/learning/credits";
import type { LearningCategory, LearningProfile, TargetSummary } from "@/shared/learning/types";

/** Small building blocks shared by the Learning Setup, target summary and Learning Profile screens. */

export const STATUS_META = {
  target_met: { label: "Target met", cls: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  on_track: { label: "On track", cls: "border-neutral-200 bg-white text-neutral-700" },
  behind: { label: "Behind", cls: "border-amber-200 bg-amber-50 text-amber-800" },
} as const;

/** `exceeded` turns "Target met" into "Target exceeded" when completed credits are above the target. */
export function StatusBadge({ status, exceeded, className }: { status: TargetSummary["status"]; exceeded?: boolean; className?: string }) {
  const m = STATUS_META[status];
  return <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold", m.cls, className)}>{status === "target_met" && exceeded ? "Target exceeded" : m.label}</span>;
}

/** Circular progress (capped at 100% for display; the real total is shown as text). */
export function ProgressRing({ percent, size = 92, stroke = 8, status }: { percent: number; size?: number; stroke?: number; status: TargetSummary["status"] }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const shown = Math.min(100, Math.max(0, percent));
  const color = status === "target_met" ? "stroke-emerald-500" : status === "behind" ? "stroke-amber-500" : "stroke-copper";
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }} role="img" aria-label={`${Math.round(percent)}% of target`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-neutral-100" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round" className={cn("transition-[stroke-dashoffset] duration-500", color)} strokeDasharray={c} strokeDashoffset={c - (shown / 100) * c} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-lg font-semibold tabular-nums text-neutral-900">{Math.round(percent)}%</span>
    </div>
  );
}

export function Dialog({ title, subtitle, onClose, children, footer, busy }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; busy?: boolean }) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    ref.current?.querySelector<HTMLElement>("input, button, [tabindex]")?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, busy]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-neutral-900/40 p-0 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={id} className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-neutral-100 px-5 py-4">
          <div>
            <h2 id={id} className="text-base font-semibold text-neutral-900">{title}</h2>
            {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="rounded-lg p-1.5 text-slate-400 hover:bg-neutral-100 hover:text-neutral-700 disabled:opacity-50"><X size={18} /></button>
        </div>
        <div className="overflow-y-auto px-5 py-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-neutral-100 bg-neutral-50/60 px-5 py-3.5">{footer}</div>}
      </div>
    </div>
  );
}

export const btnPrimary = "inline-flex items-center justify-center gap-2 rounded-xl bg-herb-green px-5 py-2.5 text-sm font-semibold text-white shadow-[0_1px_2px_rgba(15,23,42,0.12)] transition-colors duration-150 hover:bg-herb-green/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-herb-green/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";
export const btnSecondary = "inline-flex items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-800 transition-colors hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper/35 disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Favourite-category multi-select: no upper limit (a learner may pick every category). Chips toggle freely and
 * keep their order; the count below reflects the actual selection.
 */
export function CategoryPicker({ categories, value, onChange }: { categories: LearningCategory[]; value: string[]; onChange: (ids: string[]) => void }) {
  const all = categories.length > 0 && categories.every((c) => value.includes(c.id));
  const n = value.length;
  const action = "rounded-md px-1.5 py-0.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-herb-green/35";
  return (
    <div>
      <ul className="flex flex-wrap gap-2.5" role="group" aria-label="Learning categories">
        {categories.map((c) => {
          const on = value.includes(c.id);
          return (
            <li key={c.id} className="max-w-full">
              <button
                type="button"
                aria-pressed={on}
                onClick={() => onChange(on ? value.filter((v) => v !== c.id) : [...value, c.id])}
                className={cn(
                  "group inline-flex min-h-10 max-w-full items-center gap-2 rounded-xl border py-2 pl-2.5 pr-3.5 text-left text-sm font-medium leading-5 transition-[background-color,border-color,color,box-shadow] duration-150 ease-out focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-herb-green/15 motion-reduce:transition-none",
                  on
                    ? "border-herb-green/50 bg-herb-green/[0.06] text-herb-green shadow-[0_1px_2px_rgba(15,23,42,0.06)]"
                    : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300 hover:bg-neutral-50",
                )}
              >
                <span
                  className={cn(
                    "flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-md border transition-colors duration-150",
                    on ? "border-herb-green bg-herb-green text-white" : "border-neutral-300 bg-white text-transparent group-hover:border-neutral-400",
                  )}
                  aria-hidden
                >
                  <Check size={12} strokeWidth={3} />
                </span>
                <span className="min-w-0 break-words">{c.name}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-neutral-100 pt-3">
        <p className="text-[13px] text-slate-500" aria-live="polite">
          {n === 0 ? "No categories selected yet" : all ? <><span className="font-semibold text-herb-green">All {n} categories</span> selected</> : <><span className="font-semibold tabular-nums text-herb-green">{n}</span> {n === 1 ? "category" : "categories"} selected</>}
        </p>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => onChange(categories.map((c) => c.id))} disabled={all} className={cn(action, "text-herb-green hover:bg-herb-green/[0.06] disabled:cursor-default disabled:text-slate-300 disabled:hover:bg-transparent")}>Select all</button>
          <span className="text-slate-300" aria-hidden>·</span>
          <button type="button" onClick={() => onChange([])} disabled={n === 0} className={cn(action, "text-slate-500 hover:bg-neutral-100 hover:text-neutral-800 disabled:cursor-default disabled:text-slate-300 disabled:hover:bg-transparent")}>Clear</button>
        </div>
      </div>
    </div>
  );
}

/** Target number input with the minimum enforced in the UI (and again on the server). */
export function TargetInput({ value, onChange, min, unit, id }: { value: string; onChange: (v: string) => void; min: number; unit: string; id?: string }) {
  return (
    <div className="flex items-center gap-3">
      <input
        id={id}
        type="number"
        inputMode="decimal"
        min={min}
        step="any"
        max={9999}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-12 w-28 rounded-xl border border-neutral-200 bg-white px-4 text-lg font-semibold tabular-nums text-neutral-900 shadow-[0_1px_2px_rgba(15,23,42,0.04)] outline-none transition-[border-color,box-shadow] duration-150 hover:border-neutral-300 focus:border-herb-green/50 focus:ring-[3px] focus:ring-herb-green/10"
      />
      <span className="text-sm font-medium leading-5 text-slate-600">{unit}<br className="hidden sm:inline" /> per year</span>
    </div>
  );
}

export function targetError(raw: string, min: number, unit: string): string | null {
  if (raw.trim() === "") return "Enter your annual target";
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return "The target must be a number greater than 0";
  if (Math.round(n * 10) !== n * 10) return "Use at most one decimal place";
  if (n < min) return `The target cannot be lower than the minimum of ${formatCredits(min)} ${unit}`;
  if (n > 9999) return "The target is too large";
  return null;
}

export function EditTargetDialog({ profile, onClose, onSave }: { profile: LearningProfile; onClose: () => void; onSave: (target: number) => Promise<void> }) {
  const s = profile.settings;
  const [value, setValue] = useState(String(profile.savedTarget ?? s.defaultTarget));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const invalid = targetError(value, s.minimumTarget, s.creditUnit);
  async function save() {
    if (invalid) return setError(invalid);
    setBusy(true);
    setError(null);
    try {
      await onSave(Number(value));
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your target");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title="Edit annual target"
      subtitle={profile.progress ? `Credit year ${profile.progress.creditYearLabel}. Earlier years are not changed.` : undefined}
      onClose={onClose}
      busy={busy}
      footer={<><button type="button" onClick={onClose} disabled={busy} className={btnSecondary}>Cancel</button><button type="button" onClick={save} disabled={busy} className={btnPrimary}>{busy && <Loader2 size={15} className="animate-spin" />} Save target</button></>}
    >
      <label htmlFor="edit-target" className="mb-2 block text-sm font-semibold text-neutral-900">Annual target</label>
      <TargetInput id="edit-target" value={value} onChange={(v) => { setValue(v); setError(null); }} min={s.minimumTarget} unit={s.creditUnit} />
      <p className="mt-2 text-xs text-slate-500">Default {formatCredits(s.defaultTarget)} · minimum {formatCredits(s.minimumTarget)} {s.creditUnit}. You can raise your target; it cannot go below the minimum.</p>
      {error && <p className="mt-3 text-sm font-medium text-red-600" role="alert">{error}</p>}
    </Dialog>
  );
}

export function EditInterestsDialog({ profile, onClose, onSave }: { profile: LearningProfile; onClose: () => void; onSave: (ids: string[]) => Promise<void> }) {
  const [value, setValue] = useState(profile.interests.map((c) => c.id));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    if (profile.categories.length > 0 && value.length === 0) return setError("Choose at least one category");
    setBusy(true);
    setError(null);
    try {
      await onSave(value);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your interests");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title="Edit favourite categories"
      subtitle="Choose all the learning areas you are interested in. Recommendations and new-course emails follow your favourites."
      onClose={onClose}
      busy={busy}
      footer={<><button type="button" onClick={onClose} disabled={busy} className={btnSecondary}>Cancel</button><button type="button" onClick={save} disabled={busy || value.length === 0} className={btnPrimary}>{busy && <Loader2 size={15} className="animate-spin" />} Save categories</button></>}
    >
      <CategoryPicker categories={profile.categories} value={value} onChange={(v) => { setValue(v); setError(null); }} />
      {error && <p className="mt-3 text-sm font-medium text-red-600" role="alert">{error}</p>}
    </Dialog>
  );
}
