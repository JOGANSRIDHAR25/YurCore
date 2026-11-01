"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { GraduationCap } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/pro/learning", label: "All Courses", exact: true },
  { href: "/pro/learning/my-learning", label: "My Learning" },
  { href: "/pro/learning/completed", label: "Completed Courses" },
  { href: "/pro/learning/certificates", label: "Certificates" },
  { href: "/pro/learning/profile", label: "Learning Profile" },
];

export function LearningHeader({ title, subtitle, aside }: { title: string; subtitle?: string; aside?: ReactNode }) {
  const pathname = usePathname().replace(/\/$/, "") || "/";
  return (
    <header className="mb-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-center gap-3.5">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-herb-green/[0.08] text-herb-green ring-1 ring-inset ring-herb-green/15" aria-hidden>
            <GraduationCap size={21} strokeWidth={1.75} />
          </div>
          <div className="min-w-0">
            <h1 className="text-[26px] font-semibold leading-8 tracking-[-0.02em] text-neutral-900">{title}</h1>
            {subtitle && <p className="mt-0.5 text-sm leading-6 text-slate-500">{subtitle}</p>}
          </div>
        </div>
        {aside && <div className="min-w-0 xl:w-[34rem] xl:flex-shrink-0">{aside}</div>}
      </div>
      {/* contain:inline-size keeps the tab list's width from stretching the page on phones; it scrolls instead */}
      <nav aria-label="Learning sections" className="-mx-1 mt-6 overflow-x-auto px-1 pb-1 [contain:inline-size] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <ul className="inline-flex min-w-max items-center gap-0.5 rounded-xl border border-neutral-200/80 bg-white p-1 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          {TABS.map((t) => {
            const active = t.exact ? pathname === t.href : pathname.startsWith(t.href);
            return (
              <li key={t.href}>
                <Link
                  href={t.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "block rounded-lg px-3.5 py-1.5 text-[13px] font-medium leading-5 whitespace-nowrap transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-herb-green/35",
                    active ? "bg-herb-green text-white shadow-[0_1px_2px_rgba(15,23,42,0.15)]" : "text-slate-600 hover:bg-neutral-100/80 hover:text-neutral-900",
                  )}
                >
                  {t.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </header>
  );
}
