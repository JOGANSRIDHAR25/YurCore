"use client";

import Link from "next/link";
import { BarChart3, CheckCircle2, Clock, GraduationCap, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { LEVEL_LABEL, formatDuration } from "@/shared/learning/content";
import type { LearnerCourseCard } from "../_lib/api";

const STATE_LABEL = { not_started: "Not started", in_progress: "In progress", completed: "Completed" } as const;
const STATE_STYLE = {
  not_started: "border-border bg-white text-muted-foreground",
  in_progress: "border-amber-200 bg-amber-50 text-amber-700",
  completed: "border-copper/30 bg-copper/10 text-copper",
} as const;
const CTA = { not_started: "Start course", in_progress: "Continue", completed: "Review course" } as const;

export function CourseCard({ course }: { course: LearnerCourseCard }) {
  const href = `/pro/learning/courses/${course.id}`;
  const duration = formatDuration(course.durationMinutes);
  const state = course.state;
  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border/70 bg-white shadow-xs transition-shadow hover:shadow-md focus-within:ring-2 focus-within:ring-copper/30">
      <Link href={href} tabIndex={-1} aria-hidden className="relative block aspect-video w-full overflow-hidden bg-neutral-100">
        {course.thumbnailUrl ? (
          <img src={course.thumbnailUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 border-b border-border/60 bg-neutral-50 text-neutral-400">
            <GraduationCap size={28} strokeWidth={1.5} />
            <span className="text-[11px] font-medium uppercase tracking-wider">No preview image</span>
          </div>
        )}
      </Link>

      <div className="flex flex-1 flex-col p-5">
        <div className="flex min-h-[1.375rem] items-center justify-between gap-2">
          <p className="truncate text-[11px] font-semibold uppercase tracking-wider text-copper">{course.category ?? ""}</p>
          <span className={cn("inline-flex flex-shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold", STATE_STYLE[state])}>
            {state === "completed" && <CheckCircle2 size={12} aria-hidden />}
            {STATE_LABEL[state]}
          </span>
        </div>

        <h3 className="mt-2 line-clamp-2 min-h-[2.75rem] text-base font-semibold leading-snug text-foreground">
          <Link href={href} className="outline-none hover:text-copper focus-visible:text-copper">
            {course.title}
          </Link>
        </h3>
        <p className={cn("mt-1.5 line-clamp-2 min-h-[2.5rem] text-sm leading-5", course.summary ? "text-muted-foreground" : "italic text-muted-foreground/70")}>
          {course.summary || "No description available."}
        </p>

        <ul className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground" aria-label="Course details">
          {duration && (
            <li className="flex items-center gap-1.5"><Clock size={13} aria-hidden /> {duration}</li>
          )}
          <li className="flex items-center gap-1.5"><Layers size={13} aria-hidden /> {course.items ? `${course.items} ${course.items === 1 ? "item" : "items"}` : "No content yet"}</li>
          {course.level && (
            <li className="flex items-center gap-1.5"><BarChart3 size={13} aria-hidden /> {LEVEL_LABEL[course.level]}</li>
          )}
        </ul>
        {course.instructorName && <p className="mt-2 truncate text-xs text-foreground/70">By {course.instructorName}</p>}

        <div className="mt-auto pt-5">
          {state === "in_progress" && course.progress && (
            <div className="mb-4">
              <div className="flex justify-between text-xs font-medium text-muted-foreground">
                <span>Progress</span>
                <span className="tabular-nums">{course.progress.completed}/{course.progress.total} · {course.progress.percent}%</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-neutral-100" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={course.progress.percent} aria-label={`${course.title} progress`}>
                <div className="h-full rounded-full bg-copper transition-[width]" style={{ width: `${course.progress.percent}%` }} />
              </div>
            </div>
          )}
          <Link
            href={href}
            className={cn(
              "block rounded-xl px-4 py-2.5 text-center text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper/40 focus-visible:ring-offset-2",
              state === "completed" ? "border border-copper/40 text-copper hover:bg-copper/5" : "bg-copper text-white hover:bg-copper/90",
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
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-border/70 bg-white" aria-hidden>
      <div className="aspect-video w-full animate-pulse bg-neutral-100" />
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="h-3 w-24 animate-pulse rounded bg-neutral-100" />
        <div className="h-4 w-4/5 animate-pulse rounded bg-neutral-100" />
        <div className="h-3 w-full animate-pulse rounded bg-neutral-100" />
        <div className="h-3 w-2/3 animate-pulse rounded bg-neutral-100" />
        <div className="mt-auto h-10 w-full animate-pulse rounded-xl bg-neutral-100" />
      </div>
    </div>
  );
}
