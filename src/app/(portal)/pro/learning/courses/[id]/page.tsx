"use client";

import { SITE_NAME } from "@/shared/config/site";
import { use } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useQuery } from "@/hooks/useQuery";
import { CoursePlayer, type PlayerHandlers } from "@/components/learning/CoursePlayer";
import { learningApi } from "../../_lib/api";

export default function CourseDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, loading, error, refetch } = useQuery(() => learningApi.details(id), [id]);

  if (loading && !data) return <div className="flex justify-center py-32"><div className="h-8 w-8 animate-spin rounded-full border-4 border-copper border-t-transparent" /></div>;
  if (error || !data) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="text-sm text-muted-foreground">{error ?? "Course not found"}</p>
        <Link href="/pro/learning" className="mt-3 inline-block text-sm font-semibold text-copper">Back to {SITE_NAME} Learning</Link>
      </div>
    );
  }

  // Every action is recorded server-side, then progress is re-read so the page always shows stored state.
  const after = async <T,>(p: Promise<T>) => {
    const r = await p;
    refetch();
    return r;
  };
  const handlers: PlayerHandlers = {
    start: async () => { await after(learningApi.start(id)); },
    complete: async (itemId) => { await after(learningApi.complete(id, itemId)); },
    startAttempt: (itemId) => after(learningApi.startAttempt(id, itemId)),
    submitAttempt: (itemId, attemptId, answers) => after(learningApi.submitAttempt(id, itemId, attemptId, answers)),
    respond: async (itemId, input) => { await after(learningApi.respond(id, itemId, input)); },
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <Link href="/pro/learning" className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft size={14} /> All courses
      </Link>
      {data.sections.every((s) => s.items.length === 0) ? (
        <p className="rounded-2xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">This course has no content yet.</p>
      ) : (
        <CoursePlayer course={data.course} sections={data.sections} progress={data.progress} enrolled={data.course.enrolled} courseProgress={data.course.progress} handlers={handlers} />
      )}
    </div>
  );
}
