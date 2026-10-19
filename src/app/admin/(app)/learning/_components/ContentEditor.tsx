"use client";

import { useRef, useState } from "react";
import { toast } from "react-hot-toast";
import { isFileType, isQuizType } from "@/shared/learning/content";
import type { ContentType, UploadKind } from "@/shared/learning/types";
import { CONTENT_META } from "@/components/learning/content-meta";
import { adminLearningApi, type ContentItem, type Quiz, type UploadedFile } from "../_lib/api";
import { FileDrop } from "./FileDrop";
import { QuizBuilder, emptyQuiz, quizProblem } from "./QuizBuilder";
import { Field, Modal, ghostBtn, inputCls, primaryBtn } from "./ui";

type Target = { mode: "add"; type: ContentType; sectionId: string; sectionTitle: string } | { mode: "edit"; item: ContentItem; sectionTitle: string };

const toLocal = (iso: string | null | undefined) => {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const titleFromFile = (name: string) => name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();

const COPY: Partial<Record<ContentType, { description: string; descriptionHint?: string; titleHint: string }>> = {
  video: { titleHint: "e.g. Introduction to the Tridosha theory", description: "Description" },
  image: { titleHint: "e.g. The five elements diagram", description: "Caption", descriptionHint: "Shown under the image." },
  document: { titleHint: "e.g. Reference notes: Dinacharya", description: "Description" },
  file: { titleHint: "e.g. Practice worksheet", description: "Description" },
  lesson: { titleHint: "e.g. What is Prakriti?", description: "Summary (optional)" },
  quiz: { titleHint: "e.g. Quiz: Basic Ayurveda", description: "Instructions (optional)", descriptionHint: "Shown before the learner starts." },
  question: { titleHint: "e.g. Knowledge check", description: "Context (optional)" },
  assignment: { titleHint: "e.g. Case study: Vata imbalance", description: "Instructions", descriptionHint: "Explain what the learner must do and submit." },
  feedback: { titleHint: "e.g. How was this module?", description: "Question for learners", descriptionHint: "e.g. What did you find most useful in this course?" },
};

export function ContentEditor({ courseId, target, onClose, onSaved }: { courseId: string; target: Target; onClose: () => void; onSaved: () => void }) {
  const item = target.mode === "edit" ? target.item : null;
  const type = item?.type ?? (target.mode === "add" ? target.type : "lesson");
  const meta = CONTENT_META[type];
  const copy = COPY[type]!;
  const initialFile: UploadedFile | null = item?.file ? { path: item.file.path, name: item.file.name, size: item.file.size, mimeType: item.file.mimeType, url: item.file.url } : null;

  const [title, setTitle] = useState(item?.title ?? (type === "question" ? "Knowledge check" : ""));
  const [description, setDescription] = useState(item?.description ?? "");
  const [body, setBody] = useState(item?.body ?? "");
  const [file, setFile] = useState<UploadedFile | null>(initialFile);
  const [dueAt, setDueAt] = useState(toLocal(item?.settings.dueAt));
  const [rating, setRating] = useState(item?.settings.rating ?? true);
  const [quiz, setQuiz] = useState<Quiz>(() =>
    item?.quiz ? { passingScore: item.quiz.passingScore, timeLimitMinutes: item.quiz.timeLimitMinutes, attemptsAllowed: item.quiz.attemptsAllowed, questions: item.quiz.questions ?? [] } : emptyQuiz(type === "question"),
  );
  const [invalidQuestion, setInvalidQuestion] = useState<number | undefined>();
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const pending = useRef<string[]>([]); // uploads made in this editor, discarded unless saved

  const uploadKind: UploadKind | null = isFileType(type) ? type : type === "assignment" ? "attachment" : null;

  function discard(keep?: string | null) {
    for (const p of pending.current) if (p !== keep) adminLearningApi.discardUpload(courseId, p);
    pending.current = [];
  }

  function close() {
    if (saving) return;
    discard(target.mode === "edit" ? initialFile?.path : null);
    onClose();
  }

  async function save() {
    if (uploading) return toast.error("Wait for the upload to finish");
    if (isFileType(type) && !file) return toast.error("Upload a file first");
    if (!title.trim()) return toast.error("Give this item a title");
    if (type === "lesson" && !body.trim()) return toast.error("Write the lesson text");
    if (type === "assignment" && !description.trim()) return toast.error("Write the assignment instructions");
    if (type === "feedback" && !description.trim()) return toast.error("Write the question for learners");
    if (isQuizType(type)) {
      const problem = quizProblem(quiz, type === "question");
      setInvalidQuestion(problem?.index);
      if (problem) return toast.error(problem.message);
    }

    const fileChanged = (file?.path ?? null) !== (initialFile?.path ?? null);
    const payload = {
      title: title.trim(),
      description: description.trim(),
      ...(type === "lesson" ? { body } : {}),
      ...(type === "assignment" ? { settings: { dueAt: dueAt ? new Date(dueAt).toISOString() : null } } : type === "feedback" ? { settings: { rating } } : {}),
      ...(uploadKind && (target.mode === "add" || fileChanged) ? { file: file ? { path: file.path, name: file.name } : null } : {}),
      ...(isQuizType(type) ? { quiz } : {}),
    };

    setSaving(true);
    try {
      if (target.mode === "add") await adminLearningApi.addContent(courseId, { sectionId: target.sectionId, type, ...payload });
      else await adminLearningApi.updateContent(courseId, target.item.id, payload);
      discard(file?.path);
      toast.success(target.mode === "add" ? `${meta.label} added` : "Changes saved");
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  const Icon = meta.icon;
  return (
    <Modal
      size={isQuizType(type) ? "xl" : "lg"}
      title={`${target.mode === "add" ? "Add" : "Edit"} ${meta.label.toLowerCase()}`}
      subtitle={`Section: ${target.sectionTitle}`}
      onClose={close}
      busy={saving}
      footer={
        <>
          <button onClick={close} disabled={saving} className={ghostBtn}>Cancel</button>
          <button onClick={save} disabled={saving || uploading} className={primaryBtn}>{saving ? "Saving…" : target.mode === "add" ? `Add ${meta.label.toLowerCase()}` : "Save changes"}</button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="flex items-center gap-3 rounded-2xl bg-background/60 p-3">
          <span className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${meta.tint}`}><Icon size={19} /></span>
          <p className="text-xs text-muted-foreground">{meta.description}</p>
        </div>

        {isFileType(type) && (
          <FileDrop
            courseId={courseId}
            kind={type}
            value={file}
            onBusy={setUploading}
            onUploaded={(p) => pending.current.push(p)}
            onChange={(f) => {
              setFile(f);
              if (f && !title.trim()) setTitle(titleFromFile(f.name));
            }}
          />
        )}

        <Field label="Title" required>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder={copy.titleHint} className={inputCls} />
        </Field>

        {type !== "question" && (
          <Field label={copy.description} hint={copy.descriptionHint} required={type === "assignment" || type === "feedback"}>
            <textarea rows={type === "assignment" ? 5 : 3} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={5000} className={inputCls} />
          </Field>
        )}

        {type === "lesson" && (
          <Field label="Lesson text" required hint="Separate paragraphs with a blank line. Learners see it exactly as written.">
            <textarea rows={14} value={body} onChange={(e) => setBody(e.target.value)} className={inputCls + " font-[inherit] leading-relaxed"} />
          </Field>
        )}

        {type === "assignment" && (
          <>
            <Field label="Due date (optional)" hint="Learners see the deadline; late submissions are still accepted.">
              <input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className={inputCls + " sm:!w-72"} />
            </Field>
            <div className="space-y-1.5">
              <p className="text-[13px] font-semibold text-foreground">Attachment (optional)</p>
              <FileDrop courseId={courseId} kind="attachment" value={file} onBusy={setUploading} onUploaded={(p) => pending.current.push(p)} onChange={setFile} />
            </div>
          </>
        )}

        {type === "feedback" && (
          <label className="flex items-start gap-3 rounded-2xl border border-border p-4 text-sm">
            <input type="checkbox" checked={rating} onChange={(e) => setRating(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--color-herb-green)]" />
            <span>
              <span className="font-semibold text-foreground">Ask for a 1–5 rating</span>
              <span className="block text-xs text-muted-foreground">Learners rate and can add a written comment.</span>
            </span>
          </label>
        )}

        {isQuizType(type) && <QuizBuilder value={quiz} onChange={setQuiz} single={type === "question"} invalidIndex={invalidQuestion} />}
      </div>
    </Modal>
  );
}
