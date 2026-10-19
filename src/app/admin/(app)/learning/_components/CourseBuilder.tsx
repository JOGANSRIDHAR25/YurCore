"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import { AlertTriangle, ChevronDown, ChevronUp, GripVertical, Inbox, MessageSquareText, Pencil, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBytes } from "@/shared/learning/content";
import type { ContentType } from "@/shared/learning/types";
import { CONTENT_META } from "@/components/learning/content-meta";
import { adminLearningApi, type ContentItem, type Section } from "../_lib/api";
import { AddContentDialog } from "./AddContentDialog";
import { ContentEditor } from "./ContentEditor";
import { ResponsesDialog } from "./ResponsesDialog";
import { ConfirmDialog, Modal, Field, ghostBtn, iconBtn, inputCls, primaryBtn } from "./ui";

type Drag = { kind: "item"; id: string } | { kind: "section"; id: string } | null;
type Editor = { mode: "add"; type: ContentType; sectionId: string; sectionTitle: string } | { mode: "edit"; item: ContentItem; sectionTitle: string };
type Confirm = { title: string; message: React.ReactNode; run: () => Promise<void> };

function itemMeta(item: ContentItem): { text: string | null; warning: string | null } {
  switch (item.type) {
    case "video":
    case "image":
    case "document":
    case "file":
      return item.file ? { text: `${item.file.name} · ${formatBytes(item.file.size)}`, warning: null } : { text: null, warning: "No file uploaded" };
    case "lesson": {
      const words = (item.body ?? "").trim().split(/\s+/).filter(Boolean).length;
      return { text: `${Math.max(1, Math.round(words / 200))} min read`, warning: null };
    }
    case "quiz": {
      const q = item.quiz;
      if (!q || q.questionCount === 0) return { text: null, warning: "No questions yet" };
      return { text: [`${q.questionCount} ${q.questionCount === 1 ? "question" : "questions"}`, `Pass ${q.passingScore}%`, q.timeLimitMinutes && `${q.timeLimitMinutes} min`, q.attemptsAllowed && `${q.attemptsAllowed} ${q.attemptsAllowed === 1 ? "attempt" : "attempts"}`].filter(Boolean).join(" · "), warning: null };
    }
    case "question":
      return item.quiz?.questionCount ? { text: "1 question · 4 options", warning: null } : { text: null, warning: "No question yet" };
    case "assignment":
      return { text: item.settings.dueAt ? `Due ${new Date(item.settings.dueAt).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : "No due date", warning: null };
    case "feedback":
      return { text: item.settings.rating ? "Rating + comment" : "Written feedback", warning: null };
  }
}

/** Sections and their content in learner order. Every change is saved straight away. */
export function CourseBuilder({ courseId, sections, onChanged }: { courseId: string; sections: Section[]; onChanged: () => void }) {
  const [layout, setLayout] = useState(sections);
  useEffect(() => setLayout(sections), [sections]);

  const drag = useRef<Drag>(null);
  const [over, setOver] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [picker, setPicker] = useState<Section | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [responses, setResponses] = useState<ContentItem | null>(null);
  const [sectionForm, setSectionForm] = useState<{ id: string | null; title: string; description: string } | null>(null);

  async function persist(next: Section[]) {
    const previous = layout;
    setLayout(next);
    setSaving(true);
    try {
      await adminLearningApi.saveLayout(courseId, next.map((s) => ({ id: s.id, items: s.items.map((i) => i.id) })));
      onChanged();
    } catch (err) {
      setLayout(previous);
      toast.error(err instanceof Error ? err.message : "Could not save the new order");
    } finally {
      setSaving(false);
    }
  }

  const moveSection = (from: number, to: number) => {
    if (to < 0 || to >= layout.length || from === to) return;
    const next = [...layout];
    const [s] = next.splice(from, 1);
    next.splice(to, 0, s);
    persist(next);
  };

  /** Moves an item to a section, before another item (or to the end). */
  const moveItem = (itemId: string, toSection: string, beforeId: string | null) => {
    if (itemId === beforeId) return;
    const item = layout.flatMap((s) => s.items).find((i) => i.id === itemId);
    if (!item) return;
    const next = layout.map((s) => ({ ...s, items: s.items.filter((i) => i.id !== itemId) }));
    const target = next.find((s) => s.id === toSection)!;
    const at = beforeId ? target.items.findIndex((i) => i.id === beforeId) : -1;
    target.items.splice(at < 0 ? target.items.length : at, 0, { ...item, sectionId: toSection });
    const changed = next.some((s, i) => s.items.map((x) => x.id).join() !== layout[i].items.map((x) => x.id).join());
    if (changed) persist(next);
  };

  const nudgeItem = (s: Section, index: number, d: -1 | 1) => {
    const to = index + d;
    if (to < 0 || to >= s.items.length) return;
    const ids = s.items.map((i) => i.id);
    moveItem(ids[index], s.id, d === -1 ? ids[to] : ids[to + 1] ?? null);
  };

  function endDrag() {
    drag.current = null;
    setOver(null);
  }

  async function saveSection() {
    if (!sectionForm) return;
    const title = sectionForm.title.trim();
    if (!title) return toast.error("Give the section a title");
    setSaving(true);
    try {
      if (sectionForm.id) await adminLearningApi.updateSection(courseId, sectionForm.id, { title, description: sectionForm.description.trim() });
      else await adminLearningApi.addSection(courseId, title, sectionForm.description.trim());
      toast.success(sectionForm.id ? "Section updated" : "Section added");
      setSectionForm(null);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the section");
    } finally {
      setSaving(false);
    }
  }

  const total = layout.reduce((n, s) => n + s.items.length, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {layout.length} {layout.length === 1 ? "section" : "sections"} · {total} {total === 1 ? "item" : "items"} · Drag items or use the arrows to reorder. Learners see this exact order.
        </p>
        <span className="text-xs font-medium text-muted-foreground">{saving ? "Saving…" : "All changes saved"}</span>
      </div>

      {layout.map((s, si) => (
        <section
          key={s.id}
          onDragOver={(e) => {
            if (!drag.current) return;
            e.preventDefault();
            setOver(`s:${s.id}`);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver((o) => (o === `s:${s.id}` ? null : o));
          }}
          onDrop={(e) => {
            e.preventDefault();
            const d = drag.current;
            endDrag();
            if (d?.kind === "item") moveItem(d.id, s.id, null);
            else if (d?.kind === "section") moveSection(layout.findIndex((x) => x.id === d.id), si);
          }}
          className={cn("rounded-2xl border bg-white transition-shadow", over === `s:${s.id}` ? "border-herb-green ring-2 ring-herb-green/15" : "border-border")}
        >
          <header className="flex items-start gap-2 border-b border-border px-4 py-3.5 sm:px-5">
            <span
              draggable
              onDragStart={(e) => {
                drag.current = { kind: "section", id: s.id };
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragEnd={endDrag}
              title="Drag to reorder sections"
              className="mt-1 cursor-grab text-muted-foreground/50 hover:text-muted-foreground active:cursor-grabbing"
            >
              <GripVertical size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold uppercase tracking-wider text-herb-green">Section {si + 1}</p>
              <h3 className="font-display text-base font-bold text-foreground">{s.title}</h3>
              {s.description && <p className="mt-0.5 text-xs text-muted-foreground">{s.description}</p>}
            </div>
            <span className="mt-1 hidden rounded-full bg-background px-2.5 py-1 text-[11px] font-semibold text-muted-foreground sm:inline">{s.items.length} {s.items.length === 1 ? "item" : "items"}</span>
            <div className="flex items-center">
              <button disabled={si === 0 || saving} onClick={() => moveSection(si, si - 1)} className={iconBtn} aria-label="Move section up"><ChevronUp size={16} /></button>
              <button disabled={si === layout.length - 1 || saving} onClick={() => moveSection(si, si + 1)} className={iconBtn} aria-label="Move section down"><ChevronDown size={16} /></button>
              <button onClick={() => setSectionForm({ id: s.id, title: s.title, description: s.description })} className={iconBtn} aria-label="Rename section"><Pencil size={15} /></button>
              <button
                disabled={layout.length === 1}
                title={layout.length === 1 ? "A course needs at least one section" : undefined}
                onClick={() =>
                  setConfirm({
                    title: "Delete section",
                    message: <>Delete <b>{s.title}</b>{s.items.length ? <> and its {s.items.length} {s.items.length === 1 ? "item" : "items"} (including uploaded files and quiz questions)</> : null}? This cannot be undone.</>,
                    run: async () => {
                      await adminLearningApi.deleteSection(courseId, s.id);
                      toast.success("Section deleted");
                      onChanged();
                    },
                  })
                }
                className={cn(iconBtn, "hover:text-red-600")}
                aria-label="Delete section"
              >
                <Trash2 size={15} />
              </button>
            </div>
          </header>

          <ul className="divide-y divide-border">
            {s.items.map((item, ii) => {
              const m = CONTENT_META[item.type];
              const Icon = m.icon;
              const info = itemMeta(item);
              return (
                <li
                  key={item.id}
                  draggable
                  onDragStart={(e) => {
                    e.stopPropagation();
                    drag.current = { kind: "item", id: item.id };
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragEnd={endDrag}
                  onDragOver={(e) => {
                    if (drag.current?.kind !== "item") return;
                    e.preventDefault();
                    e.stopPropagation();
                    setOver(`i:${item.id}`);
                  }}
                  onDrop={(e) => {
                    if (drag.current?.kind !== "item") return;
                    e.preventDefault();
                    e.stopPropagation();
                    const id = drag.current.id;
                    endDrag();
                    moveItem(id, s.id, item.id);
                  }}
                  className={cn("group flex items-center gap-3 px-4 py-3 sm:px-5", over === `i:${item.id}` && "shadow-[inset_0_2px_0_0_var(--color-herb-green)]")}
                >
                  <span className="cursor-grab text-muted-foreground/40 group-hover:text-muted-foreground active:cursor-grabbing" title="Drag to reorder"><GripVertical size={16} /></span>
                  <span className="w-5 text-right text-xs font-semibold tabular-nums text-muted-foreground">{ii + 1}</span>
                  <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ${m.tint}`}><Icon size={17} /></span>
                  <button onClick={() => setEditor({ mode: "edit", item, sectionTitle: s.title })} className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-sm font-semibold text-foreground hover:text-herb-green">{item.title}</span>
                    <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                      <span className="font-medium">{m.label}</span>
                      {info.text && <span className="truncate">· {info.text}</span>}
                      {info.warning && <span className="flex items-center gap-1 font-semibold text-amber-700"><AlertTriangle size={12} /> {info.warning}</span>}
                    </span>
                  </button>
                  <div className="flex flex-shrink-0 items-center">
                    {(item.type === "assignment" || item.type === "feedback") && (
                      <button onClick={() => setResponses(item)} className={iconBtn} aria-label="View responses" title="View responses"><MessageSquareText size={15} /></button>
                    )}
                    <button disabled={ii === 0 || saving} onClick={() => nudgeItem(s, ii, -1)} className={iconBtn} aria-label="Move up"><ChevronUp size={16} /></button>
                    <button disabled={ii === s.items.length - 1 || saving} onClick={() => nudgeItem(s, ii, 1)} className={iconBtn} aria-label="Move down"><ChevronDown size={16} /></button>
                    <button onClick={() => setEditor({ mode: "edit", item, sectionTitle: s.title })} className={iconBtn} aria-label="Edit"><Pencil size={15} /></button>
                    <button
                      onClick={() =>
                        setConfirm({
                          title: `Delete ${m.label.toLowerCase()}`,
                          message: <>Delete <b>{item.title}</b>?{item.file ? " The uploaded file is deleted too." : ""}{item.quiz ? " Its questions and learner attempts are deleted too." : ""} This cannot be undone.</>,
                          run: async () => {
                            await adminLearningApi.deleteContent(courseId, item.id);
                            toast.success("Deleted");
                            onChanged();
                          },
                        })
                      }
                      className={cn(iconBtn, "hover:text-red-600")}
                      aria-label="Delete"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </li>
              );
            })}
            {s.items.length === 0 && (
              <li className="flex flex-col items-center px-5 py-8 text-center">
                <Inbox size={22} className="text-muted-foreground/40" />
                <p className="mt-2 text-sm text-muted-foreground">This section is empty. Add a video, document, lesson or quiz.</p>
              </li>
            )}
          </ul>

          <div className="border-t border-border px-4 py-3 sm:px-5">
            <button onClick={() => setPicker(s)} className={ghostBtn + " !text-herb-green"}><Plus size={15} /> Add content</button>
          </div>
        </section>
      ))}

      <button onClick={() => setSectionForm({ id: null, title: `Section ${layout.length + 1}`, description: "" })} className="flex w-full items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-border py-4 text-sm font-semibold text-herb-green hover:border-herb-green/50 hover:bg-white">
        <Plus size={16} /> Add section
      </button>

      {picker && (
        <AddContentDialog
          sectionTitle={picker.title}
          onClose={() => setPicker(null)}
          onPick={(type) => {
            setEditor({ mode: "add", type, sectionId: picker.id, sectionTitle: picker.title });
            setPicker(null);
          }}
        />
      )}
      {editor && <ContentEditor courseId={courseId} target={editor} onClose={() => setEditor(null)} onSaved={onChanged} />}
      {responses && <ResponsesDialog courseId={courseId} item={responses} onClose={() => setResponses(null)} />}
      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          message={confirm.message}
          onClose={() => setConfirm(null)}
          onConfirm={async () => {
            try {
              await confirm.run();
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Could not delete");
            }
          }}
        />
      )}
      {sectionForm && (
        <Modal
          title={sectionForm.id ? "Edit section" : "Add section"}
          onClose={() => !saving && setSectionForm(null)}
          busy={saving}
          footer={
            <>
              <button onClick={() => setSectionForm(null)} disabled={saving} className={ghostBtn}>Cancel</button>
              <button onClick={saveSection} disabled={saving} className={primaryBtn}>{saving ? "Saving…" : sectionForm.id ? "Save" : "Add section"}</button>
            </>
          }
        >
          <form onSubmit={(e) => { e.preventDefault(); saveSection(); }} className="space-y-4">
            <Field label="Section title" required>
              <input autoFocus value={sectionForm.title} onChange={(e) => setSectionForm({ ...sectionForm, title: e.target.value })} maxLength={200} placeholder="e.g. Fundamentals" className={inputCls} />
            </Field>
            <Field label="Description (optional)" hint="A short line shown to learners under the section title.">
              <textarea rows={2} value={sectionForm.description} onChange={(e) => setSectionForm({ ...sectionForm, description: e.target.value })} maxLength={2000} className={inputCls} />
            </Field>
          </form>
        </Modal>
      )}
    </div>
  );
}
