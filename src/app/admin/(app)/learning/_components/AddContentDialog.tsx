"use client";

import type { ContentType } from "@/shared/learning/types";
import { ASSESSMENT_TYPES, CONTENT_META, LEARNING_TYPES } from "@/components/learning/content-meta";
import { Modal } from "./ui";

function Group({ title, description, types, onPick }: { title: string; description: string; types: ContentType[]; onPick: (t: ContentType) => void }) {
  return (
    <div>
      <h3 className="text-sm font-bold text-foreground">{title}</h3>
      <p className="mb-3 text-xs text-muted-foreground">{description}</p>
      <div className="grid gap-2.5 sm:grid-cols-2">
        {types.map((t) => {
          const m = CONTENT_META[t];
          const Icon = m.icon;
          return (
            <button key={t} onClick={() => onPick(t)} className="group flex items-start gap-3 rounded-2xl border border-border bg-white p-4 text-left transition-all hover:border-herb-green/50 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-herb-green/30">
              <span className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${m.tint}`}><Icon size={19} /></span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-foreground group-hover:text-herb-green">{m.label}</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{m.description}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Step one of adding content: choose what kind, grouped as learning content vs assessment. */
export function AddContentDialog({ sectionTitle, onPick, onClose }: { sectionTitle: string; onPick: (t: ContentType) => void; onClose: () => void }) {
  return (
    <Modal title="Add content" subtitle={`Adding to: ${sectionTitle}`} onClose={onClose} size="lg">
      <div className="space-y-6">
        <Group title="Learning content" description="Material learners watch, read or download." types={LEARNING_TYPES} onPick={onPick} />
        <div className="h-px bg-border" />
        <Group title="Assessment" description="Check understanding and collect learner input." types={ASSESSMENT_TYPES} onPick={onPick} />
      </div>
    </Modal>
  );
}
