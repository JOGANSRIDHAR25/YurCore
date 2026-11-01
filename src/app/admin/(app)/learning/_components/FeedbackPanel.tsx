"use client";

import { useState } from "react";
import { toast } from "react-hot-toast";
import { MessageSquare, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery } from "@/hooks/useQuery";
import { adminLearningApi, type AdminCourse } from "../_lib/api";
import { Card, Field, Spinner, inputCls, primaryBtn } from "./ui";

/**
 * Course-level Feedback module (replaces adding Feedback items through Add Content). When enabled, learners rate
 * the course 1–5 (optional comment) after completing all content, and their certificate is issued only after
 * that. Disabled feedback never blocks the certificate.
 */
export function FeedbackPanel({ course, onSaved }: { course: AdminCourse; onSaved: () => void }) {
  const [enabled, setEnabled] = useState(course.feedback.enabled);
  const [title, setTitle] = useState(course.feedback.title ?? "");
  const [allowComment, setAllowComment] = useState(course.feedback.allowComment);
  const [saving, setSaving] = useState(false);
  const responses = useQuery(() => adminLearningApi.courseFeedback(course.id), [course.id]);
  const defaultTitle = `${course.title} — Course Feedback`;
  const dirty = enabled !== course.feedback.enabled || (title.trim() || null) !== (course.feedback.title ?? null) || allowComment !== course.feedback.allowComment;

  async function save() {
    setSaving(true);
    try {
      await adminLearningApi.update(course.id, { feedbackEnabled: enabled, feedbackTitle: title.trim() || null, feedbackAllowComment: allowComment });
      toast.success(enabled ? "Feedback enabled for this course" : "Feedback settings saved");
      onSaved();
      responses.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save feedback settings");
    } finally {
      setSaving(false);
    }
  }

  const data = responses.data;
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Card title="Feedback" description="One course feedback after all course content. Required before the certificate when enabled.">
        <div className="space-y-5">
          <div className="rounded-xl bg-background px-4 py-3 text-sm">
            <span className="text-xs text-muted-foreground">Course</span>
            <p className="font-semibold text-foreground">{course.title}</p>
          </div>

          <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-border px-4 py-3.5">
            <span>
              <span className="block text-sm font-semibold text-foreground">Enable course feedback</span>
              <span className="block text-xs text-muted-foreground">Learners submit a rating before their certificate is issued.</span>
            </span>
            <button type="button" role="switch" aria-checked={enabled} onClick={() => setEnabled(!enabled)} className={cn("relative mt-0.5 h-6 w-11 flex-shrink-0 rounded-full transition-colors", enabled ? "bg-herb-green" : "bg-neutral-300")}>
              <span className={cn("absolute left-0 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform", enabled ? "translate-x-[22px]" : "translate-x-0.5")} />
            </button>
          </label>

          <Field label="Feedback title" hint="Leave empty to use the course title. It follows the course title if that changes.">
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder={defaultTitle} className={inputCls} disabled={!enabled} />
          </Field>

          <div className="space-y-2">
            <span className="text-[13px] font-semibold text-foreground">Rating</span>
            <p className="flex items-center gap-1 text-amber-500">{Array.from({ length: 5 }, (_, i) => <Star key={i} size={18} />)} <span className="ml-2 text-xs text-muted-foreground">1–5 stars, required</span></p>
          </div>

          <label className={cn("flex items-center gap-2.5 text-sm", !enabled && "opacity-60")}>
            <input type="checkbox" checked={allowComment} onChange={(e) => setAllowComment(e.target.checked)} disabled={!enabled} className="h-4 w-4 accent-herb-green" />
            Allow an optional written comment
          </label>

          <div className="flex justify-end">
            <button type="button" onClick={save} disabled={saving || !dirty} className={primaryBtn}>{saving ? "Saving…" : "Save feedback settings"}</button>
          </div>
        </div>
      </Card>

      <Card title="Responses" description={data ? `${data.count} ${data.count === 1 ? "response" : "responses"}${data.average !== null ? ` · average ${data.average} / 5` : ""}` : undefined}>
        {responses.loading && !data ? (
          <Spinner className="mx-auto" />
        ) : responses.error ? (
          <p className="text-sm text-amber-700">{responses.error}</p>
        ) : !data?.rows.length ? (
          <div className="flex flex-col items-center py-8 text-center text-sm text-muted-foreground">
            <MessageSquare size={22} className="mb-2 text-muted-foreground/50" />
            No feedback yet.
          </div>
        ) : (
          <ul className="max-h-[32rem] space-y-3 overflow-y-auto">
            {data.rows.map((r) => (
              <li key={r.userId} className="rounded-xl border border-border px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-foreground">{r.name}</span>
                  <span className="text-xs text-muted-foreground">{new Date(r.submittedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
                </div>
                <p className="mt-1 flex text-amber-500" aria-label={`${r.rating} out of 5`}>{Array.from({ length: 5 }, (_, i) => <Star key={i} size={14} fill={i < r.rating ? "currentColor" : "none"} />)}</p>
                {r.comment && <p className="mt-1.5 whitespace-pre-line text-sm text-foreground/80">{r.comment}</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
