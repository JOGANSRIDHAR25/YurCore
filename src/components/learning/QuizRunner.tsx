"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import { CheckCircle2, Clock, RotateCcw, Trophy, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AttemptResult, AttemptStart, ContentItem, ItemProgress } from "@/shared/learning/types";

const LETTERS = ["A", "B", "C", "D", "E", "F"];

type Phase = { name: "intro" } | { name: "running"; attempt: AttemptStart } | { name: "result"; attempt: AttemptStart; result: AttemptResult };

function Countdown({ endsAt, onExpire }: { endsAt: number; onExpire: () => void }) {
  const [left, setLeft] = useState(() => Math.max(0, endsAt - Date.now()));
  const fired = useRef(false);
  useEffect(() => {
    const t = setInterval(() => {
      const l = Math.max(0, endsAt - Date.now());
      setLeft(l);
      if (l === 0 && !fired.current) {
        fired.current = true;
        onExpire();
      }
    }, 500);
    return () => clearInterval(t);
  }, [endsAt, onExpire]);
  const s = Math.ceil(left / 1000);
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold tabular-nums", s <= 60 ? "bg-red-50 text-red-600" : "bg-neutral-100 text-foreground")}>
      <Clock size={13} /> {Math.floor(s / 60)}:{String(s % 60).padStart(2, "0")}
    </span>
  );
}

