"use client";

import { SITE_NAME } from "@/shared/config/site";
import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { useQuery } from "@/hooks/useQuery";
import { LearningHeader } from "./LearningTabs";
import { CourseCard } from "./CourseCard";
import { learningApi, type Scope } from "../_lib/api";

const COPY: Record<Scope, { title: string; subtitle: string; empty: string }> = {
  all: { title: `${SITE_NAME} Learning`, subtitle: "Courses available to you.", empty: "No courses are available yet." },
  mine: { title: "My Learning", subtitle: "Courses you have started.", empty: "You have not started any course yet." },
  completed: { title: "Completed Courses", subtitle: "Courses you have finished.", empty: "No completed courses yet." },
};

export function CourseList({ scope }: { scope: Scope }) {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [category, setCategory] = useState("");
  const { data: categories } = useQuery(() => (scope === "all" ? learningApi.categories() : Promise.resolve([])), [scope]);
  const { data: courses, loading, error } = useQuery(() => learningApi.list(scope, debounced, category || undefined), [scope, debounced, category]);
  const copy = COPY[scope];

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <LearningHeader title={copy.title} subtitle={copy.subtitle} />
      {scope === "all" && (
        <div className="mb-6 flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search courses" className="w-full rounded-xl border border-border bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-copper focus:ring-2 focus:ring-copper/20" />
          </div>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none focus:border-copper">
            <option value="">All categories</option>
            {(categories ?? []).map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      )}
      {loading && !courses ? (
        <div className="flex justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-4 border-copper border-t-transparent" /></div>
      ) : error ? (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</p>
      ) : courses && courses.length > 0 ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{courses.map((c) => <CourseCard key={c.id} course={c} />)}</div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border py-16 text-center text-sm text-muted-foreground">{copy.empty}</div>
      )}
    </div>
  );
}
