"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface SearchableSelectProps {
  options: string[];
  value: string[];
  onChange: (next: string[]) => void;
  multi?: boolean;
  placeholder?: string;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  hasError?: boolean;
  disabled?: boolean;
  emptyMessage?: string;
}

export function SearchableSelect({ options, value, onChange, multi = false, placeholder = "Select…", icon: Icon, hasError = false, disabled = false, emptyMessage = "No results found" }: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 10);
  }, [open]);

  const filtered = options.filter((o) => o.toLowerCase().includes(query.trim().toLowerCase()));

  function toggle(option: string) {
    if (multi) {
      onChange(value.includes(option) ? value.filter((v) => v !== option) : [...value, option]);
    } else {
      onChange([option]);
      setOpen(false);
      setQuery("");
    }
  }

  function removeChip(option: string, e: React.MouseEvent) {
    e.stopPropagation();
    onChange(value.filter((v) => v !== option));
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "w-full min-h-[46px] pl-10 pr-9 py-2.5 border rounded-xl text-sm bg-white text-left transition-all duration-200 focus:outline-none relative",
          hasError
            ? "border-red-300 focus:border-red-500 focus:ring-4 focus:ring-red-500/10"
            : "border-slate-200 hover:border-indigo-200 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
        )}
      >
        {Icon && <Icon size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-indigo-400 pointer-events-none" />}
        {value.length === 0 ? (
          <span className="text-slate-400">{placeholder}</span>
        ) : multi ? (
          <span className="flex flex-wrap gap-1.5">
            {value.map((v) => (
              <span
                key={v}
                className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 text-xs font-medium pl-2 pr-1 py-1 rounded-lg"
              >
                {v}
                <span
                  role="button"
                  onClick={(e) => removeChip(v, e)}
                  className="hover:bg-indigo-100 rounded p-0.5 cursor-pointer"
                >
                  <X size={11} />
                </span>
              </span>
            ))}
          </span>
        ) : (
          <span className="text-slate-800">{value[0]}</span>
        )}
        <ChevronDown
          size={15}
          className={cn(
            "absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 transition-transform duration-200",
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
        <div className="absolute z-20 mt-1.5 w-full rounded-xl border border-slate-200 bg-white shadow-lg shadow-slate-900/5 overflow-hidden">
          <div className="relative border-b border-slate-100 p-2">
            <Search size={14} className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              className="w-full pl-7 pr-2 py-1.5 text-sm rounded-lg bg-slate-50 focus:outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500/15 transition-all"
            />
          </div>
          <div className="max-h-52 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-3.5 py-2.5 text-xs text-slate-400">No matches found.</p>
            ) : (
              filtered.map((option) => {
                const selected = value.includes(option);
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => toggle(option)}
                    className={cn(
                      "w-full flex items-center justify-between gap-2 px-3.5 py-2 text-sm text-left hover:bg-indigo-50/70 transition-colors",
                      selected && "bg-indigo-50/50 text-indigo-700 font-medium"
                    )}
                  >
                    <span>{option}</span>
                    {selected && <Check size={14} className="text-indigo-600 flex-shrink-0" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}