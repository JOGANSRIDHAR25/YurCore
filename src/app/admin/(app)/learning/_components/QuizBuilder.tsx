"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Copy, Pencil, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Quiz, QuizQuestion } from "../_lib/api";
import { ConfirmDialog, Field, iconBtn, inputCls } from "./ui";

const LETTERS = ["A", "B", "C", "D", "E", "F"];
export const OPTION_COUNT = 4;

export const emptyQuestion = (): QuizQuestion => ({ question: "", explanation: "", options: Array.from({ length: OPTION_COUNT }, (_, i) => ({ text: "", correct: i === 0 })) });
export const emptyQuiz = (single: boolean): Quiz => ({ passingScore: single ? 100 : 70, timeLimitMinutes: null, attemptsAllowed: null, questions: [emptyQuestion()] });

/** Returns the first problem (with the question index) or null when the quiz can be saved. */
export function quizProblem(quiz: Quiz, single: boolean): { message: string; index?: number } | null {
  if (quiz.questions.length === 0) return { message: single ? "Write the question" : "Add at least one question" };
  for (const [i, q] of quiz.questions.entries()) {
    const n = single ? "the question" : `question ${i + 1}`;
    if (!q.question.trim()) return { message: `Write the text of ${n}`, index: i };
    if (q.options.some((o) => !o.text.trim())) return { message: `Fill in all ${q.options.length} options of ${n}`, index: i };
    if (q.options.filter((o) => o.correct).length !== 1) return { message: `Choose the correct answer for ${n}`, index: i };
  }
  return null;
}

const numOrNull = (v: string) => (v.trim() === "" ? null : Math.max(1, Math.round(Number(v)) || 1));

