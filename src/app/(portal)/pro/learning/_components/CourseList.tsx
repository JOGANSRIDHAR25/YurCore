"use client";

import { SITE_NAME } from "@/shared/config/site";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronUp, Loader2, RotateCw, Search, X } from "lucide-react";
import { useQuery } from "@/hooks/useQuery";
import { CategoryFilter } from "./CategoryFilter";
import { LearningHeader } from "./LearningTabs";
import { CourseCard, CourseCardSkeleton } from "./CourseCard";
import { LEARNING_PAGE_SIZE, learningApi, type LearnerCourseCard, type Scope } from "../_lib/api";

const EMPTY: Record<Scope, string> = {
  all: "No courses are available yet.",
  mine: "You have not started any course yet.",
  completed: "No completed courses yet.",
};

type ListState = {
  items: LearnerCourseCard[];
  cursor: string | null;
  hasMore: boolean;
  total: number | null;
  pages: number;
  /** where the first batch ended, so "Show less" can collapse back to it without refetching */
  firstCursor: string | null;
  firstHasMore: boolean;
};
const INITIAL: ListState = { items: [], cursor: null, hasMore: false, total: null, pages: 0, firstCursor: null, firstHasMore: false };

const isAbort = (err: unknown) => err instanceof DOMException && err.name === "AbortError";
const message = (err: unknown) => (err instanceof Error && err.message ? err.message : "Could not load courses. Please try again.");

