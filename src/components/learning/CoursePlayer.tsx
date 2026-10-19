"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import { ArrowLeft, ArrowRight, BarChart3, CalendarClock, Check, CheckCircle2, Circle, Clock, Download, ExternalLink, Layers, ListTree, PlayCircle, Star, Target, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { LEVEL_LABEL, formatBytes, formatDuration, isFileType } from "@/shared/learning/content";
import type { AttemptResult, AttemptStart, ContentItem, CourseSummary, ItemProgress, Progress, Section } from "@/shared/learning/types";
import { CONTENT_META } from "./content-meta";
import { QuizRunner } from "./QuizRunner";

export type PlayerHandlers = {
  start: () => Promise<void>;
  complete: (itemId: string) => Promise<void>;
  startAttempt: (itemId: string) => Promise<AttemptStart>;
  submitAttempt: (itemId: string, attemptId: string, answers: Record<string, string>) => Promise<AttemptResult>;
  respond: (itemId: string, input: { text: string; rating: number | null }) => Promise<void>;
};

type Props = {
  course: CourseSummary;
  sections: Section[];
  progress: Record<string, ItemProgress>;
  enrolled: boolean;
  courseProgress: Progress | null;
  handlers: PlayerHandlers;
};

const initials = (name: string) => name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

function Paragraphs({ text, className }: { text: string; className?: string }) {
  return (
    <div className={cn("space-y-3 text-[15px] leading-relaxed text-foreground/85", className)}>
      {text.split(/\n{2,}/).map((p, i) => <p key={i} className="whitespace-pre-line">{p}</p>)}
    </div>
  );
}

function FileCard({ item }: { item: ContentItem }) {
  const f = item.file!;
  const ext = f.name.includes(".") ? f.name.split(".").pop()!.toUpperCase() : "FILE";
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-neutral-50/60 p-4">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-xs font-bold text-muted-foreground ring-1 ring-border">{ext}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">{f.name}</p>
        <p className="text-xs text-muted-foreground">{ext} · {formatBytes(f.size)}</p>
      </div>
      {f.url && (
        <a href={f.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-white px-3.5 py-2 text-sm font-semibold text-foreground hover:bg-neutral-50">
          {f.mimeType === "application/pdf" ? <ExternalLink size={15} /> : <Download size={15} />} {f.mimeType === "application/pdf" ? "Open" : "Download"}
        </a>
      )}
    </div>
  );
}

function ResponseForm({ item, progress, onSubmit }: { item: ContentItem; progress: ItemProgress | undefined; onSubmit: (input: { text: string; rating: number | null }) => Promise<void> }) {
  const existing = progress?.response ?? null;
  const [editing, setEditing] = useState(!existing);
  const [text, setText] = useState(existing?.text ?? "");
  const [rating, setRating] = useState<number | null>(existing?.rating ?? null);
  const [busy, setBusy] = useState(false);
  const askRating = item.type === "feedback" && item.settings.rating;

  async function send() {
    if (!text.trim() && !(askRating && rating)) return toast.error(item.type === "assignment" ? "Write your submission first" : "Add a rating or a comment");
    setBusy(true);
    try {
      await onSubmit({ text: text.trim(), rating: askRating ? rating : null });
      setEditing(false);
      toast.success(item.type === "assignment" ? "Submission saved" : "Thank you for your feedback");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not submit");
    } finally {
      setBusy(false);
    }
  }

  if (existing && !editing) {
    return (
      <div className="rounded-xl border border-herb-green/30 bg-herb-green/5 p-4">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-herb-green"><CheckCircle2 size={16} /> {item.type === "assignment" ? "Submitted" : "Feedback sent"} · {new Date(existing.submittedAt).toLocaleString()}</p>
        {existing.rating && <p className="mt-2 flex gap-0.5 text-amber-500">{Array.from({ length: 5 }, (_, i) => <Star key={i} size={16} fill={i < existing.rating! ? "currentColor" : "none"} />)}</p>}
        {existing.text && <p className="mt-2 whitespace-pre-line text-sm text-foreground/80">{existing.text}</p>}
        <button onClick={() => setEditing(true)} className="mt-3 text-xs font-semibold text-copper hover:underline">Edit {item.type === "assignment" ? "submission" : "feedback"}</button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {askRating && (
        <div>
          <p className="mb-1.5 text-sm font-semibold text-foreground">Your rating</p>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" onClick={() => setRating(n)} aria-label={`${n} out of 5`} className="text-amber-500 transition-transform hover:scale-110">
                <Star size={26} fill={rating && n <= rating ? "currentColor" : "none"} />
              </button>
            ))}
          </div>
        </div>
      )}
      <textarea rows={item.type === "assignment" ? 8 : 4} value={text} onChange={(e) => setText(e.target.value)} placeholder={item.type === "assignment" ? "Write your answer here" : "Share your thoughts (optional)"} className="w-full rounded-xl border border-border bg-white px-3.5 py-3 text-sm outline-none focus:border-copper focus:ring-2 focus:ring-copper/15" />
      <div className="flex justify-end gap-2">
        {existing && <button onClick={() => setEditing(false)} className="rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-neutral-50">Cancel</button>}
        <button onClick={send} disabled={busy} className="rounded-xl bg-copper px-5 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">{busy ? "Sending…" : item.type === "assignment" ? "Submit assignment" : "Send feedback"}</button>
      </div>
    </div>
  );
}

