"use client";

import { SITE_NAME } from "@/shared/config/site";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronUp, LayoutGrid, Loader2, RotateCw, Search, SlidersHorizontal, X } from "lucide-react";
import { useQuery } from "@/hooks/useQuery";
import type { LearningProfile } from "@/shared/learning/types";
import { CategoryFilter } from "./CategoryFilter";
import { LearningHeader } from "./LearningTabs";
import { CourseCard, CourseCardSkeleton } from "./CourseCard";
import { DEFAULT_FILTERS, FiltersDrawer, SORT_LABEL, type CourseFilters } from "./FiltersDrawer";
import { LearningSetup } from "./LearningSetup";
import { TargetSummaryCard } from "./TargetSummaryCard";
import { EditTargetDialog } from "./profile-ui";
import { RecommendedCourses } from "./RecommendedCourses";
import { LEARNING_PAGE_SIZE, learningApi, type LearnerCourseCard, type Scope } from "../_lib/api";

const HEADING: Record<Scope, string> = { all: "All Courses", mine: "In Progress", completed: "Completed Courses" };

const EMPTY: Record<Scope, string> = {
  all: "No courses are available yet.",
  mine: "No courses in progress. Completed courses are under Completed Courses.",
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

/**
 * The learner hub's entry: until the learner has chosen interests and confirmed this year's target, Learning
 * Setup is shown instead of the courses. Afterwards the saved profile drives the target summary, the
 * favorite-category filters and recommendations.
 */
export function CourseList({ scope, pageSize = LEARNING_PAGE_SIZE }: { scope: Scope; pageSize?: number }) {
  const { data: loaded, loading, error, refetch } = useQuery(() => learningApi.profile(), []);
  const [profile, setProfile] = useState<LearningProfile | null>(null);
  useEffect(() => {
    if (loaded) setProfile(loaded);
  }, [loaded]);

  if (!profile) {
    if (loading || !error) return <div className="flex justify-center py-32" aria-busy="true"><Loader2 className="h-7 w-7 animate-spin text-copper" aria-label="Loading" /></div>;
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center gap-3 px-4 py-24 text-center" role="alert">
        <p className="text-sm text-amber-800">{error}</p>
        <button type="button" onClick={refetch} className="inline-flex items-center gap-2 rounded-xl border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-100"><RotateCw size={14} aria-hidden /> Try again</button>
      </div>
    );
  }
  if (profile.needsSetup) {
    return <LearningSetup profile={profile} onSave={async (input) => { setProfile(await learningApi.saveSetup(input)); window.scrollTo({ top: 0 }); }} />;
  }
  return <Catalogue scope={scope} pageSize={pageSize} profile={profile} onProfile={setProfile} />;
}