/** Takes a quiz (or single question): intro → one question at a time → result with review. */
export function QuizRunner({ item, progress, onStart, onSubmit, onNext }: { item: ContentItem; progress: ItemProgress | undefined; onStart: () => Promise<AttemptStart>; onSubmit: (attemptId: string, answers: Record<string, string>) => Promise<AttemptResult>; onNext?: () => void }) {
  const quiz = item.quiz!;
  const single = item.type === "question";
  const [phase, setPhase] = useState<Phase>({ name: "intro" });
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const answersRef = useRef(answers);
  answersRef.current = answers;

  const used = progress?.attemptsUsed ?? 0;
  const left = quiz.attemptsAllowed === null ? null : Math.max(0, quiz.attemptsAllowed - used);

  async function begin() {
    setBusy(true);
    try {
      const attempt = await onStart();
      setAnswers({});
      setIndex(0);
      setPhase({ name: "running", attempt });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start the quiz");
    } finally {
      setBusy(false);
    }
  }

  const submit = useCallback(async (attempt: AttemptStart) => {
    setBusy(true);
    try {
      const result = await onSubmit(attempt.attemptId, answersRef.current);
      setPhase({ name: "result", attempt, result });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not submit");
    } finally {
      setBusy(false);
    }
  }, [onSubmit]);

  if (phase.name === "intro") {
    const stats = single
      ? []
      : [
          ["Questions", String(quiz.questionCount)],
          ["Passing score", `${quiz.passingScore}%`],
          ["Time limit", quiz.timeLimitMinutes ? `${quiz.timeLimitMinutes} min` : "None"],
          ["Attempts", quiz.attemptsAllowed === null ? "Unlimited" : `${used} of ${quiz.attemptsAllowed} used`],
        ];
    return (
      <div className="space-y-5">
        {stats.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {stats.map(([k, v]) => (
              <div key={k} className="rounded-xl bg-neutral-50 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{k}</p>
                <p className="mt-0.5 text-sm font-bold text-foreground">{v}</p>
              </div>
            ))}
          </div>
        )}
        {progress?.bestScore !== null && progress?.bestScore !== undefined && (
          <div className={cn("flex items-center gap-3 rounded-xl px-4 py-3 text-sm", progress.passed ? "bg-herb-green/10 text-herb-green" : "bg-amber-50 text-amber-800")}>
            {progress.passed ? <Trophy size={18} /> : <RotateCcw size={18} />}
            <span className="font-semibold">{single ? (progress.passed ? "You answered correctly." : "Your last answer was not correct.") : `Best score ${progress.bestScore}% · ${progress.passed ? "Passed" : "Not passed yet"}`}</span>
          </div>
        )}
        {quiz.questionCount === 0 ? (
          <p className="rounded-xl bg-neutral-50 px-4 py-3 text-sm text-muted-foreground">This quiz has no questions yet.</p>
        ) : (
          <button onClick={begin} disabled={busy || left === 0} className="rounded-xl bg-copper px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
            {busy ? "Starting…" : left === 0 ? "No attempts left" : used > 0 ? (single ? "Answer again" : "Retake quiz") : single ? "Answer the question" : "Start quiz"}
          </button>
        )}
      </div>
    );
  }

  if (phase.name === "running") {
    const { attempt } = phase;
    const q = attempt.questions[index];
    const last = index === attempt.questions.length - 1;
    const answered = Object.keys(answers).length;
    const endsAt = attempt.timeLimitMinutes ? new Date(attempt.startedAt).getTime() + attempt.timeLimitMinutes * 60000 : null;
    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-semibold text-foreground">{single ? "Question" : `Question ${index + 1} of ${attempt.questions.length}`}</p>
          <div className="flex items-center gap-3">
            {!single && <span className="text-xs text-muted-foreground">{answered} answered</span>}
            {endsAt && <Countdown endsAt={endsAt} onExpire={() => { toast("Time is up. Your answers were submitted."); submit(attempt); }} />}
          </div>
        </div>
        {!single && (
          <div className="flex gap-1">
            {attempt.questions.map((x, i) => (
              <button key={x.id} onClick={() => setIndex(i)} aria-label={`Go to question ${i + 1}`} className={cn("h-1.5 flex-1 rounded-full transition-colors", i === index ? "bg-copper" : answers[x.id] ? "bg-copper/40" : "bg-neutral-200")} />
            ))}
          </div>
        )}
        <p className="whitespace-pre-line text-base font-semibold leading-relaxed text-foreground">{q.question}</p>
        <div className="space-y-2.5" role="radiogroup" aria-label="Answer options">
          {q.options.map((o, j) => {
            const chosen = answers[q.id] === o.id;
            return (
              <button key={o.id} role="radio" aria-checked={chosen} onClick={() => setAnswers({ ...answers, [q.id]: o.id })} className={cn("flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-colors", chosen ? "border-copper bg-copper/5 ring-2 ring-copper/15" : "border-border hover:bg-neutral-50")}>
                <span className={cn("flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold", chosen ? "bg-copper text-white" : "bg-neutral-100 text-muted-foreground")}>{LETTERS[j]}</span>
                <span className="text-foreground">{o.text}</span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
          <button onClick={() => setIndex(index - 1)} disabled={index === 0} className="rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-neutral-50 disabled:invisible">Previous</button>
          {last ? (
            <button
              onClick={() => {
                const missing = attempt.questions.length - Object.keys(answers).length;
                if (missing > 0 && !window.confirm(`${missing} question${missing === 1 ? " is" : "s are"} not answered. Submit anyway?`)) return;
                submit(attempt);
              }}
              disabled={busy || (single && !answers[q.id])}
              className="rounded-xl bg-copper px-5 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Submitting…" : single ? "Check answer" : "Submit quiz"}
            </button>
          ) : (
            <button onClick={() => setIndex(index + 1)} className="rounded-xl bg-copper px-5 py-2 text-sm font-semibold text-white hover:opacity-90">Next</button>
          )}
        </div>
      </div>
    );
  }

  const { attempt, result } = phase;
  // The intro screen re-checks the remaining attempts (from refreshed progress) before a new attempt.
  const canRetry = !result.passed;
  return (
    <div className="space-y-5">
      <div className={cn("flex flex-col items-center rounded-2xl px-6 py-7 text-center", result.passed ? "bg-herb-green/10" : "bg-amber-50")}>
        {result.passed ? <CheckCircle2 size={36} className="text-herb-green" /> : <XCircle size={36} className="text-amber-600" />}
        <p className="mt-2 font-display text-3xl font-bold text-foreground">{single ? (result.passed ? "Correct" : "Not quite") : `${result.scorePercent}%`}</p>
        <p className="mt-1 text-sm text-foreground/80">
          {single ? (result.passed ? "Well done." : "Review the explanation below.") : `${result.correct} of ${result.total} correct · ${result.passed ? "Passed" : `You need ${result.passingScore}% to pass`}`}
        </p>
      </div>

      <div className="space-y-3">
        {attempt.questions.map((q, i) => {
          const r = result.review.find((x) => x.questionId === q.id);
          return (
            <div key={q.id} className="rounded-xl border border-border p-4">
              <p className="text-sm font-semibold text-foreground">{single ? "" : `${i + 1}. `}{q.question}</p>
              <ul className="mt-2 space-y-1.5">
                {q.options.map((o, j) => {
                  const isCorrect = r?.correctOptionId === o.id;
                  const isChosen = r?.chosen === o.id;
                  return (
                    <li key={o.id} className={cn("flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm", isCorrect ? "bg-herb-green/10 text-herb-green" : isChosen ? "bg-red-50 text-red-700" : "text-foreground/70")}>
                      <span className="w-4 text-xs font-bold">{LETTERS[j]}</span>
                      <span className="flex-1">{o.text}</span>
                      {isCorrect && <span className="text-[11px] font-semibold">Correct answer</span>}
                      {isChosen && !isCorrect && <span className="text-[11px] font-semibold">Your answer</span>}
                    </li>
                  );
                })}
              </ul>
              {!r?.chosen && <p className="mt-1.5 text-xs text-muted-foreground">Not answered</p>}
              {r?.explanation && <p className="mt-2 rounded-lg bg-neutral-50 px-3 py-2 text-xs text-foreground/80">{r.explanation}</p>}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        {canRetry && <button onClick={() => setPhase({ name: "intro" })} className="rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-neutral-50">Try again</button>}
        {onNext && <button onClick={onNext} className="rounded-xl bg-copper px-5 py-2 text-sm font-semibold text-white hover:opacity-90">Continue</button>}
      </div>
    </div>
  );
}
