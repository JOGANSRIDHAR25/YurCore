"use client";

import { SITE_NAME } from "@/shared/config/site";
import { useRef, useState } from "react";
import { toast } from "react-hot-toast";
import { Clock, ImagePlus, Plus, RefreshCw, Target, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery } from "@/hooks/useQuery";
import { LEVEL_LABEL, UPLOAD_RULES, formatDuration } from "@/shared/learning/content";
import type { CourseLevel } from "@/shared/learning/types";
import { adminLearningApi, uploadFile, type AdminCourse, type CourseInput } from "../_lib/api";
import { Card, Field, ProgressBar, ghostBtn, iconBtn, inputCls, primaryBtn } from "./ui";

const LEVELS = Object.entries(LEVEL_LABEL) as [CourseLevel, string][];

/**
 * Step 1: the information learners see before they open a course. Kept short on purpose:
 * everything else (content, quizzes) is added in the course builder.
 */
export function CourseDetailsForm({ course, onSaved, onCancel }: { course?: AdminCourse; onSaved: (c: AdminCourse) => void; onCancel: () => void }) {
  const { data: categories } = useQuery(() => adminLearningApi.categories(), []);
  const [title, setTitle] = useState(course?.title ?? "");
  const [shortDescription, setShortDescription] = useState(course?.shortDescription ?? "");
  const [description, setDescription] = useState(course?.description ?? "");
  const [category, setCategory] = useState(course?.category ?? "");
  const [level, setLevel] = useState<CourseLevel | null>(course?.level ?? null);
  const [hours, setHours] = useState(course?.durationMinutes ? String(Math.floor(course.durationMinutes / 60)) : "");
  const [minutes, setMinutes] = useState(course?.durationMinutes ? String(course.durationMinutes % 60) : "");
  const [objectives, setObjectives] = useState<string[]>(course?.learningObjectives.length ? course.learningObjectives : [""]);
  const [status, setStatus] = useState(course?.status ?? "draft");
  const [thumbFile, setThumbFile] = useState<File | null>(null);
  const [thumbPreview, setThumbPreview] = useState<string | null>(course?.thumbnailUrl ?? null);
  const [thumbRemoved, setThumbRemoved] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const thumbInput = useRef<HTMLInputElement>(null);

  const duration = (Number(hours) || 0) * 60 + (Number(minutes) || 0);

  function pickThumb(f: File | undefined) {
    if (!f) return;
    if (!UPLOAD_RULES.thumbnail.mime.includes(f.type)) return toast.error(`Use a ${UPLOAD_RULES.thumbnail.label} image`);
    setThumbFile(f);
    setThumbPreview(URL.createObjectURL(f));
    setThumbRemoved(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (title.trim().length < 3) return toast.error("Course title must be at least 3 characters");
    const input: CourseInput = {
      title: title.trim(),
      shortDescription: shortDescription.trim(),
      description: description.trim(),
      category: category.trim() || null,
      level,
      durationMinutes: duration || null,
      learningObjectives: objectives.map((o) => o.trim()).filter(Boolean),
    };
    try {
      setSaving("Saving course…");
      let saved = course ? await adminLearningApi.update(course.id, input) : await adminLearningApi.create(input);
      if (thumbFile) {
        setSaving("Uploading thumbnail…");
        setUploadPct(0);
        const { promise } = uploadFile(saved.id, "thumbnail", thumbFile, (sent, total) => setUploadPct(Math.round((sent / total) * 100)));
        const uploaded = await promise.catch((err) => {
          toast.error(`Course saved, but the thumbnail could not be uploaded: ${err instanceof Error ? err.message : "error"}`);
          return null;
        });
        if (uploaded) saved = await adminLearningApi.update(saved.id, { thumbnailPath: uploaded.path });
      } else if (course && thumbRemoved) {
        saved = await adminLearningApi.update(saved.id, { thumbnailPath: null });
      }
      if (course && status !== course.status) {
        setSaving(status === "published" ? "Publishing…" : "Moving to draft…");
        saved = await adminLearningApi.publish(saved.id, status === "published");
      }
      toast.success(course ? "Course details saved" : "Course created. Now build its content");
      onSaved(saved);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the course");
    } finally {
      setSaving(null);
      setUploadPct(null);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="space-y-5">
        <Card title="Basic information" description="What the course is called and who it is for.">
          <div className="space-y-4">
            <Field label="Course title" required>
              <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="e.g. Foundations of Ayurveda" className={inputCls} autoFocus={!course} />
            </Field>
            <Field label="Short description" hint={`Shown on course cards. ${300 - shortDescription.length} characters left.`}>
              <input value={shortDescription} onChange={(e) => setShortDescription(e.target.value)} maxLength={300} placeholder="One sentence that tells practitioners what they will learn" className={inputCls} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Category" hint="Pick an existing category or type a new one.">
                <input value={category} onChange={(e) => setCategory(e.target.value)} list="learning-categories" maxLength={80} placeholder="e.g. Clinical Ayurveda" className={inputCls} />
                <datalist id="learning-categories">{(categories ?? []).map((c) => <option key={c} value={c} />)}</datalist>
              </Field>
              <div className="space-y-1.5">
                <span className="text-[13px] font-semibold text-foreground">Course level</span>
                <div className="grid grid-cols-3 gap-1 rounded-xl bg-background p-1">
                  {LEVELS.map(([v, label]) => (
                    <button key={v} type="button" onClick={() => setLevel(level === v ? null : v)} className={cn("rounded-lg py-2 text-xs font-semibold transition-colors", level === v ? "bg-white text-herb-green shadow-sm" : "text-muted-foreground hover:text-foreground")}>{label}</button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </Card>

        <Card title="About the course" description="Shown on the course page before a learner starts.">
          <div className="space-y-5">
            <Field label="Full course description">
              <textarea rows={6} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={20000} placeholder="Describe what the course covers, who it is for and how it is structured." className={inputCls} />
            </Field>
            <div>
              <p className="text-[13px] font-semibold text-foreground">Learning objectives</p>
              <p className="mb-2 text-xs text-muted-foreground">What learners will be able to do after the course. One per line.</p>
              <div className="space-y-2">
                {objectives.map((o, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Target size={15} className="flex-shrink-0 text-herb-green" />
                    <input
                      value={o}
                      onChange={(e) => setObjectives(objectives.map((x, j) => (j === i ? e.target.value : x)))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          if (o.trim()) setObjectives([...objectives.slice(0, i + 1), "", ...objectives.slice(i + 1)]);
                        }
                      }}
                      maxLength={300}
                      placeholder={i === 0 ? "e.g. Explain the three doshas and their functions" : "Another objective"}
                      className={inputCls}
                    />
                    <button type="button" onClick={() => setObjectives(objectives.length === 1 ? [""] : objectives.filter((_, j) => j !== i))} className={iconBtn} aria-label="Remove objective"><X size={15} /></button>
                  </div>
                ))}
              </div>
              {objectives.length < 30 && (
                <button type="button" onClick={() => setObjectives([...objectives, ""])} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-herb-green hover:underline"><Plus size={14} /> Add objective</button>
              )}
            </div>
          </div>
        </Card>

        <Card title="Thumbnail" description="The cover image on course cards and the course page. Landscape, around 1280 × 720 works best.">
          <input ref={thumbInput} type="file" accept={UPLOAD_RULES.thumbnail.accept} className="hidden" onChange={(e) => { pickThumb(e.target.files?.[0]); e.target.value = ""; }} />
          {thumbPreview ? (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <img src={thumbPreview} alt="" className="aspect-video w-full rounded-xl border border-border object-cover sm:w-64" />
              <div className="flex gap-2">
                <button type="button" onClick={() => thumbInput.current?.click()} className={ghostBtn}><RefreshCw size={14} /> Replace</button>
                <button type="button" onClick={() => { setThumbFile(null); setThumbPreview(null); setThumbRemoved(true); }} className="inline-flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"><Trash2 size={14} /> Remove</button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => thumbInput.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); pickThumb(e.dataTransfer.files?.[0]); }}
              className="flex aspect-[21/9] w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border text-center hover:border-herb-green/50 hover:bg-background"
            >
              <ImagePlus size={24} className="text-herb-green" />
              <span className="mt-2 text-sm font-semibold text-foreground">Upload a thumbnail</span>
              <span className="text-xs text-muted-foreground">{UPLOAD_RULES.thumbnail.label}</span>
            </button>
          )}
        </Card>

        <Card title="Duration">
          <div>
            <div className="space-y-1.5">
              <span className="text-[13px] font-semibold text-foreground">Estimated duration</span>
              <div className="flex items-center gap-2">
                <input type="number" min={0} max={999} value={hours} onChange={(e) => setHours(e.target.value)} placeholder="0" className={inputCls + " !w-20"} aria-label="Hours" />
                <span className="text-xs text-muted-foreground">hours</span>
                <input type="number" min={0} max={59} value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="0" className={inputCls + " !w-20"} aria-label="Minutes" />
                <span className="text-xs text-muted-foreground">min</span>
              </div>
              <span className="block text-xs text-muted-foreground">Total time a learner needs, including quizzes.</span>
            </div>
          </div>
        </Card>

        <Card title="Course status">
          <div className="grid gap-3 sm:grid-cols-2">
            {(["draft", "published"] as const).map((s) => {
              const disabled = s === "published" && !course;
              return (
                <button
                  key={s}
                  type="button"
                  disabled={disabled}
                  onClick={() => setStatus(s)}
                  className={cn("rounded-2xl border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60", status === s ? "border-herb-green bg-herb-green/5 ring-2 ring-herb-green/15" : "border-border hover:bg-background")}
                >
                  <span className="block text-sm font-semibold text-foreground">{s === "draft" ? "Draft" : "Published"}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {s === "draft" ? "Only admins can see it. Keep building and preview it first." : disabled ? "Visible to all practitioners. Available once the course has content: publish from the course builder." : `Visible to all practitioners in ${SITE_NAME} Learning.`}
                  </span>
                </button>
              );
            })}
          </div>
        </Card>

        {saving && (
          <div className="rounded-2xl border border-herb-green/30 bg-herb-green/5 p-4 text-sm font-medium text-foreground">
            {saving}
            {uploadPct !== null && <ProgressBar value={uploadPct} className="mt-2" />}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={Boolean(saving)} className={ghostBtn}>Cancel</button>
          <button disabled={Boolean(saving)} className={primaryBtn}>{saving ? "Saving…" : course ? "Save details" : "Create course and continue"}</button>
        </div>
      </div>

      <aside className="hidden lg:block">
        <div className="sticky top-6 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Card preview</p>
          <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
            {thumbPreview ? <img src={thumbPreview} alt="" className="aspect-video w-full object-cover" /> : <div className="flex aspect-video w-full items-center justify-center bg-gradient-to-br from-herb-green/15 to-copper/10 text-herb-green/60"><ImagePlus size={28} /></div>}
            <div className="p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-copper">{[category.trim(), level && LEVEL_LABEL[level]].filter(Boolean).join(" · ") || "Category"}</p>
              <h3 className="mt-1 line-clamp-2 font-display text-base font-bold leading-snug text-foreground">{title.trim() || "Course title"}</h3>
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{shortDescription.trim() || "Short description"}</p>
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {duration > 0 && <span className="flex items-center gap-1"><Clock size={12} /> {formatDuration(duration)}</span>}
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">This is how practitioners see the course in {SITE_NAME} Learning.</p>
        </div>
      </aside>
    </form>
  );
}
