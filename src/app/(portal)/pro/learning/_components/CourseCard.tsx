"use client";

import Link from "next/link";
import { BarChart3, Clock, Layers, PlayCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { LEVEL_LABEL, formatDuration } from "@/shared/learning/content";
import type { LearnerCourse } from "../_lib/api";

const STATE_LABEL = { not_started: "Not started", in_progress: "In progress", completed: "Completed" } as const;
const STATE_STYLE = { not_started: "bg-neutral-100 text-neutral-600", in_progress: "bg-amber-50 text-amber-700", completed: "bg-herb-green/15 text-herb-green" } as const;

export function CourseCard({ course }: { course: LearnerCourse }) {
  const href = `/pro/learning/courses/${course.id}`;
  const cta = course.state === "completed" ? "Review" : course.enrolled ? "Continue" : "Start course";
  const duration = formatDuration(course.durationMinutes);
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-white shadow-xs transition-shadow hover:shadow-md">
      <Link href={href} className="block">
        {course.thumbnailUrl ? (
          <img src={course.thumbnailUrl} alt="" loading="lazy" className="aspect-video w-full object-cover" />
        ) : (
          <div className="flex aspect-video w-full items-center justify-center bg-gradient-to-br from-copper/15 via-copper/5 to-herb-green/10"><PlayCircle size={32} className="text-copper/40" /></div>
        )}
      </Link>
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-2">
          <p className="truncate text-[10px] font-bold uppercase tracking-wider text-copper">{course.category ?? ""}</p>
          <span className={cn("flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold", STATE_STYLE[course.state])}>{STATE_LABEL[course.state]}</span>
        </div>
        <Link href={href} className="mt-1.5 block">
          <h3 className="line-clamp-2 font-display text-base font-bold leading-snug text-foreground hover:text-copper">{course.title}</h3>
          <p className="mt-1.5 line-clamp-2 min-h-[2.5rem] text-xs text-muted-foreground">{course.shortDescription || course.description || "No description yet."}</p>
        </Link>
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {duration && <span className="flex items-center gap-1"><Clock size={12} /> {duration}</span>}
          <span className="flex items-center gap-1"><Layers size={12} /> {course.counts.items} {course.counts.items === 1 ? "item" : "items"}</span>
          {course.level && <span className="flex items-center gap-1"><BarChart3 size={12} /> {LEVEL_LABEL[course.level]}</span>}
        </div>
        {course.instructor && <p className="mt-2 truncate text-xs text-foreground/70">By {course.instructor.name}</p>}

        {course.progress && (
          <div className="mt-3">
            <div className="flex justify-between text-[10px] font-semibold text-muted-foreground"><span>Progress</span><span>{course.progress.percent}%</span></div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-neutral-100"><div className="h-full bg-herb-green" style={{ width: `${course.progress.percent}%` }} /></div>
          </div>
        )}
        <Link href={href} className="mt-auto block pt-4">
          <span className="block rounded-xl bg-copper px-4 py-2 text-center text-sm font-semibold text-white hover:opacity-90">{cta}</span>
        </Link>
      </div>
    </div>
  );
}