function Catalogue({ scope, pageSize, profile, onProfile }: { scope: Scope; pageSize: number; profile: LearningProfile; onProfile: (p: LearningProfile) => void }) {
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<CourseFilters>(DEFAULT_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [editingTarget, setEditingTarget] = useState(false);
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
      const page = await learningApi.list(scope, { q: debounced, category, categoryIds: filters.categoryIds, sort: filters.sort, limit: pageSize, signal: ac.signal });
      if (gen !== generation.current) return;
      setList({ items: page.items, cursor: page.nextCursor, hasMore: page.hasMore, total: page.total, pages: 1, firstCursor: page.nextCursor, firstHasMore: page.hasMore });
      scrollRef.current?.scrollTo({ top: 0 });
    } catch (err) {
      if (gen !== generation.current || isAbort(err)) return;
      setFirstError(message(err));
    } finally {
      if (gen === generation.current) setFirstLoading(false);
    }
  }, [scope, debounced, category, filters, pageSize]);

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
      const page = await learningApi.list(scope, { q: debounced, category, categoryIds: filters.categoryIds, sort: filters.sort, cursor: list.cursor, limit: pageSize, signal });
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

  const favoriteFilters = profile.interests.filter((c) => filters.categoryIds.includes(c.id));
  const appliedCount = favoriteFilters.length + (filters.sort === "published" ? 0 : 1);
  const filtered = Boolean(debounced || category || favoriteFilters.length);
  const anyApplied = filtered || filters.sort !== "published";
  const clearFilters = () => {
    setQ("");
    setDebounced("");
    setCategory("");
    setFilters(DEFAULT_FILTERS);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <LearningHeader
        title={`${SITE_NAME} Learning`}
        subtitle="Discover courses, advance your clinical knowledge, and earn CME credits."
      />

      {profile.progress && (
        <div className="mb-6">
          <TargetSummaryCard progress={profile.progress} onEditTarget={() => setEditingTarget(true)} compact />
        </div>
      )}

      <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center" role="search" aria-label="Search and filter courses">
        <div className="relative min-w-0 flex-1">
          <Search size={17} strokeWidth={1.9} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
          <label htmlFor="course-search" className="sr-only">Search courses</label>
          <input
            id="course-search"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by course title, topic or category"
            maxLength={100}
            className="h-11 w-full rounded-xl border border-neutral-200 bg-white pl-10 pr-10 text-sm text-neutral-900 shadow-[0_1px_2px_rgba(15,23,42,0.04)] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-slate-400 hover:border-neutral-300 focus:border-herb-green/50 focus:ring-[3px] focus:ring-herb-green/10 [&::-webkit-search-cancel-button]:hidden"
          />
          {q && (
            <button type="button" onClick={() => { setQ(""); setDebounced(""); }} aria-label="Clear search" className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-herb-green/35">
              <X size={14} />
            </button>
          )}
        </div>
        <div className="flex gap-2.5 [&>div]:min-w-0 [&>div]:flex-1 sm:[&>div]:flex-none">
          <CategoryFilter value={category} options={categories ?? []} onChange={setCategory} />
          <button
            type="button"
            onClick={() => setFiltersOpen(true)}
            aria-haspopup="dialog"
            className={`inline-flex h-11 flex-shrink-0 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-medium shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-herb-green/10 ${appliedCount > 0 ? "border-herb-green/40 bg-herb-green/[0.03] text-herb-green hover:border-herb-green/60" : "border-neutral-200 bg-white text-neutral-800 hover:border-neutral-300 hover:bg-neutral-50"}`}
          >
            <SlidersHorizontal size={15} aria-hidden /> <span className="hidden sm:inline">Filters &amp; Sorting</span><span className="sm:hidden">Filters</span>
            {appliedCount > 0 && <span className="min-w-5 rounded-full bg-herb-green px-1.5 text-center text-[11px] font-semibold leading-5 text-white">{appliedCount}</span>}
          </button>
        </div>
      </div>

      {anyApplied && (
        <div className="mt-3 flex flex-wrap items-center gap-2" aria-label="Applied filters">
          {debounced && <Chip label={`Search: "${debounced}"`} onRemove={() => { setQ(""); setDebounced(""); }} removeLabel="Clear search" />}
          {category && <Chip label={category} onRemove={() => setCategory("")} removeLabel={`Remove ${category} category`} />}
          {filters.sort !== "published" && <Chip label={`Sort: ${SORT_LABEL[filters.sort]}`} onRemove={() => setFilters((f) => ({ ...f, sort: "published" }))} removeLabel="Remove sort" />}
          {favoriteFilters.map((c) => (
            <Chip key={c.id} label={c.name} onRemove={() => setFilters((f) => ({ ...f, categoryIds: f.categoryIds.filter((x) => x !== c.id) }))} removeLabel={`Remove ${c.name} filter`} />
          ))}
          <button type="button" onClick={clearFilters} className="ml-1 rounded-md px-1.5 py-1 text-xs font-semibold text-slate-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-herb-green/35">Clear all</button>
        </div>
      )}

      <div className="mt-8">{scope === "all" && !filtered && <RecommendedCourses hasInterests={profile.interests.length > 0} />}</div>

      <section aria-labelledby="catalogue-title" className="overflow-hidden rounded-2xl border border-neutral-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-neutral-200/70 px-4 py-3.5 sm:px-5">
        <h2 id="catalogue-title" className="flex items-center gap-2 text-lg font-semibold tracking-[-0.01em] text-neutral-900">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-copper/[0.08] text-copper" aria-hidden><LayoutGrid size={15} /></span>
          {HEADING[scope]}
        </h2>
        <p className="min-h-5 text-[13px] text-slate-500" aria-live="polite">
          {!firstLoading && !firstError && list.total !== null && list.total > 0 && (
            <>Showing {list.items.length} of {list.total} {list.total === 1 ? "course" : "courses"}{filtered ? " matching your filters" : ""}</>
          )}
        </p>
      </div>

      {firstLoading ? (
        <div className="grid gap-5 bg-slate-50/70 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-3 2xl:grid-cols-4" aria-busy="true" aria-label="Loading courses">
          {Array.from({ length: Math.min(pageSize, 6) }, (_, i) => <CourseCardSkeleton key={i} />)}
        </div>
      ) : firstError ? (
        <div className="m-4 flex flex-col items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-10 text-center sm:m-5" role="alert">
          <p className="text-sm text-amber-800">{firstError}</p>
          <button type="button" onClick={loadFirst} className="inline-flex items-center gap-2 rounded-xl border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-100">
            <RotateCw size={14} aria-hidden /> Try again
          </button>
        </div>
      ) : list.items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 bg-slate-50/70 px-4 py-16 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-slate-400 ring-1 ring-neutral-200" aria-hidden><Search size={18} /></span>
          <p className="text-sm font-semibold text-neutral-900">{filtered ? "No courses match your search" : EMPTY[scope]}</p>
          {filtered && (
            <>
              <p className="max-w-md text-sm text-slate-500">{favoriteFilters.length ? `No courses in ${favoriteFilters.map((c) => c.name).join(", ")} match yet. Try other categories or clear the filters.` : "Try a different search term or category."}</p>
              <button type="button" onClick={clearFilters} className="mt-1 rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm font-semibold text-herb-green transition-colors hover:border-herb-green/30 hover:bg-herb-green/[0.04]">Clear filters</button>
            </>
          )}
        </div>
      ) : (
        <div
          ref={scrollRef}
          tabIndex={0}
          aria-label="Course list"
          className="bg-slate-50/70 p-4 [scrollbar-color:var(--color-neutral-300)_transparent] [scrollbar-gutter:stable] [scrollbar-width:thin] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-herb-green/30 sm:p-5 md:max-h-[calc(100dvh-11rem)] md:overflow-y-auto"
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
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white px-6 text-sm font-semibold text-herb-green shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors hover:border-herb-green/30 hover:bg-herb-green/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-herb-green/40 focus-visible:ring-offset-2 aria-disabled:cursor-not-allowed aria-disabled:opacity-70 aria-disabled:hover:bg-white sm:w-auto sm:min-w-56"
                >
                  {moreLoading ? <><Loader2 size={16} className="animate-spin" aria-hidden /> Loading courses...</> : "Show More Courses"}
                </button>
                {moreError && (
                  <p className="text-sm text-amber-700" role="alert">{moreError} Use the button above to try again.</p>
                )}
              </>
            ) : list.pages > 1 ? (
              <>
                <p className="text-[13px] text-slate-500">You&apos;ve reached the end of the courses</p>
                <button
                  type="button"
                  onClick={showLess}
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white px-6 text-sm font-semibold text-neutral-800 transition-colors hover:border-neutral-300 hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-herb-green/40 focus-visible:ring-offset-2 sm:w-auto sm:min-w-56"
                >
                  <ChevronUp size={16} aria-hidden /> Show Less
                </button>
              </>
            ) : null}
          </div>
        </div>
      )}
      </section>
      {filtersOpen && (
        <FiltersDrawer
          value={filters}
          favorites={profile.interests}
          onClose={() => setFiltersOpen(false)}
          onApply={(f) => {
            setFilters(f);
            setFiltersOpen(false);
          }}
        />
      )}
      {editingTarget && <EditTargetDialog profile={profile} onClose={() => setEditingTarget(false)} onSave={async (t) => onProfile(await learningApi.updateTarget(t))} />}
    </div>
  );
}

function Chip({ label, onRemove, removeLabel }: { label: string; onRemove: () => void; removeLabel: string }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-herb-green/20 bg-herb-green/[0.06] py-1 pl-3 pr-1.5 text-xs font-medium text-herb-green">
      <span className="truncate">{label}</span>
      <button type="button" onClick={onRemove} aria-label={removeLabel} className="rounded-full p-0.5 transition-colors hover:bg-herb-green/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-herb-green/35"><X size={12} /></button>
    </span>
  );
}
