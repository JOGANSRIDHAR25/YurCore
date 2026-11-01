"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, RotateCw, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery } from "@/hooks/useQuery";
import { CourseCard, CourseCardSkeleton } from "./CourseCard";
import { learningApi } from "../_lib/api";

/** One card per view on phones (with the next one peeking), two on tablets, three to four on desktop. */
const SLIDE = "w-[82%] flex-none snap-start sm:w-[calc((100%-1.25rem)/2)] lg:w-[calc((100%-2.5rem)/3)] 2xl:w-[calc((100%-3.75rem)/4)]";

/**
 * "Recommended for You": a horizontal carousel of courses ranked on the server (interests first, then courses that
 * best close the remaining credit gap, then newest; completed courses excluded). Scrolls with touch, trackpad,
 * shift+wheel, keyboard or the arrow buttons; vertical page scrolling passes straight through it.
 */
export function RecommendedCourses({ hasInterests }: { hasInterests: boolean }) {
  const { data, loading, error, refetch } = useQuery(() => learningApi.recommended(), []);
  const track = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });

  const measure = useCallback(() => {
    const el = track.current;
    if (!el) return;
    setEdges({ start: el.scrollLeft <= 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
  }, []);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [data, measure]);

  /** Moves by one view (whole cards, since every card snaps to the start). */
  const page = (dir: 1 | -1) => {
    const el = track.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: dir * el.clientWidth * 0.9, behavior: reduce ? "auto" : "smooth" });
  };

  const subtitle = hasInterests ? "Courses selected based on your interests and learning preferences." : "Courses that help you reach your annual learning target.";
  const count = data?.length ?? 0;

  return (
    <section aria-labelledby="recommended-title" aria-roledescription="carousel" className="mb-8 [contain:inline-size]">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id="recommended-title" className="flex items-center gap-2 text-lg font-semibold tracking-[-0.01em] text-neutral-900">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-herb-green/[0.08] text-herb-green" aria-hidden><Sparkles size={15} /></span>
            Recommended for You
          </h2>
          <p className="mt-1 text-[13px] text-slate-500 sm:pl-9">{subtitle}</p>
        </div>
        {count > 1 && (
          <div className="hidden flex-shrink-0 items-center gap-1.5 sm:flex">
            {(["prev", "next"] as const).map((k) => {
              const disabled = k === "prev" ? edges.start : edges.end;
              const Icon = k === "prev" ? ChevronLeft : ChevronRight;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => page(k === "prev" ? -1 : 1)}
                  disabled={disabled}
                  aria-controls="recommended-track"
                  aria-label={k === "prev" ? "Previous recommendations" : "Next recommendations"}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-700 shadow-xs transition-colors transition-colors duration-150 hover:border-herb-green/30 hover:text-herb-green focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-herb-green/15 disabled:cursor-default disabled:opacity-40 disabled:hover:border-neutral-200 disabled:hover:text-neutral-700"
                >
                  <Icon size={17} aria-hidden />
                </button>
              );
            })}
          </div>
        )}
      </div>

      {loading && !data ? (
        <div className="flex gap-5 overflow-hidden" aria-busy="true" aria-label="Loading recommendations">
          {Array.from({ length: 4 }, (_, i) => <div key={i} className={SLIDE}><CourseCardSkeleton /></div>)}
        </div>
      ) : error && !data ? (
        <div className="flex flex-col items-center gap-2.5 rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-8 text-center" role="alert">
          <p className="text-sm text-amber-800">Recommendations could not be loaded.</p>
          <button type="button" onClick={refetch} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100"><RotateCw size={13} aria-hidden /> Try again</button>
        </div>
      ) : count === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-200 bg-white/60 px-4 py-8 text-center">
          <p className="text-sm font-medium text-neutral-800">No recommendations right now</p>
          <p className="mt-1 text-sm text-slate-500">
            {hasInterests ? "You have completed every course we would suggest. New courses in your interests will appear here." : <>Choose your favourite categories in your <Link href="/pro/learning/profile" className="font-semibold text-copper hover:underline">Learning Profile</Link> to get personalised suggestions.</>}
          </p>
        </div>
      ) : (
        <div className="relative">
          <ul
            id="recommended-track"
            ref={track}
            onScroll={measure}
            tabIndex={0}
            aria-label={`${count} recommended ${count === 1 ? "course" : "courses"}. Scroll sideways for more.`}
            className="-mx-1 flex snap-x snap-mandatory scroll-px-1 gap-5 overflow-x-auto overflow-y-hidden overscroll-x-contain px-1 pb-3 pt-1 [scrollbar-color:var(--color-neutral-300)_transparent] [scrollbar-width:thin] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-herb-green/30 focus-visible:ring-offset-2 rounded-2xl"
          >
            {data!.map((c, i) => (
              <li key={c.id} className={SLIDE} aria-roledescription="slide" aria-label={`${i + 1} of ${count}`}>
                <CourseCard course={c} />
              </li>
            ))}
          </ul>
          {/* Edge fades hint that more cards are off-screen; purely decorative. */}
          <div className={cn("pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-background to-transparent transition-opacity", edges.start ? "opacity-0" : "opacity-100")} aria-hidden />
          <div className={cn("pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-background to-transparent transition-opacity", edges.end ? "opacity-0" : "opacity-100")} aria-hidden />
        </div>
      )}
    </section>
  );
}
