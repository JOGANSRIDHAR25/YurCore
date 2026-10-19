"use client";

import { SITE_NAME } from "@/shared/config/site";
import { useState } from "react";
import { toast } from "react-hot-toast";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { isFileType, isQuizType } from "@/shared/learning/content";
import { adminLearningApi, type AdminCourse, type Section } from "../_lib/api";
import { Modal, ghostBtn, primaryBtn } from "./ui";

/** What must be fixed before publishing (the server enforces the same rules). */
export function publishProblems(sections: Section[]): string[] {
  const items = sections.flatMap((s) => s.items);
  const problems: string[] = [];
  if (items.length === 0) problems.push("Add at least one content item");
  for (const i of items) {
    if (isFileType(i.type) && !i.file) problems.push(`“${i.title}” has no file`);
    if (isQuizType(i.type) && !i.quiz?.questionCount) problems.push(`“${i.title}” has no questions`);
  }
  return problems;
}

/** Confirms publish / unpublish, with a checklist of what learners will get. */
export function PublishDialog({ course, sections, onClose, onDone }: { course: AdminCourse; sections: Section[]; onClose: () => void; onDone: () => void }) {
  const publishing = course.status !== "published";
  const [busy, setBusy] = useState(false);
  const problems = publishing ? publishProblems(sections) : [];
  const c = course.counts;

  async function confirm() {
    setBusy(true);
    try {
      await adminLearningApi.publish(course.id, publishing);
      toast.success(publishing ? "Course published. Practitioners can now see it" : "Course moved back to draft");
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the course");
      setBusy(false);
    }
  }

  const rows = [
    ["Sections", c.sections],
    ["Content items", c.items],
    ["Videos", c.videos],
    ["Documents and files", c.documents],
    ["Quizzes and questions", c.quizzes],
  ] as const;

  return (
    <Modal
      title={publishing ? "Publish course" : "Unpublish course"}
      subtitle={course.title}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <button onClick={onClose} disabled={busy} className={ghostBtn}>Cancel</button>
          <button onClick={confirm} disabled={busy || problems.length > 0} className={primaryBtn}>{busy ? "Working…" : publishing ? "Publish course" : "Move to draft"}</button>
        </>
      }
    >
      {publishing ? (
        <div className="space-y-4 text-sm">
          <p className="text-foreground/80">Once published, every practitioner can find and take this course in {SITE_NAME} Learning. You can keep editing it afterwards.</p>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {rows.map(([k, v]) => (
              <div key={k} className="rounded-xl bg-background px-3 py-2.5">
                <dt className="text-[11px] text-muted-foreground">{k}</dt>
                <dd className="text-base font-bold text-foreground">{v}</dd>
              </div>
            ))}
          </dl>
          {problems.length > 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-900"><AlertTriangle size={15} /> Fix these before publishing</p>
              <ul className="mt-1.5 list-disc space-y-0.5 pl-6 text-xs text-amber-900">{problems.slice(0, 8).map((p) => <li key={p}>{p}</li>)}</ul>
            </div>
          ) : (
            <p className="flex items-center gap-1.5 text-sm font-semibold text-herb-green"><CheckCircle2 size={15} /> Ready to publish</p>
          )}
        </div>
      ) : (
        <p className="text-sm text-foreground/80">Move this course back to draft? Practitioners will no longer see or open it. Their progress is kept and returns when you publish again.</p>
      )}
    </Modal>
  );
}
