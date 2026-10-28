"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { GraduationCap } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/pro/learning", label: "All Courses", exact: true },
  { href: "/pro/learning/my-learning", label: "My Learning" },
  { href: "/pro/learning/completed", label: "Completed Courses" },
];

export function LearningHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  const pathname = usePathname().replace(/\/$/, "") || "/";
  return (
    <header className="mb-5">
      <div className="flex items-center gap-3.5">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[10px] bg-copper/[0.08] text-copper ring-1 ring-inset ring-copper/15" aria-hidden>
          <GraduationCap size={19} strokeWidth={1.75} />
        </div>
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold leading-7 tracking-[-0.015em] text-neutral-900">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm leading-6 text-slate-500">{subtitle}</p>}
        </div>
      </div>
      <nav aria-label="Learning sections" className="-mx-1 mt-6 overflow-x-auto px-1 pb-1">
        <ul className="inline-flex min-w-max items-center gap-0.5 rounded-[10px] border border-neutral-200/80 bg-white p-[3px] shadow-xs">
          {TABS.map((t) => {
            const active = t.exact ? pathname === t.href : pathname.startsWith(t.href);
            return (
              <li key={t.href}>
                <Link
                  href={t.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "block rounded-[7px] px-3.5 py-1.5 text-[13px] font-medium leading-5 whitespace-nowrap transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper/35",
                    active ? "bg-copper/10 text-copper" : "text-slate-500 hover:bg-neutral-50 hover:text-neutral-800",
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
