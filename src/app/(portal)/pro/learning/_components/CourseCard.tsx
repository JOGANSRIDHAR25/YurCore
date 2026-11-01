"use client";

import Link from "next/link";
import { Award, BarChart3, CheckCircle2, Clock, GraduationCap, Layers, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { LEVEL_LABEL, formatDuration } from "@/shared/learning/content";
import { CREDIT_TYPE_LABEL, formatCredits } from "@/shared/learning/credits";
import { RatingInline } from "@/components/learning/CourseRating";
import type { LearnerCourseCard } from "../_lib/api";

const STATE_LABEL = { not_started: "Not started", in_progress: "In progress", completed: "Completed" } as const;
const STATE_STYLE = {
  not_started: "bg-neutral-100 text-slate-600",
  in_progress: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200/70",
  completed: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200/70",
} as const;
const CTA = { not_started: "Start course", in_progress: "Continue learning", completed: "Review course" } as const;

/**
 * Catalogue / recommendation card. Fixed-height rows (title, summary, rating) keep actions aligned across a row of
 * cards whatever the content length; every value shown comes from the course record.
 */
export function CourseCard({ course, className }: { course: LearnerCourseCard; className?: string }) {
  const href = `/pro/learning/courses/${course.id}`;
  const duration = formatDuration(course.durationMinutes);
  const state = course.state;
  return (
    <article
      className={cn(
        "group relative flex h-full flex-col overflow-hidden rounded-2xl border border-neutral-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-[box-shadow,border-color,transform] duration-200 ease-out",
        "hover:-translate-y-px hover:border-neutral-300/80 hover:shadow-[0_12px_28px_-14px_rgba(15,23,42,0.22)] focus-within:border-herb-green/40 focus-within:ring-[3px] focus-within:ring-herb-green/10",
        "motion-reduce:transition-none motion-reduce:hover:translate-y-0",
        className,
      )}
    >
      <Link href={href} tabIndex={-1} aria-hidden className="relative block aspect-[16/9] w-full overflow-hidden bg-neutral-100">
        {course.thumbnailUrl ? (
          <img src={course.thumbnailUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.015] motion-reduce:transition-none" />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-slate-50 to-slate-100 text-slate-400">
            <GraduationCap size={26} strokeWidth={1.5} />
            <span className="text-[11px] font-medium uppercase tracking-[0.08em]">No preview image</span>
          </div>
        )}
        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-neutral-900/[0.06]" />
        {course.matchesInterests && (
          <span className="absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-full bg-white/95 px-2 py-0.5 text-[11px] font-semibold text-herb-green shadow-sm ring-1 ring-black/5 backdrop-blur">
            <Sparkles size={11} aria-hidden /> In your interests
          </span>
        )}
      </Link>

      <div className="flex flex-1 flex-col px-5 pb-5 pt-4">
        <div className="flex min-h-[1.375rem] items-center justify-between gap-2">
          <p className="min-w-0 truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-copper">{course.category ?? ""}</p>
          <span className={cn("inline-flex flex-shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold leading-4", STATE_STYLE[state])}>
            {state === "completed" ? <CheckCircle2 size={12} aria-hidden /> : <span className={cn("h-1.5 w-1.5 rounded-full", state === "in_progress" ? "bg-amber-500" : "bg-slate-400")} aria-hidden />}
            {STATE_LABEL[state]}
          </span>
        </div>

        <h3 className="mt-2.5 line-clamp-2 min-h-[2.75rem] text-[15px] font-semibold leading-[1.375rem] tracking-[-0.005em] text-neutral-900" title={course.title}>
          <Link href={href} className="outline-none transition-colors hover:text-herb-green focus-visible:text-herb-green">
            {course.title}
          </Link>
        </h3>
        <p className={cn("mt-1.5 line-clamp-2 min-h-[2.5rem] text-[13px] leading-5", course.summary ? "text-slate-500" : "italic text-slate-400")}>
          {course.summary || "No description available."}
        </p>

        <RatingInline rating={course.rating} className="mt-3" />

        <ul className="mt-3 flex flex-wrap items-center gap-x-3.5 gap-y-1.5 border-t border-neutral-100 pt-3 text-xs text-slate-500" aria-label="Course details">
          {course.credits > 0 && (
            <li className="inline-flex items-center gap-1 rounded-md bg-copper/[0.08] px-1.5 py-0.5 font-semibold text-copper"><Award size={12} aria-hidden /> {formatCredits(course.credits)} {CREDIT_TYPE_LABEL[course.creditType]} {course.credits === 1 ? "credit" : "credits"}</li>
          )}
          {duration && (
            <li className="flex items-center gap-1.5"><Clock size={13} className="text-slate-400" aria-hidden /> {duration}</li>
          )}
          <li className="flex items-center gap-1.5"><Layers size={13} className="text-slate-400" aria-hidden /> {course.items ? `${course.items} ${course.items === 1 ? "item" : "items"}` : "No content yet"}</li>
          {course.level && (
            <li className="flex items-center gap-1.5"><BarChart3 size={13} className="text-slate-400" aria-hidden /> {LEVEL_LABEL[course.level]}</li>
          )}
        </ul>
        {course.instructorName && <p className="mt-2 truncate text-xs text-slate-500">By <span className="font-medium text-slate-700">{course.instructorName}</span></p>}

        <div className="mt-auto pt-4">
          {state === "in_progress" && course.progress && (
            <div className="mb-3.5">
              <div className="flex justify-between text-[11px] font-medium text-slate-500">
                <span>Progress</span>
                <span className="tabular-nums text-slate-700">{course.progress.completed}/{course.progress.total} · {course.progress.percent}%</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-neutral-100" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={course.progress.percent} aria-label={`${course.title} progress`}>
                <div className="h-full rounded-full bg-copper transition-[width] duration-300" style={{ width: `${course.progress.percent}%` }} />
              </div>
            </div>
          )}
          <Link
            href={href}
            className={cn(
              "flex h-10 items-center justify-center rounded-xl text-sm font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-herb-green/40 focus-visible:ring-offset-2",
              state === "completed" ? "border border-neutral-200 bg-white text-herb-green hover:border-herb-green/30 hover:bg-herb-green/[0.04]" : "bg-herb-green text-white shadow-[0_1px_2px_rgba(15,23,42,0.12)] hover:bg-herb-green/90",
            )}
            aria-label={`${CTA[state]}: ${course.title}`}
          >
            {CTA[state]}
          </Link>
        </div>
      </div>
    </article>
  );
}

export function CourseCardSkeleton() {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-neutral-200/80 bg-white" aria-hidden>
      <div className="aspect-[16/9] w-full animate-pulse bg-neutral-100 motion-reduce:animate-none" />
      <div className="flex flex-1 flex-col gap-3 px-5 pb-5 pt-4">
        <div className="flex justify-between"><div className="h-3 w-24 animate-pulse rounded bg-neutral-100" /><div className="h-4 w-16 animate-pulse rounded-full bg-neutral-100" /></div>
        <div className="h-4 w-4/5 animate-pulse rounded bg-neutral-100" />
        <div className="h-3 w-full animate-pulse rounded bg-neutral-100" />
        <div className="h-3 w-2/3 animate-pulse rounded bg-neutral-100" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-neutral-100" />
        <div className="mt-auto h-10 w-full animate-pulse rounded-xl bg-neutral-100" />
      </div>
    </div>
  );
}