/**
 * The learner's course page: overview, outline and the selected item. Used for real learners and,
 * with local handlers, as the admin preview, so the preview matches what learners get.
 */
/** Course outline: sections with their items and completion ticks. Used beside the overview and in the learning drawer. */
function Outline({ sections, progress, selected, onOpen }: { sections: Section[]; progress: Record<string, ItemProgress>; selected: string | null; onOpen: (id: string | null) => void }) {
  return (
    <>
      <button onClick={() => onOpen(null)} className={cn("mb-2 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold", selected === null ? "bg-copper/10 text-copper" : "text-foreground hover:bg-neutral-50")}>Course overview</button>
      {sections.map((s, si) => (
        <div key={s.id} className="mt-3">
          <p className="px-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Section {si + 1}</p>
          <p className="px-3 text-sm font-semibold text-foreground">{s.title}</p>
          <ul className="mt-1.5 space-y-0.5">
            {s.items.map((item) => {
              const done = progress[item.id]?.completed;
              const Icon = CONTENT_META[item.type].icon;
              return (
                <li key={item.id}>
                  <button onClick={() => onOpen(item.id)} aria-current={selected === item.id ? "step" : undefined} className={cn("flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13px]", selected === item.id ? "bg-copper/10 font-semibold text-copper" : "text-foreground/80 hover:bg-neutral-50")}>
                    {done ? <CheckCircle2 size={15} className="flex-shrink-0 text-herb-green" /> : <Circle size={15} className="flex-shrink-0 text-neutral-300" />}
                    <span className="min-w-0 flex-1 truncate">{item.title}</span>
                    <Icon size={13} className="flex-shrink-0 text-muted-foreground" />
                  </button>
                </li>
              );
            })}
            {s.items.length === 0 && <li className="px-3 py-1 text-xs text-muted-foreground">No content yet</li>}
          </ul>
        </div>
      ))}
    </>
  );
}

/**
 * The learner's course page. Two modes: the overview (header, outline, description) and, once the
 * learner starts or opens an item, a focused learning view where the item gets the full column and
 * the outline is a slide-over. Used for real learners and, with local handlers, as the admin preview.
 */
