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
  const pathname = usePathname();
  return (
    <div className="mb-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-copper/10 text-copper">
          <GraduationCap size={20} />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">{title}</h1>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      <nav className="mt-5 flex gap-1 border-b border-border/60">
        {TABS.map((t) => {
          const active = t.exact ? pathname === t.href : pathname.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={cn(
                "-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
                active ? "border-copper text-copper" : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
