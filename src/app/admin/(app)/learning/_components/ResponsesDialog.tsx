"use client";

import { Star } from "lucide-react";
import { useQuery } from "@/hooks/useQuery";
import { adminLearningApi, type ContentItem } from "../_lib/api";
import { Modal, Spinner } from "./ui";

/** Assignment submissions / feedback answers for one item. */
export function ResponsesDialog({ courseId, item, onClose }: { courseId: string; item: ContentItem; onClose: () => void }) {
  const { data, loading, error } = useQuery(() => adminLearningApi.responses(courseId, item.id), [courseId, item.id]);
  const rated = (data ?? []).filter((r) => r.rating);
  const avg = rated.length ? rated.reduce((n, r) => n + (r.rating ?? 0), 0) / rated.length : null;
  return (
    <Modal title={item.type === "assignment" ? "Submissions" : "Feedback"} subtitle={item.title} onClose={onClose} size="lg">
      {loading ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : error ? (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</p>
      ) : !data?.length ? (
        <p className="py-10 text-center text-sm text-muted-foreground">No {item.type === "assignment" ? "submissions" : "feedback"} yet.</p>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {data.length} {data.length === 1 ? "response" : "responses"}
            {avg !== null && <> · Average rating {avg.toFixed(1)} / 5</>}
          </p>
          {data.map((r) => (
            <div key={r.userId} className="rounded-2xl border border-border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">{r.name}</p>
                <p className="text-xs text-muted-foreground">{new Date(r.submittedAt).toLocaleString()}</p>
              </div>
              {r.rating && (
                <p className="mt-1 flex items-center gap-0.5 text-amber-500">
                  {Array.from({ length: 5 }, (_, i) => <Star key={i} size={14} fill={i < r.rating! ? "currentColor" : "none"} />)}
                </p>
              )}
              {r.text && <p className="mt-2 whitespace-pre-line text-sm text-foreground/80">{r.text}</p>}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