export function CourseList({ scope, pageSize = LEARNING_PAGE_SIZE }: { scope: Scope; pageSize?: number }) {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [category, setCategory] = useState("");
  const { data: categories } = useQuery(() => learningApi.categories(), []);

  const [list, setList] = useState<ListState>(INITIAL);
  const [firstLoading, setFirstLoading] = useState(true);
  const [firstError, setFirstError] = useState<string | null>(null);
  const [moreLoading, setMoreLoading] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);

  // Every filter change starts a new "generation": older responses are aborted and ignored, so a slow
  // earlier search can never overwrite or append to the current results.
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const moreInFlight = useRef(false);
  /** The course grid scrolls inside this panel, so the tabs, search and filters above stay in view. */
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const loadFirst = useCallback(async () => {
    const gen = ++generation.current;
    controller.current?.abort();
    const ac = new AbortController();
    controller.current = ac;
    moreInFlight.current = false;
    setMoreLoading(false);
    setMoreError(null);
    setFirstError(null);
    setFirstLoading(true);
    setList(INITIAL);
    try {
      const page = await learningApi.list(scope, { q: debounced, category, limit: pageSize, signal: ac.signal });
      if (gen !== generation.current) return;
      setList({ items: page.items, cursor: page.nextCursor, hasMore: page.hasMore, total: page.total, pages: 1, firstCursor: page.nextCursor, firstHasMore: page.hasMore });
      scrollRef.current?.scrollTo({ top: 0 });
    } catch (err) {
      if (gen !== generation.current || isAbort(err)) return;
      setFirstError(message(err));
    } finally {
      if (gen === generation.current) setFirstLoading(false);
    }
  }, [scope, debounced, category, pageSize]);

  useEffect(() => {
    loadFirst();
    return () => controller.current?.abort();
  }, [loadFirst]);

  async function loadMore() {
    if (moreInFlight.current || !list.hasMore || !list.cursor) return; // ignores rapid repeat clicks
    moreInFlight.current = true;
    const gen = generation.current;
    const signal = controller.current?.signal;
    setMoreLoading(true);
    setMoreError(null);
    try {
      const page = await learningApi.list(scope, { q: debounced, category, cursor: list.cursor, limit: pageSize, signal });
      if (gen !== generation.current) return;
      setList((prev) => {
        const seen = new Set(prev.items.map((c) => c.id));
        return { ...prev, items: [...prev.items, ...page.items.filter((c) => !seen.has(c.id))], cursor: page.nextCursor, hasMore: page.hasMore, pages: prev.pages + 1 };
      });
    } catch (err) {
      if (gen !== generation.current || isAbort(err)) return;
      setMoreError(message(err));
    } finally {
      if (gen === generation.current) {
        moreInFlight.current = false;
        setMoreLoading(false);
      }
    }
  }

  /** Collapses back to the first batch (already loaded, so no request) and returns to the top of the list. */
  function showLess() {
    if (moreInFlight.current) return;
    setMoreError(null);
    setList((prev) => ({ ...prev, items: prev.items.slice(0, pageSize), cursor: prev.firstCursor, hasMore: prev.firstHasMore, pages: 1 }));
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }

  const filtered = Boolean(debounced || category);
  const clearFilters = () => {
    setQ("");
    setDebounced("");
    setCategory("");
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <LearningHeader title={`${SITE_NAME} Learning`} subtitle="Discover courses and continue your learning journey." />

      <div className="mb-5 flex flex-col gap-2.5 sm:flex-row sm:items-center" role="search">
        <div className="relative min-w-0 flex-1">
          <Search size={15} strokeWidth={2} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search courses"
            aria-label="Search courses"
            maxLength={100}
            className="h-10 w-full rounded-[10px] border border-neutral-200 bg-white pl-10 pr-10 text-sm text-neutral-900 shadow-xs outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-slate-400 hover:border-neutral-300 focus:border-copper/60 focus:ring-[3px] focus:ring-copper/15 [&::-webkit-search-cancel-button]:hidden"
          />
          {q && (
            <button type="button" onClick={() => { setQ(""); setDebounced(""); }} aria-label="Clear search" className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper/35">
              <X size={14} />
            </button>
          )}
        </div>
        <CategoryFilter value={category} options={categories ?? []} onChange={setCategory} />
      </div>

      <p className="mb-4 min-h-5 text-sm text-muted-foreground" aria-live="polite">
        {!firstLoading && !firstError && list.total !== null && list.total > 0 && (
          <>Showing {list.items.length} of {list.total} {list.total === 1 ? "course" : "courses"}{filtered ? " matching your filters" : ""}</>
        )}
      </p>

      {firstLoading ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4" aria-busy="true" aria-label="Loading courses">
          {Array.from({ length: Math.min(pageSize, 6) }, (_, i) => <CourseCardSkeleton key={i} />)}
        </div>
      ) : firstError ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-10 text-center" role="alert">
          <p className="text-sm text-amber-800">{firstError}</p>
          <button type="button" onClick={loadFirst} className="inline-flex items-center gap-2 rounded-xl border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-100">
            <RotateCw size={14} aria-hidden /> Try again
          </button>
        </div>
      ) : list.items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border px-4 py-16 text-center">
          <p className="text-sm font-medium text-foreground">{filtered ? "No courses match your search" : EMPTY[scope]}</p>
          {filtered && (
            <>
              <p className="text-sm text-muted-foreground">Try a different search term or category.</p>
              <button type="button" onClick={clearFilters} className="rounded-xl border border-copper/40 px-4 py-2 text-sm font-semibold text-copper hover:bg-copper/5">Clear filters</button>
            </>
          )}
        </div>
      ) : (
        <div
          ref={scrollRef}
          tabIndex={0}
          aria-label="Course list"
          className="max-h-[calc(100dvh-17rem)] min-h-[24rem] overflow-y-auto overscroll-contain rounded-2xl border border-border/60 bg-neutral-50/60 p-3 [scrollbar-gutter:stable] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper/30 sm:p-4"
        >
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {list.items.map((c) => <li key={c.id}><CourseCard course={c} /></li>)}
          </ul>

          <div className="mt-8 mb-2 flex flex-col items-center gap-3">
            {list.hasMore ? (
              <>
                <button
                  type="button"
                  onClick={loadMore}
                  // aria-disabled (not disabled) keeps keyboard focus on the button while the batch loads; loadMore ignores clicks meanwhile
                  aria-disabled={moreLoading}
                  aria-busy={moreLoading}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-copper/50 bg-white px-6 py-3 text-sm font-semibold text-copper transition-colors hover:border-copper hover:bg-copper/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper/40 focus-visible:ring-offset-2 aria-disabled:cursor-not-allowed aria-disabled:opacity-70 aria-disabled:hover:bg-white sm:w-auto sm:min-w-56"
                >
                  {moreLoading ? <><Loader2 size={16} className="animate-spin" aria-hidden /> Loading courses...</> : "Show More Courses"}
                </button>
                {moreError && (
                  <p className="text-sm text-amber-700" role="alert">{moreError} Use the button above to try again.</p>
                )}
              </>
            ) : list.pages > 1 ? (
              <>
                <p className="text-sm text-muted-foreground">You&apos;ve reached the end of the courses</p>
                <button
                  type="button"
                  onClick={showLess}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-white px-6 py-3 text-sm font-semibold text-foreground transition-colors hover:border-copper/50 hover:text-copper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper/40 focus-visible:ring-offset-2 sm:w-auto sm:min-w-56"
                >
                  <ChevronUp size={16} aria-hidden /> Show Less
                </button>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