export function CoursePlayer({ course, sections, progress, enrolled, courseProgress, handlers }: Props) {
  const flat = useMemo(() => sections.flatMap((s, si) => s.items.map((item) => ({ item, section: s, sectionIndex: si }))), [sections]);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [contentsOpen, setContentsOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  const index = flat.findIndex((f) => f.item.id === selected);
  const current = index >= 0 ? flat[index] : null;
  const firstOpen = flat.find((f) => !progress[f.item.id]?.completed) ?? flat[0];

  useEffect(() => {
    if (selected && index < 0) setSelected(null); // item removed
  }, [selected, index]);

  useEffect(() => {
    if (!contentsOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setContentsOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [contentsOpen]);

  async function open(id: string | null) {
    if (id && !enrolled) {
      try {
        await handlers.start();
      } catch (err) {
        return toast.error(err instanceof Error ? err.message : "Could not start the course");
      }
    }
    setSelected(id);
    setContentsOpen(false);
    requestAnimationFrame(() => root.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  async function complete(id: string, quiet = false) {
    if (progress[id]?.completed) return;
    setBusy(true);
    try {
      await handlers.complete(id);
      if (!quiet) toast.success("Marked as complete");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update progress");
    } finally {
      setBusy(false);
    }
  }

  const next = index >= 0 && index < flat.length - 1 ? flat[index + 1] : null;
  const prev = index > 0 ? flat[index - 1] : null;

  // ---------- Learning view: the item gets the whole column ----------
  if (current) {
    return (
      <div ref={root} className="scroll-mt-4 space-y-4">
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border/60 bg-white px-4 py-3 shadow-xs">
          <button onClick={() => open(null)} className="inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-sm font-semibold text-foreground hover:bg-neutral-50"><ArrowLeft size={15} /> Overview</button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-foreground">{course.title}</p>
            <p className="text-xs text-muted-foreground">Item {index + 1} of {flat.length}</p>
          </div>
          {courseProgress && (
            <div className="hidden w-44 sm:block">
              <div className="flex justify-between text-[11px] font-semibold text-muted-foreground"><span>Progress</span><span>{courseProgress.percent}%</span></div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-neutral-100"><div className="h-full rounded-full bg-herb-green transition-[width]" style={{ width: `${courseProgress.percent}%` }} /></div>
            </div>
          )}
          <button onClick={() => setContentsOpen(true)} className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3.5 py-2 text-sm font-semibold text-foreground hover:bg-neutral-50"><ListTree size={15} /> Contents</button>
        </div>

        <div className="min-w-0 rounded-2xl border border-border/60 bg-white p-5 shadow-xs sm:p-8 lg:p-10">
          <ItemView key={current.item.id} entry={current} progress={progress[current.item.id]} busy={busy} onComplete={(quiet) => complete(current.item.id, quiet)} handlers={handlers} onNext={next ? () => open(next.item.id) : undefined} />
          <div className="mt-8 flex items-center justify-between gap-3 border-t border-border pt-5">
            <button onClick={() => open(prev ? prev.item.id : null)} className="inline-flex items-center gap-1.5 rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-neutral-50"><ArrowLeft size={15} /> {prev ? "Previous" : "Overview"}</button>
            <span className="hidden text-xs text-muted-foreground sm:inline">{index + 1} of {flat.length}</span>
            {next ? (
              <button onClick={() => open(next.item.id)} className="inline-flex items-center gap-1.5 rounded-xl bg-copper px-4 py-2 text-sm font-semibold text-white hover:opacity-90">Next <ArrowRight size={15} /></button>
            ) : (
              <button onClick={() => open(null)} className="inline-flex items-center gap-1.5 rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-neutral-50">Finish</button>
            )}
          </div>
        </div>

        {contentsOpen && (
          <div className="fixed inset-0 z-50 flex bg-black/30" onMouseDown={(e) => e.target === e.currentTarget && setContentsOpen(false)}>
            <nav aria-label="Course content" className="flex h-full w-80 max-w-[85vw] flex-col bg-white shadow-2xl">
              <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-foreground">Course contents</p>
                  {courseProgress && <p className="text-xs text-muted-foreground">{courseProgress.completed}/{courseProgress.total} complete</p>}
                </div>
                <button onClick={() => setContentsOpen(false)} aria-label="Close contents" className="rounded-lg p-1.5 text-muted-foreground hover:bg-neutral-50"><X size={18} /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-3"><Outline sections={sections} progress={progress} selected={selected} onOpen={open} /></div>
            </nav>
          </div>
        )}
      </div>
    );
  }

  // ---------- Overview ----------
  const meta = [
    course.durationMinutes ? { icon: Clock, text: formatDuration(course.durationMinutes)! } : null,
    { icon: Layers, text: `${sections.length} ${sections.length === 1 ? "section" : "sections"} · ${flat.length} ${flat.length === 1 ? "item" : "items"}` },
    course.level ? { icon: BarChart3, text: LEVEL_LABEL[course.level] } : null,
  ].filter(Boolean) as { icon: typeof Clock; text: string }[];

  return (
    <div ref={root} className="scroll-mt-4 space-y-6">
      <div className="overflow-hidden rounded-2xl border border-border/60 bg-white shadow-xs">
        <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
          <div className="order-2 flex flex-col p-6 md:order-1 md:p-8">
            {course.category && <p className="text-[11px] font-bold uppercase tracking-wider text-copper">{course.category}</p>}
            <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-foreground md:text-3xl">{course.title}</h1>
            {course.shortDescription && <p className="mt-2 text-sm text-foreground/75">{course.shortDescription}</p>}
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
              {meta.map(({ icon: I, text }) => <span key={text} className="flex items-center gap-1.5"><I size={13} /> {text}</span>)}
            </div>
            {course.instructor && (
              <div className="mt-4 flex items-center gap-2.5">
                {course.instructor.photoUrl ? <img src={course.instructor.photoUrl} alt="" className="h-8 w-8 rounded-full object-cover" /> : <span className="flex h-8 w-8 items-center justify-center rounded-full bg-copper/10 text-[11px] font-bold text-copper">{initials(course.instructor.name)}</span>}
                <div className="text-xs"><p className="font-semibold text-foreground">{course.instructor.name}</p><p className="text-muted-foreground">Instructor{course.instructor.specialty ? ` · ${course.instructor.specialty}` : ""}</p></div>
              </div>
            )}
            <div className="mt-auto pt-6">
              {courseProgress && (
                <div className="mb-4">
                  <div className="flex justify-between text-xs font-semibold text-foreground"><span>Your progress</span><span>{courseProgress.completed}/{courseProgress.total} · {courseProgress.percent}%</span></div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-neutral-100"><div className="h-full rounded-full bg-herb-green transition-[width]" style={{ width: `${courseProgress.percent}%` }} /></div>
                </div>
              )}
              {flat.length > 0 && (
                <button onClick={() => open(firstOpen.item.id)} className="inline-flex items-center gap-2 rounded-xl bg-copper px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90">
                  <PlayCircle size={17} /> {!enrolled ? "Start course" : courseProgress && courseProgress.percent === 100 ? "Review course" : "Continue learning"}
                </button>
              )}
            </div>
          </div>
          <div className="order-1 md:order-2">
            {course.thumbnailUrl ? <img src={course.thumbnailUrl} alt="" className="h-full max-h-80 w-full object-cover md:max-h-none" /> : <div className="flex h-full min-h-40 items-center justify-center bg-gradient-to-br from-copper/15 via-copper/5 to-herb-green/10"><PlayCircle size={40} className="text-copper/40" /></div>}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <nav className="h-fit rounded-2xl border border-border/60 bg-white p-4 shadow-xs lg:sticky lg:top-4" aria-label="Course content">
          <Outline sections={sections} progress={progress} selected={null} onOpen={open} />
        </nav>

        <div className="min-w-0 space-y-8 rounded-2xl border border-border/60 bg-white p-6 shadow-xs md:p-8">
          <div>
            <h2 className="font-display text-lg font-bold text-foreground">About this course</h2>
            {course.description ? <Paragraphs text={course.description} className="mt-3" /> : <p className="mt-2 text-sm text-muted-foreground">No description yet.</p>}
          </div>
          {course.learningObjectives.length > 0 && (
            <div>
              <h2 className="font-display text-lg font-bold text-foreground">What you will learn</h2>
              <ul className="mt-3 grid gap-2.5 sm:grid-cols-2">
                {course.learningObjectives.map((o) => (
                  <li key={o} className="flex gap-2.5 text-sm text-foreground/85"><Target size={16} className="mt-0.5 flex-shrink-0 text-herb-green" /> {o}</li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <h2 className="font-display text-lg font-bold text-foreground">Course structure</h2>
            <ol className="mt-3 space-y-2">
              {sections.map((s, si) => (
                <li key={s.id} className="flex items-center gap-3 rounded-xl bg-neutral-50 px-4 py-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-xs font-bold text-copper ring-1 ring-border">{si + 1}</span>
                  <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-foreground">{s.title}</span>{s.description && <span className="block text-xs text-muted-foreground">{s.description}</span>}</span>
                  <span className="text-xs text-muted-foreground">{s.items.length} {s.items.length === 1 ? "item" : "items"}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}

function ItemView({ entry, progress, busy, onComplete, handlers, onNext }: { entry: { item: ContentItem; section: Section; sectionIndex: number }; progress: ItemProgress | undefined; busy: boolean; onComplete: (quiet?: boolean) => void; handlers: PlayerHandlers; onNext?: () => void }) {
  const { item, section, sectionIndex } = entry;
  const meta = CONTENT_META[item.type];
  const done = progress?.completed;
  const viewing = isFileType(item.type) || item.type === "lesson";
  // Progress refreshes re-sign file URLs; keep the first one so a playing video or open PDF does not reload.
  const [url] = useState(item.file?.url ?? null);

  return (
    <article className="space-y-5">
      <header>
        <p className="text-xs font-semibold text-muted-foreground">Section {sectionIndex + 1} · {section.title} · <span className="text-copper">{meta.label}</span></p>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <h2 className="font-display text-xl font-bold text-foreground md:text-2xl">{item.title}</h2>
          {done && <span className="inline-flex items-center gap-1 rounded-full bg-herb-green/10 px-2.5 py-1 text-xs font-semibold text-herb-green"><Check size={13} strokeWidth={3} /> Completed</span>}
        </div>
      </header>

      {item.type === "video" && (url ? <video src={url} controls playsInline preload="metadata" onEnded={() => onComplete(true)} className="aspect-video w-full rounded-xl bg-black" /> : <p className="text-sm text-muted-foreground">Video unavailable.</p>)}
      {item.type === "image" && url && (
        <figure>
          <img src={url} alt={item.title} className="max-h-[80vh] w-full rounded-xl bg-neutral-50 object-contain" />
          {item.description && <figcaption className="mt-2 text-center text-sm text-muted-foreground">{item.description}</figcaption>}
        </figure>
      )}
      {item.type === "document" && item.file && (
        <>
          {item.file.mimeType === "application/pdf" && url && <iframe src={url} title={item.title} className="h-[80vh] min-h-[520px] w-full rounded-xl border border-border bg-neutral-50" />}
          <FileCard item={item} />
        </>
      )}
      {item.type === "file" && item.file && <FileCard item={item} />}

      {item.description && item.type !== "image" && item.type !== "question" && <Paragraphs text={item.description} />}
      {item.type === "lesson" && item.body && <Paragraphs text={item.body} />}

      {(item.type === "quiz" || item.type === "question") && item.quiz && (
        <QuizRunner item={item} progress={progress} onStart={() => handlers.startAttempt(item.id)} onSubmit={(attemptId, answers) => handlers.submitAttempt(item.id, attemptId, answers)} onNext={onNext} />
      )}

      {item.type === "assignment" && (
        <>
          {item.settings.dueAt && <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground"><CalendarClock size={16} className="text-copper" /> Due {new Date(item.settings.dueAt).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>}
          {item.file && <FileCard item={item} />}
          <ResponseForm item={item} progress={progress} onSubmit={(input) => handlers.respond(item.id, input)} />
        </>
      )}
      {item.type === "feedback" && <ResponseForm item={item} progress={progress} onSubmit={(input) => handlers.respond(item.id, input)} />}

      {viewing && !done && (
        <button onClick={() => onComplete()} disabled={busy} className="inline-flex items-center gap-1.5 rounded-xl bg-herb-green px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
          <Check size={16} strokeWidth={3} /> {busy ? "Saving…" : "Mark as complete"}
        </button>
      )}
    </article>
  );
}
