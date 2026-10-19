"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Check, CloudDownload, Loader2, RefreshCw, X } from "lucide-react";
import type { AdminCourse } from "@/shared/learning/types";
import { cn } from "@/lib/utils";

export const inputCls = "w-full px-3.5 py-2.5 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-herb-green/20 focus:border-herb-green/50 bg-white placeholder:text-muted-foreground/60";
export const primaryBtn = "inline-flex items-center justify-center gap-1.5 bg-herb-green text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-herb-green/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed";
export const ghostBtn = "inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-white px-3.5 py-2 text-sm font-semibold text-foreground hover:bg-background transition-colors disabled:opacity-60 disabled:cursor-not-allowed";
export const dangerBtn = "inline-flex items-center justify-center gap-1.5 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 transition-colors disabled:opacity-60";
export const iconBtn = "inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-background hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

export function Field({ label, hint, required, children, className }: { label: string; hint?: string; required?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("block space-y-1.5", className)}>
      <span className="text-[13px] font-semibold text-foreground">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      {children}
      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

export function Card({ title, description, children, className, action }: { title?: string; description?: string; children: React.ReactNode; className?: string; action?: React.ReactNode }) {
  return (
    <section className={cn("rounded-2xl border border-border bg-white p-6", className)}>
      {(title || action) && (
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            {title && <h2 className="text-[15px] font-bold text-foreground">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

const SIZES = { md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" } as const;

export function Modal({ title, subtitle, onClose, children, size = "md", footer, busy }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode; size?: keyof typeof SIZES; footer?: React.ReactNode; busy?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, busy]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className={cn("flex max-h-[92vh] w-full flex-col rounded-2xl bg-white shadow-2xl", SIZES[size])}>
        <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
          <div className="min-w-0">
            <h2 className="font-display text-lg font-bold text-foreground">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          <button onClick={onClose} disabled={busy} aria-label="Close" className={iconBtn}><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-6 py-4">{footer}</div>}
      </div>
    </div>
  );
}

/** Confirmation for destructive actions. `onConfirm` may be async; the dialog stays open while it runs. */
export function ConfirmDialog({ title, message, confirmLabel = "Delete", onConfirm, onClose, tone = "danger" }: { title: string; message: React.ReactNode; confirmLabel?: string; onConfirm: () => Promise<void> | void; onClose: () => void; tone?: "danger" | "primary" }) {
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    try {
      await onConfirm();
      onClose();
    } catch {
      // The caller reported the error; stay open so the action can be retried.
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={title}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <button onClick={onClose} disabled={busy} className={ghostBtn}>Cancel</button>
          <button onClick={run} disabled={busy} className={tone === "danger" ? dangerBtn : primaryBtn}>{busy ? "Working…" : confirmLabel}</button>
        </>
      }
    >
      <div className="text-sm leading-relaxed text-foreground/80">{message}</div>
    </Modal>
  );
}

export function StatusBadge({ status }: { status: "draft" | "published" }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold", status === "published" ? "bg-herb-green/10 text-herb-green" : "bg-amber-50 text-amber-700")}>
      <span className={cn("h-1.5 w-1.5 rounded-full", status === "published" ? "bg-herb-green" : "bg-amber-500")} />
      {status === "published" ? "Published" : "Draft"}
    </span>
  );
}

/** Marks a course that was created in Moodle (imported; its content is edited in Moodle). */
export function MoodleOriginBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-700" title="Created in Moodle and imported. Edit its content in Moodle.">
      <CloudDownload size={12} /> From Moodle
    </span>
  );
}

function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
}

/** One line on where the course stands with Moodle: syncing, last synced, or what failed. */
export function MoodleSyncStatus({ course, className }: { course: AdminCourse; className?: string }) {
  if (course.moodleCourseId === null) return null;
  const { busy, error, syncedAt } = course.moodleSync;
  const verb = course.origin === "moodle" ? "Imported from Moodle" : "Synced to Moodle";
  if (busy) {
    return <span className={cn("inline-flex items-center gap-1 text-[11px] text-sky-700", className)}><Loader2 size={12} className="animate-spin" /> {course.origin === "moodle" ? "Importing from Moodle…" : "Syncing to Moodle…"}</span>;
  }
  if (error) {
    return <span className={cn("inline-flex items-start gap-1 text-[11px] text-amber-700", className)} title={error}><AlertTriangle size={12} className="mt-px flex-shrink-0" /> <span className="line-clamp-2">Moodle sync problem: {error}</span></span>;
  }
  if (syncedAt) return <span className={cn("inline-flex items-center gap-1 text-[11px] text-muted-foreground", className)}><Check size={12} className="text-herb-green" /> {verb} {ago(syncedAt)}</span>;
  return <span className={cn("inline-flex items-center gap-1 text-[11px] text-muted-foreground", className)}><RefreshCw size={11} /> Not synced with Moodle yet</span>;
}

export function Spinner({ className }: { className?: string }) {
  return <div className={cn("h-8 w-8 animate-spin rounded-full border-4 border-herb-green border-t-transparent", className)} />;
}

const STEPS = ["Basic information", "Build content", "Preview", "Publish"];

/** Where the admin is in the course creation workflow. Steps before `step` show as done. */
export function Stepper({ step, done }: { step: 1 | 2 | 3 | 4; done?: number[] }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-2">
      {STEPS.map((s, i) => {
        const n = i + 1;
        const complete = done ? done.includes(n) : n < step;
        const current = n === step;
        return (
          <li key={s} className="flex items-center gap-2">
            <span className={cn("flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold", complete ? "bg-herb-green text-white" : current ? "bg-herb-green/15 text-herb-green ring-1 ring-herb-green/40" : "bg-background text-muted-foreground ring-1 ring-border")}>
              {complete ? <Check size={13} strokeWidth={3} /> : n}
            </span>
            <span className={cn("text-xs font-semibold", current || complete ? "text-foreground" : "text-muted-foreground")}>{s}</span>
            {n < STEPS.length && <span className="mx-1 h-px w-6 bg-border sm:w-10" />}
          </li>
        );
      })}
    </ol>
  );
}

export function ProgressBar({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cn("h-1.5 overflow-hidden rounded-full bg-neutral-100", className)}>
      <div className="h-full rounded-full bg-herb-green transition-[width] duration-200" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}