export function QuizBuilder({ value, onChange, single = false, invalidIndex }: { value: Quiz; onChange: (q: Quiz) => void; single?: boolean; invalidIndex?: number }) {
  const [open, setOpen] = useState<number>(value.questions.length === 1 || single ? 0 : -1);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const qs = value.questions;
  const setQuestions = (questions: QuizQuestion[]) => onChange({ ...value, questions });
  const updateQ = (i: number, q: QuizQuestion) => setQuestions(qs.map((x, j) => (j === i ? q : x)));
  const move = (i: number, d: -1 | 1) => {
    const next = [...qs];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    setQuestions(next);
    setOpen((o) => (o === i ? i + d : o === i + d ? i : o));
  };
  const add = () => {
    setQuestions([...qs, emptyQuestion()]);
    setOpen(qs.length);
  };
  const duplicate = (i: number) => {
    const copy: QuizQuestion = { ...qs[i], id: undefined, options: qs[i].options.map((o) => ({ text: o.text, correct: o.correct })) };
    setQuestions([...qs.slice(0, i + 1), copy, ...qs.slice(i + 1)]);
    setOpen(i + 1);
  };

  return (
    <div className="space-y-5">
      {!single && (
        <div className="rounded-2xl border border-border bg-background/50 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-foreground">Quiz settings</h3>
            <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-foreground ring-1 ring-border">
              {qs.length} {qs.length === 1 ? "question" : "questions"} · Pass {value.passingScore}%
            </span>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Field label="Passing score (%)" hint="Minimum score to pass.">
              <input type="number" min={0} max={100} value={value.passingScore} onChange={(e) => onChange({ ...value, passingScore: Math.min(100, Math.max(0, Math.round(Number(e.target.value)) || 0)) })} className={inputCls} />
            </Field>
            <Field label="Time limit (minutes)" hint="Leave empty for no limit.">
              <input type="number" min={1} placeholder="No limit" value={value.timeLimitMinutes ?? ""} onChange={(e) => onChange({ ...value, timeLimitMinutes: numOrNull(e.target.value) })} className={inputCls} />
            </Field>
            <Field label="Attempts allowed" hint="Leave empty for unlimited.">
              <input type="number" min={1} placeholder="Unlimited" value={value.attemptsAllowed ?? ""} onChange={(e) => onChange({ ...value, attemptsAllowed: numOrNull(e.target.value) })} className={inputCls} />
            </Field>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {qs.map((q, i) => {
          const correct = q.options.findIndex((o) => o.correct);
          const expanded = open === i;
          const invalid = invalidIndex === i;
          return (
            <div key={i} className={cn("rounded-2xl border bg-white", invalid ? "border-red-300 ring-2 ring-red-100" : expanded ? "border-herb-green/40 ring-2 ring-herb-green/10" : "border-border")}>
              <div className="flex items-center gap-2 px-4 py-3">
                <span className="flex h-7 min-w-7 items-center justify-center rounded-lg bg-herb-green/10 px-2 text-xs font-bold text-herb-green">{single ? "Q" : i + 1}</span>
                <button type="button" onClick={() => setOpen(expanded ? -1 : i)} className="min-w-0 flex-1 text-left">
                  <p className="text-xs font-semibold text-muted-foreground">{single ? "Question" : `Question ${i + 1} of ${qs.length}`}</p>
                  {!expanded && <p className="truncate text-sm font-medium text-foreground">{q.question || <span className="text-muted-foreground">No question text yet</span>}</p>}
                </button>
                {!expanded && correct >= 0 && q.options[correct]?.text && <span className="hidden rounded-full bg-herb-green/10 px-2.5 py-1 text-[11px] font-semibold text-herb-green sm:inline">Correct: {LETTERS[correct]}</span>}
                {!single && (
                  <div className="flex items-center">
                    <button type="button" disabled={i === 0} onClick={() => move(i, -1)} className={iconBtn} aria-label="Move question up"><ChevronUp size={16} /></button>
                    <button type="button" disabled={i === qs.length - 1} onClick={() => move(i, 1)} className={iconBtn} aria-label="Move question down"><ChevronDown size={16} /></button>
                    <button type="button" onClick={() => duplicate(i)} className={iconBtn} aria-label="Duplicate question"><Copy size={15} /></button>
                    {!expanded && <button type="button" onClick={() => setOpen(i)} className={iconBtn} aria-label="Edit question"><Pencil size={15} /></button>}
                    <button type="button" disabled={qs.length === 1} onClick={() => setConfirmDelete(i)} className={cn(iconBtn, "hover:text-red-600")} aria-label="Delete question"><Trash2 size={15} /></button>
                  </div>
                )}
              </div>

              {expanded && (
                <div className="space-y-4 border-t border-border px-4 pb-5 pt-4">
                  <Field label="Question" required>
                    <textarea rows={2} value={q.question} onChange={(e) => updateQ(i, { ...q, question: e.target.value })} placeholder="e.g. Which dosha governs movement in the body?" className={inputCls} autoFocus={!q.question} />
                  </Field>
                  <div>
                    <p className="mb-2 text-[13px] font-semibold text-foreground">Options <span className="font-normal text-muted-foreground">· select the correct answer</span></p>
                    <div className="space-y-2">
                      {q.options.map((o, j) => (
                        <div key={j} className={cn("flex items-center gap-2 rounded-xl border p-1.5 pl-2 transition-colors", o.correct ? "border-herb-green/50 bg-herb-green/5" : "border-border")}>
                          <button
                            type="button"
                            role="radio"
                            aria-checked={o.correct}
                            aria-label={`Mark option ${LETTERS[j]} as correct`}
                            onClick={() => updateQ(i, { ...q, options: q.options.map((x, k) => ({ ...x, correct: k === j })) })}
                            className={cn("flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-xs font-bold transition-colors", o.correct ? "bg-herb-green text-white" : "bg-background text-muted-foreground ring-1 ring-border hover:text-foreground")}
                          >
                            {LETTERS[j]}
                          </button>
                          <input value={o.text} onChange={(e) => updateQ(i, { ...q, options: q.options.map((x, k) => (k === j ? { ...x, text: e.target.value } : x)) })} placeholder={`Option ${LETTERS[j]}`} className="min-w-0 flex-1 bg-transparent px-1 py-1.5 text-sm outline-none" />
                          {o.correct && <span className="pr-2 text-[11px] font-semibold text-herb-green">Correct answer</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                  <Field label="Correct answer">
                    <select value={correct} onChange={(e) => updateQ(i, { ...q, options: q.options.map((x, k) => ({ ...x, correct: k === Number(e.target.value) })) })} className={inputCls + " sm:!w-56"}>
                      {q.options.map((_, j) => <option key={j} value={j}>Option {LETTERS[j]}</option>)}
                    </select>
                  </Field>
                  <Field label="Explanation (optional)" hint="Shown to the learner after they submit.">
                    <textarea rows={2} value={q.explanation} onChange={(e) => updateQ(i, { ...q, explanation: e.target.value })} className={inputCls} />
                  </Field>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!single && (
        <button type="button" onClick={add} className="flex w-full items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-border py-3.5 text-sm font-semibold text-herb-green hover:border-herb-green/50 hover:bg-herb-green/5">
          <Plus size={16} /> Add question
        </button>
      )}

      {confirmDelete !== null && (
        <ConfirmDialog
          title="Delete question"
          message={<>Delete question {confirmDelete + 1}{qs[confirmDelete]?.question ? <> “{qs[confirmDelete].question}”</> : null}? This is applied when you save the quiz.</>}
          onConfirm={() => {
            setQuestions(qs.filter((_, j) => j !== confirmDelete));
            setOpen(-1);
          }}
          onClose={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}
