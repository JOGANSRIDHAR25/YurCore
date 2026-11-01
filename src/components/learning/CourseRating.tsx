"use client";

import { useId, useState } from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CourseRating } from "@/shared/learning/types";

const plural = (n: number) => `${n.toLocaleString("en-IN")} ${n === 1 ? "rating" : "ratings"}`;

/** Five stars filled to `value` (0–5), partial stars included. Decorative: callers give the text equivalent. */
export function Stars({ value, size = 14, className }: { value: number; size?: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-px", className)} aria-hidden>
      {Array.from({ length: 5 }, (_, i) => {
        const fill = Math.max(0, Math.min(1, value - i));
        return (
          <span key={i} className="relative inline-block" style={{ width: size, height: size }}>
            <Star size={size} strokeWidth={1.5} className="absolute inset-0 text-ayur-gold/45" />
            {fill > 0 && (
              <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
                <Star size={size} strokeWidth={1.5} className="text-ayur-gold" fill="currentColor" />
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}

/**
 * Compact rating for course cards: "★★★★☆ 4.6 (128 ratings)", or "No ratings yet". Renders nothing when the
 * rating could not be loaded (null), so a card never shows an invented value.
 */
export function RatingInline({ rating, className }: { rating: CourseRating | null | undefined; className?: string }) {
  if (!rating) return null;
  if (rating.average === null) {
    return (
      <p className={cn("flex h-5 items-center gap-1.5 text-xs text-slate-400", className)}>
        <Stars value={0} size={13} /> <span>No ratings yet</span>
      </p>
    );
  }
  return (
    <p className={cn("flex h-5 items-center gap-1.5 text-xs", className)} aria-label={`Rated ${rating.average} out of 5 from ${plural(rating.count)}`}>
      <Stars value={rating.average} size={13} />
      <span className="font-semibold tabular-nums text-neutral-900" aria-hidden>{rating.average.toFixed(1)}</span>
      <span className="text-slate-500 tabular-nums" aria-hidden>({plural(rating.count)})</span>
    </p>
  );
}

/**
 * Course page header: "★ 4.6 / 5 · 128 ratings". Hovering, focusing or tapping it opens the full breakdown
 * (average plus the 5→1 star distribution) in a popover; Escape or moving away closes it.
 */
export function RatingBadge({ rating, className }: { rating: CourseRating | null | undefined; className?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  if (!rating) return null;
  if (rating.average === null) {
    return <span className={cn("inline-flex items-center gap-1.5 text-sm text-slate-500", className)}><Star size={15} className="text-ayur-gold/60" aria-hidden /> No ratings yet</span>;
  }
  return (
    <span
      className={cn("relative inline-flex", className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false); }}
      onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={id}
        aria-label={`Rated ${rating.average} out of 5 from ${plural(rating.count)}. Show rating details`}
        className="inline-flex items-center gap-1.5 rounded-xl border border-ayur-gold/30 bg-ayur-gold/[0.07] px-3 py-2 text-sm transition-colors hover:border-ayur-gold/50 hover:bg-ayur-gold/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ayur-gold/40"
      >
        <Star size={16} className="text-ayur-gold" fill="currentColor" aria-hidden />
        <span className="font-semibold tabular-nums text-neutral-900">{rating.average.toFixed(1)}</span>
        <span className="text-slate-500">/ 5 · {plural(rating.count)}</span>
      </button>
      {/* pt-2 bridges the gap so the pointer can move from the badge into the popover without closing it */}
      <span id={id} role="dialog" aria-label="Learner ratings" className={cn("absolute left-0 top-full z-30 pt-2", open ? "block" : "hidden")}>
        <span className="block w-[min(21rem,calc(100vw-2.5rem))] rounded-2xl border border-neutral-200 bg-white p-4 shadow-[0_16px_40px_-12px_rgba(15,23,42,0.25)]">
          <span className="mb-3 block text-sm font-semibold text-neutral-900">Learner ratings</span>
          <RatingBreakdown rating={rating} />
        </span>
      </span>
    </span>
  );
}

/** The average with stars plus the 5→1 star distribution (shown in the rating popover). */
export function RatingBreakdown({ rating }: { rating: CourseRating }) {
  if (rating.average === null) return null;
  const max = Math.max(...rating.distribution, 1);
  return (
    <span className="flex items-center gap-4">
      <span className="flex flex-shrink-0 flex-col items-center justify-center rounded-xl bg-neutral-50 px-4 py-3 text-center">
        <span className="flex items-baseline gap-1 text-2xl font-semibold tabular-nums text-neutral-900">{rating.average.toFixed(1)} <Star size={17} className="text-ayur-gold" fill="currentColor" aria-hidden /></span>
        <span className="mt-0.5 text-xs text-slate-500">{plural(rating.count)}</span>
      </span>
      <span className="block flex-1 space-y-1.5" role="list" aria-label="Rating distribution">
        {[5, 4, 3, 2, 1].map((stars) => {
          const n = rating.distribution[stars - 1];
          return (
            <span key={stars} role="listitem" className="flex items-center gap-2 text-xs" aria-label={`${stars} star: ${plural(n)}`}>
              <span className="flex w-6 items-center gap-0.5 font-medium text-slate-600" aria-hidden>{stars} <Star size={10} className="text-ayur-gold" fill="currentColor" /></span>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-100" aria-hidden>
                <span className={cn("block h-full rounded-full", stars >= 3 ? "bg-emerald-500" : stars === 2 ? "bg-amber-400" : "bg-rose-400")} style={{ width: `${(n / max) * 100}%` }} />
              </span>
              <span className="w-6 text-right tabular-nums text-slate-500" aria-hidden>{n.toLocaleString("en-IN")}</span>
            </span>
          );
        })}
      </span>
    </span>
  );
}
