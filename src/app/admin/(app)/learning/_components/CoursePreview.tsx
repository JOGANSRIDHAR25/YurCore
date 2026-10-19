"use client";

import { useMemo, useState } from "react";
import { Eye } from "lucide-react";
import type { AttemptResult, AttemptStart, ItemProgress } from "@/shared/learning/types";
import { CoursePlayer, type PlayerHandlers } from "@/components/learning/CoursePlayer";
import type { AdminCourse, Section } from "../_lib/api";

/**
 * The learner course page, driven by local state: admins can click through, play media and try
 * quizzes exactly as practitioners will, without anything being recorded.
 */
export function CoursePreview({ course, sections }: { course: AdminCourse; sections: Section[] }) {
  const [progress, setProgress] = useState<Record<string, ItemProgress>>({});
  const [started, setStarted] = useState(false);
  const items = useMemo(() => sections.flatMap((s) => s.items), [sections]);

  const mark = (id: string, patch: Partial<ItemProgress>) => setProgress((p) => ({ ...p, [id]: { ...(p[id] ?? { completed: false }), ...patch } }));

  const handlers: PlayerHandlers = {
    start: async () => setStarted(true),
    complete: async (id) => mark(id, { completed: true }),
    startAttempt: async (id) => {
      const quiz = items.find((i) => i.id === id)?.quiz;
      const attempt: AttemptStart = {
        attemptId: `preview-${Date.now()}`,
        startedAt: new Date().toISOString(),
        timeLimitMinutes: quiz?.timeLimitMinutes ?? null,
        questions: (quiz?.questions ?? []).map((q, qi) => ({ id: q.id ?? `q${qi}`, question: q.question, options: q.options.map((o, oi) => ({ id: o.id ?? `q${qi}o${oi}`, text: o.text })) })),
      };
      return attempt;
    },
    submitAttempt: async (id, _attemptId, answers) => {
      const item = items.find((i) => i.id === id)!;
      const quiz = item.quiz!;
      const review = (quiz.questions ?? []).map((q, qi) => {
        const qid = q.id ?? `q${qi}`;
        const ci = q.options.findIndex((o) => o.correct);
        return { questionId: qid, chosen: answers[qid] ?? null, correctOptionId: q.options[ci]?.id ?? `q${qi}o${ci}`, explanation: q.explanation };
      });
      const correct = review.filter((r) => r.chosen === r.correctOptionId).length;
      const total = review.length;
      const scorePercent = total ? Math.round((correct / total) * 100) : 0;
      const passed = scorePercent >= quiz.passingScore;
      const prev = progress[id];
      mark(id, {
        completed: prev?.completed || passed || item.type === "question",
        attemptsUsed: (prev?.attemptsUsed ?? 0) + 1,
        bestScore: Math.max(prev?.bestScore ?? 0, scorePercent),
        passed: Boolean(prev?.passed) || passed,
      });
      return { scorePercent, correct, total, passed, passingScore: quiz.passingScore, review } satisfies AttemptResult;
    },
    respond: async (id, input) => mark(id, { completed: true, response: { text: input.text, rating: input.rating, submittedAt: new Date().toISOString() } }),
  };

  const completed = items.filter((i) => progress[i.id]?.completed).length;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <span className="flex items-center gap-2"><Eye size={16} /> Preview: this is exactly what practitioners see. Nothing you do here is saved.</span>
        {(started || completed > 0) && <button onClick={() => { setProgress({}); setStarted(false); }} className="text-xs font-semibold underline">Reset preview</button>}
      </div>
      {items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border bg-white py-12 text-center text-sm text-muted-foreground">Add content in the Build content tab to preview the course.</p>
      ) : (
        <CoursePlayer
          course={course}
          sections={sections}
          progress={progress}
          enrolled={started}
          courseProgress={started ? { completed, total: items.length, percent: items.length ? Math.round((completed / items.length) * 100) : 0 } : null}
          handlers={handlers}
        />
      )}
    </div>
  );
}
