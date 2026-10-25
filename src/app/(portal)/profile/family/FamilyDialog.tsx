"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface FamilyDialogProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  /** Blocks closing while a request is in flight. */
  busy?: boolean;
  footer: React.ReactNode;
  children: React.ReactNode;
  size?: "sm" | "md";
}

/**
 * Centred dialog for the Family Profiles page: Escape or the backdrop closes it,
 * focus moves into it on open and returns to the opener on close, and the page
 * behind does not scroll. On phones it sits at the bottom, full width.
 */
export function FamilyDialog({ title, subtitle, onClose, busy = false, footer, children, size = "md" }: FamilyDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    (panel?.querySelector<HTMLElement>("[data-autofocus]") ?? panel)?.focus();

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
      opener?.focus?.();
    };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
      // Keep Tab inside the dialog.
      if (e.key === "Tab" && panelRef.current) {
        const items = panelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
        );
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="family-dialog-title"
        tabIndex={-1}
        className={cn(
          "flex w-full max-h-[92vh] flex-col bg-white shadow-xl outline-none rounded-t-2xl sm:rounded-2xl",
          size === "sm" ? "sm:max-w-md" : "sm:max-w-xl"
        )}
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-slate-100">
          <div className="min-w-0">
            <h2 id="family-dialog-title" className="text-base font-semibold text-slate-900">
              {title}
            </h2>
            {subtitle && <p className="text-[13px] text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            className="p-1.5 -mr-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-herb-green/30"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100 bg-slate-50/60 sm:rounded-b-2xl">
          {footer}
        </div>
      </div>
    </div>
  );
}
