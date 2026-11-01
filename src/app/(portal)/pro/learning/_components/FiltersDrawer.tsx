"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowDownWideNarrow, Check, Heart, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LearningCategory } from "@/shared/learning/types";
import type { Sort } from "../_lib/api";

export type CourseFilters = { sort: Sort; categoryIds: string[] };
export const DEFAULT_FILTERS: CourseFilters = { sort: "published", categoryIds: [] };

const SORTS: { value: Exclude<Sort, "published">; label: string; hint: string }[] = [
  { value: "newest", label: "Newest to Oldest", hint: "Most recently created courses first" },
  { value: "oldest", label: "Oldest to Newest", hint: "Earliest created courses first" },
];
export const SORT_LABEL: Record<Sort, string> = { published: "Default", newest: "Newest to Oldest", oldest: "Oldest to Newest" };

type Section = "sort" | "categories";

/**
 * Filters & Sorting: a two-column panel (sections on the left, options on the right). Choices are drafts until
 * Apply; Reset clears the draft back to the default listing. A right-side drawer on desktop, a bottom sheet on phones.
 */
export function FiltersDrawer({ value, favorites, onApply, onClose }: { value: CourseFilters; favorites: LearningCategory[]; onApply: (f: CourseFilters) => void; onClose: () => void }) {
  const [draft, setDraft] = useState<CourseFilters>(value);
  const [section, setSection] = useState<Section>("sort");
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    panel.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const nav: { key: Section; label: string; icon: typeof Heart; count: number }[] = [
    { key: "sort", label: "Sort", icon: ArrowDownWideNarrow, count: draft.sort === "published" ? 0 : 1 },
    { key: "categories", label: "Favourite Categories", icon: Heart, count: draft.categoryIds.length },
  ];
  const toggle = (id: string) => setDraft((d) => ({ ...d, categoryIds: d.categoryIds.includes(id) ? d.categoryIds.filter((x) => x !== id) : [...d.categoryIds, id] }));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end bg-neutral-900/40 sm:items-stretch" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="filters-title" className="flex max-h-[88dvh] w-full flex-col rounded-t-2xl bg-white shadow-2xl outline-none sm:max-h-none sm:w-[34rem] sm:rounded-none sm:rounded-l-2xl">
        <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-4">
          <h2 id="filters-title" className="text-base font-semibold text-neutral-900">Filters &amp; Sorting</h2>
          <button type="button" onClick={onClose} aria-label="Close filters" className="rounded-lg p-1.5 text-slate-400 hover:bg-neutral-100 hover:text-neutral-700"><X size={18} /></button>
        </div>

        <div className="flex min-h-0 flex-1">
          <nav aria-label="Filter sections" className="w-36 flex-shrink-0 border-r border-neutral-100 bg-neutral-50/70 py-2 sm:w-44">
            {nav.map((n) => (
              <button
                key={n.key}
                type="button"
                onClick={() => setSection(n.key)}
                aria-current={section === n.key ? "true" : undefined}
                className={cn(
                  "relative flex w-full items-start gap-2 px-4 py-3.5 text-left text-[13px] font-medium leading-5 transition-colors",
                  section === n.key ? "bg-white text-copper before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-r before:bg-copper" : "text-slate-600 hover:text-neutral-900",
                )}
              >
                <n.icon size={15} className="mt-0.5 flex-shrink-0" aria-hidden />
                <span className="min-w-0 flex-1">{n.label}</span>
                {n.count > 0 && <span className="rounded-full bg-copper px-1.5 text-[10px] font-semibold leading-4 text-white">{n.count}</span>}
              </button>
            ))}
          </nav>

          <div className="min-w-0 flex-1 overflow-y-auto p-5">
            {section === "sort" ? (
              <fieldset>
                <legend className="mb-3 text-sm font-semibold text-neutral-900">Sort by</legend>
                <div className="space-y-2" role="radiogroup">
                  {SORTS.map((o) => {
                    const on = draft.sort === o.value;
                    return (
                      <button key={o.value} type="button" role="radio" aria-checked={on} onClick={() => setDraft((d) => ({ ...d, sort: on ? "published" : o.value }))}
                        className={cn("flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition-colors", on ? "border-copper bg-copper/[0.06]" : "border-neutral-200 hover:bg-neutral-50")}>
                        <span className={cn("mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border", on ? "border-copper" : "border-neutral-300")}>{on && <span className="h-2 w-2 rounded-full bg-copper" />}</span>
                        <span><span className="block text-sm font-medium text-neutral-900">{o.label}</span><span className="block text-xs text-slate-500">{o.hint}</span></span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            ) : (
              <fieldset>
                <legend className="mb-1 text-sm font-semibold text-neutral-900">Your favourite categories</legend>
                <p className="mb-3 text-xs text-slate-500">Show courses in any of the selected categories.</p>
                {favorites.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-neutral-200 px-4 py-6 text-center text-sm text-slate-500">
                    You have not chosen any favourite categories. <Link href="/pro/learning/profile" className="font-semibold text-copper hover:underline">Edit favourites</Link>
                  </p>
                ) : (
                  <div className="space-y-2">
                    {favorites.map((c) => {
                      const on = draft.categoryIds.includes(c.id);
                      return (
                        <button key={c.id} type="button" role="checkbox" aria-checked={on} onClick={() => toggle(c.id)}
                          className={cn("flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm font-medium transition-colors", on ? "border-copper bg-copper/[0.06] text-neutral-900" : "border-neutral-200 text-neutral-700 hover:bg-neutral-50")}>
                          <span className={cn("flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border", on ? "border-copper bg-copper text-white" : "border-neutral-300")}>{on && <Check size={11} strokeWidth={3} />}</span>
                          {c.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </fieldset>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-neutral-100 px-5 py-3.5">
          <button type="button" onClick={() => onApply(DEFAULT_FILTERS)} className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-neutral-100 hover:text-neutral-900">Reset</button>
          <button type="button" onClick={() => onApply(draft)} className="rounded-xl bg-copper px-6 py-2.5 text-sm font-semibold text-white hover:bg-copper/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper/40 focus-visible:ring-offset-2">Apply</button>
        </div>
      </div>
    </div>
  );
}
