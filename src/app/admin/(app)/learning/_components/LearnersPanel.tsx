"use client";

import { SITE_NAME } from "@/shared/config/site";
import { Users } from "lucide-react";
import { useQuery } from "@/hooks/useQuery";
import { adminLearningApi } from "../_lib/api";
import { ProgressBar, Spinner } from "./ui";

const TH = "px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground";
const fmt = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

/** Practitioners who have started the course, with their progress. */
export function LearnersPanel({ courseId }: { courseId: string }) {
  const { data, loading, error } = useQuery(() => adminLearningApi.learners(courseId), [courseId]);
  if (loading) return <div className="flex justify-center py-16"><Spinner /></div>;
  if (error) return <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</p>;
  if (!data?.length) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-white py-16 text-center">
        <Users className="mx-auto text-muted-foreground/40" size={28} />
        <p className="mt-3 text-sm text-muted-foreground">No practitioner has started this course yet.</p>
        <p className="text-xs text-muted-foreground">Once published, every practitioner can open it from {SITE_NAME} Learning.</p>
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-white">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-background">
            <tr><th className={TH}>Learner</th><th className={TH}>Started</th><th className={TH + " min-w-48"}>Progress</th><th className={TH}>Completed</th></tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.map((l) => (
              <tr key={l.userId}>
                <td className="px-4 py-3"><p className="font-medium text-foreground">{l.name}</p><p className="text-xs text-muted-foreground">{l.email ?? ""}</p></td>
                <td className="px-4 py-3 text-xs text-foreground">{fmt(l.startedAt)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3"><ProgressBar value={l.progress.percent} className="flex-1" /><span className="w-24 text-right text-xs text-muted-foreground">{l.progress.completed}/{l.progress.total} · {l.progress.percent}%</span></div>
                </td>
                <td className="px-4 py-3 text-xs">{l.completedAt ? <span className="font-semibold text-herb-green">{fmt(l.completedAt)}</span> : <span className="text-muted-foreground">In progress</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
