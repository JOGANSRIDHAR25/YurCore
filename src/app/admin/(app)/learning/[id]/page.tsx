"use client";

import { SITE_NAME } from "@/shared/config/site";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "react-hot-toast";
import { ArrowLeft, ArrowRight, BookOpen, CheckCircle2, Clock, ExternalLink, Eye, Info, Pencil, RefreshCw, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery } from "@/hooks/useQuery";
import { LEVEL_LABEL, formatDuration } from "@/shared/learning/content";
import { adminLearningApi } from "../_lib/api";
import { CourseBuilder } from "../_components/CourseBuilder";
import { CoursePreview } from "../_components/CoursePreview";
import { LearnersPanel } from "../_components/LearnersPanel";
import { PublishDialog, publishProblems } from "../_components/PublishDialog";
import { MoodleOriginBadge, MoodleSyncStatus, Spinner, StatusBadge, Stepper, ghostBtn, primaryBtn } from "../_components/ui";

const TABS = [["content", "Build content"], ["preview", "Preview"], ["learners", "Learners"]] as const;
type Tab = (typeof TABS)[number][0];

export default function CourseBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const tabParam = useSearchParams().get("tab");
  const tab: Tab = tabParam === "preview" || tabParam === "learners" ? tabParam : "content";
  const { data, loading, error, refetch } = useQuery(() => adminLearningApi.details(id), [id]);
  const [publishing, setPublishing] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Content changes are sent to Moodle in the background: refresh until that sync has finished.
  const busy = data?.course.moodleSync.busy ?? false;
  useEffect(() => {
    if (!busy) return;
    const t = setTimeout(refetch, 3000);
    return () => clearTimeout(t);
  }, [busy, data, refetch]);

  async function syncNow() {
    setSyncing(true);
    try {
      const c = await adminLearningApi.sync(id);
      if (c.moodleSync.error) toast.error(`Moodle sync finished with problems: ${c.moodleSync.error}`, { duration: 8000 });
      else toast.success(c.origin === "moodle" ? "Course re-imported from Moodle" : "Course content synced to Moodle");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The sync with Moodle failed. Please try again.");
    } finally {
      setSyncing(false);
      refetch();
    }
  }

  const go = (t: Tab) => router.replace(t === "content" ? `/admin/learning/${id}` : `/admin/learning/${id}?tab=${t}`, { scroll: false });

  if (loading && !data) return <div className="flex min-h-[60vh] items-center justify-center"><Spinner /></div>;
  if (error || !data) return <div className="p-10 text-center text-sm text-muted-foreground">{error ?? "Course not found"} <Link href="/admin/learning" className="font-semibold text-herb-green">Back</Link></div>;

  const { course, sections } = data;
  const published = course.status === "published";
  const ready = publishProblems(sections).length === 0;
  const meta = [course.category, course.level && LEVEL_LABEL[course.level], course.instructor && `By ${course.instructor.name}`].filter(Boolean).join(" · ");

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <Link href="/admin/learning" className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"><ArrowLeft size={14} /> {SITE_NAME} Learning</Link>

      {/* Course information */}
      <div className="rounded-2xl border border-border bg-white p-5">
        <div className="flex flex-col gap-5 md:flex-row md:items-center">
          {course.thumbnailUrl ? (
            <img src={course.thumbnailUrl} alt="" className="aspect-video w-full rounded-xl object-cover md:w-48" />
          ) : (
            <Link href={`/admin/learning/${id}/settings`} className="flex aspect-video w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-border text-xs font-semibold text-muted-foreground hover:border-herb-green/50 md:w-48"><BookOpen size={20} className="mb-1 text-herb-green/60" /> Add thumbnail</Link>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="font-display text-2xl font-bold text-foreground">{course.title}</h1>
              <StatusBadge status={course.status} />
            </div>
            {meta && <p className="mt-1 text-sm text-muted-foreground">{meta}</p>}
            <p className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
              <span>{course.counts.sections} sections · {course.counts.items} items</span>
              {course.durationMinutes ? <span className="flex items-center gap-1"><Clock size={12} /> {formatDuration(course.durationMinutes)}</span> : null}
              <span>{course.learners} learners</span>
            </p>
            {course.moodleStatus === "missing" ? (
              <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">The linked Moodle course (id {course.moodleCourseId}) no longer exists in Moodle. It was deleted there directly.</p>
            ) : course.moodleCourseId !== null && (
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                {course.origin === "moodle" && <MoodleOriginBadge />}
                <MoodleSyncStatus course={course} />
                <button onClick={syncNow} disabled={syncing || busy} className="inline-flex items-center gap-1 text-[11px] font-semibold text-herb-green hover:underline disabled:opacity-50">
                  <RefreshCw size={11} className={cn(syncing && "animate-spin")} /> {syncing ? "Syncing…" : "Sync now"}
                </button>
                {course.moodleUrl && <a href={course.moodleUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground"><ExternalLink size={11} /> Open in Moodle</a>}
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2 md:flex-col md:items-stretch lg:flex-row lg:items-center">
            <Link href={`/admin/learning/${id}/settings`} className={ghostBtn}><Pencil size={14} /> Edit details</Link>
            {!published && (
              <button onClick={() => { toast.success("Draft saved. Changes are saved as you work"); router.push("/admin/learning"); }} className={ghostBtn}><Save size={14} /> Save draft</button>
            )}
            <button onClick={() => go("preview")} className={ghostBtn}><Eye size={14} /> Preview</button>
            <button onClick={() => setPublishing(true)} className={published ? ghostBtn : primaryBtn}>{published ? "Unpublish" : "Publish course"}</button>
          </div>
        </div>
        <div className="mt-5 border-t border-border pt-4">
          <Stepper step={published ? 4 : tab === "preview" ? 3 : 2} done={[1, ...(ready ? [2] : []), ...(published ? [3, 4] : [])]} />
        </div>
      </div>

      <nav className="flex gap-1 border-b border-border" aria-label="Course builder">
        {TABS.map(([t, label]) => (
          <button key={t} onClick={() => go(t)} className={cn("-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors", tab === t ? "border-herb-green text-herb-green" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {label}
            {t === "learners" && course.learners > 0 && <span className="ml-1.5 rounded-full bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground">{course.learners}</span>}
          </button>
        ))}
      </nav>

      {tab === "learners" ? (
        <LearnersPanel courseId={id} />
      ) : tab === "preview" ? (
        <CoursePreview course={course} sections={sections} />
      ) : course.origin === "moodle" ? (
        <div className="space-y-4">
          <p className="flex items-start gap-2 rounded-xl bg-sky-50 px-4 py-3 text-sm text-sky-900">
            <Info size={16} className="mt-0.5 flex-shrink-0" />
            <span>
              This course was created in Moodle, so its content is edited in Moodle. Changes made there appear here automatically (or use <b>Sync now</b>). Practitioners see it here once it is visible in Moodle.
              {course.moodleUrl && <> <a href={course.moodleUrl} target="_blank" rel="noreferrer" className="font-semibold underline">Open in Moodle</a></>}
            </span>
          </p>
          <CoursePreview course={course} sections={sections} />
        </div>
      ) : (
        <CourseBuilder courseId={id} sections={sections} onChanged={refetch} />
      )}

      {/* Step navigation: Build content → Preview → Publish */}
      {tab !== "learners" && (
        <div className="sticky bottom-0 z-10 -mx-4 border-t border-border bg-background/95 px-4 py-4 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {tab === "content" ? (
              <>
                <p className="text-xs text-muted-foreground">{course.counts.items} {course.counts.items === 1 ? "item" : "items"} · Changes are saved automatically</p>
                <button onClick={() => { go("preview"); window.scrollTo({ top: 0, behavior: "smooth" }); }} className={primaryBtn}>Next: Preview <ArrowRight size={16} /></button>
              </>
            ) : (
              <>
                <button onClick={() => { go("content"); window.scrollTo({ top: 0, behavior: "smooth" }); }} className={ghostBtn}><ArrowLeft size={15} /> Back to Build content</button>
                {published ? (
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-herb-green"><CheckCircle2 size={16} /> Published: visible to all practitioners</span>
                    <Link href="/admin/learning" className={ghostBtn}>Done</Link>
                  </div>
                ) : (
                  <button onClick={() => setPublishing(true)} className={primaryBtn}>Publish course</button>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {publishing && <PublishDialog course={course} sections={sections} onClose={() => setPublishing(false)} onDone={() => { setPublishing(false); refetch(); }} />}
    </div>
  );
}
