"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const ALL = "";

/**
 * Category dropdown for the learning catalogue. A styled listbox instead of a native <select>, whose
 * open menu is drawn by the operating system and cannot match the page. Keyboard: arrows, Home/End,
 * Enter/Space to choose, Escape to close, and typing a letter jumps to the next matching category.
 */
export function CategoryFilter({ value, options, onChange }: { value: string; options: string[]; onChange: (next: string) => void }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const id = useId();
  const items = [ALL, ...options];
  const label = (v: string) => (v === ALL ? "All categories" : v);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  useEffect(() => {
    if (open) listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  function openList() {
    setActive(Math.max(items.indexOf(value), 0));
    setOpen(true);
  }

  function choose(i: number) {
    onChange(items[i]);
    setOpen(false);
    buttonRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        openList();
      }
      return;
    }
    const last = items.length - 1;
    if (e.key === "ArrowDown") setActive((a) => Math.min(a + 1, last));
    else if (e.key === "ArrowUp") setActive((a) => Math.max(a - 1, 0));
    else if (e.key === "Home") setActive(0);
    else if (e.key === "End") setActive(last);
    else if (e.key === "Enter" || e.key === " ") choose(active);
    else if (e.key === "Escape") {
      setOpen(false);
      buttonRef.current?.focus();
    } else if (e.key === "Tab") {
      setOpen(false);
      return;
    } else if (e.key.length === 1 && /\S/.test(e.key)) {
      const k = e.key.toLowerCase();
      const next = items.findIndex((v, i) => i > active && label(v).toLowerCase().startsWith(k));
      const found = next >= 0 ? next : items.findIndex((v) => label(v).toLowerCase().startsWith(k));
      if (found >= 0) setActive(found);
    } else return;
    e.preventDefault();
  }

  return (
    <div ref={rootRef} className="relative w-full sm:w-52 sm:flex-shrink-0" onKeyDown={onKeyDown}>
      <button
        ref={buttonRef}
        type="button"
        role="combobox"
        aria-label="Filter by category"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-activedescendant={open ? `${id}-opt-${active}` : undefined}
        onClick={() => (open ? setOpen(false) : openList())}
        className={cn(
          "flex h-10 w-full items-center justify-between gap-2 rounded-[10px] border bg-white pl-3.5 pr-3 text-left text-sm shadow-xs outline-none transition-[border-color,box-shadow] duration-150",
          open ? "border-copper/60 ring-[3px] ring-copper/15" : "border-neutral-200 hover:border-neutral-300 focus-visible:border-copper/60 focus-visible:ring-[3px] focus-visible:ring-copper/15",
        )}
      >
        <span className={cn("truncate", value === ALL ? "text-neutral-700" : "font-medium text-neutral-900")}>{label(value)}</span>
        <ChevronDown size={15} className={cn("flex-shrink-0 text-slate-400 transition-transform duration-150", open && "rotate-180")} aria-hidden />
      </button>

      {open && (
        <ul
          ref={listRef}
          id={`${id}-list`}
          role="listbox"
          aria-label="Categories"
          className="absolute right-0 z-30 mt-1.5 max-h-72 w-full min-w-[13rem] overflow-y-auto rounded-xl border border-neutral-200 bg-white p-1 shadow-lg shadow-neutral-900/[0.06]"
        >
          {items.map((v, i) => {
            const selected = v === value;
            return (
              <li
                key={v || "__all"}
                id={`${id}-opt-${i}`}
                data-index={i}
                role="option"
                aria-selected={selected}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(i)}
                className={cn(
                  "flex cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors",
                  i === active ? "bg-neutral-100/80" : "",
                  selected ? "font-medium text-copper" : "text-neutral-700",
                )}
              >
                <span className="truncate">{label(v)}</span>
                {selected && <Check size={14} className="flex-shrink-0 text-copper" aria-hidden />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
