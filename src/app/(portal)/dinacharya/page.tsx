"use client";

import { useState, useEffect } from "react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/auth-context";
import { useDinacharyaTasks, toggleDinacharyaTaskApi } from "@/hooks/use-dinacharya";
import type { DinacharTask } from "@/lib/types";

type TimeBlock = "morning" | "midday" | "evening" | "night";

const BLOCK_META: Record<TimeBlock, { label: string; range: string; icon: string; color: string }> = {
  morning: { label: "Morning Routine", range: "5:30 – 8:00 AM", icon: "🌅", color: "text-amber-600 bg-amber-50 border-amber-100" },
  midday: { label: "Midday Practices", range: "12:00 – 2:00 PM", icon: "☀️", color: "text-orange-600 bg-orange-50 border-orange-100" },
  evening: { label: "Evening Routine", range: "5:00 – 8:00 PM", icon: "🌤️", color: "text-blue-600 bg-blue-50 border-blue-100" },
  night: { label: "Night Routine", range: "8:00 – 10:00 PM", icon: "🌙", color: "text-indigo-600 bg-indigo-50 border-indigo-100" },
};

const categoryIcon: Record<string, string> = {
  diet: "🥗",
  exercise: "🧘",
  mindfulness: "🌬️",
  medicine: "🌿",
};

function getTimeBlock(timeStr: string): TimeBlock {
  if (!timeStr) return "morning";
  const [h] = timeStr.split(":");
  const hour = parseInt(h, 10);
  if (hour < 12) return "morning";
  if (hour < 15) return "midday";
  if (hour < 20) return "evening";
  return "night";
}

export default function DinacharyaPage() {
  const { user } = useAuth();
  const { data: dbTasks, loading } = useDinacharyaTasks(user?.id);
  const [tasks, setTasks] = useState<DinacharTask[]>([]);

  useEffect(() => {
    if (dbTasks && dbTasks.length > 0) setTasks(dbTasks);
  }, [dbTasks]);

  const done = tasks.filter((t) => t.done).length;
  const total = tasks.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  function toggle(id: string) {
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id === id) {
          const newDone = !t.done;
          toggleDinacharyaTaskApi(id, newDone);
          return { ...t, done: newDone };
        }
        return t;
      })
    );
  }

  const blocks: TimeBlock[] = ["morning", "midday", "evening", "night"];

  // Group tasks by time block
  const tasksByBlock = (block: TimeBlock) =>
    tasks.filter((t) => getTimeBlock(t.time) === block);

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-xl font-semibold text-foreground">Dinacharya</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-100 px-3 py-1.5 rounded-full">
            <span className="text-sm">🔥</span>
            <span className="text-xs font-semibold text-amber-700">{done > 0 ? `${done} done` : "Start your streak!"}</span>
          </div>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="bg-white rounded-2xl border border-border p-5 h-32 animate-pulse">
              <div className="w-1/3 h-4 bg-muted rounded mb-2" />
              <div className="w-1/2 h-3 bg-muted rounded" />
            </div>
          ))}
        </div>
      )}

      {/* Empty */}
      {!loading && tasks.length === 0 && (
        <div className="bg-white rounded-2xl border border-border p-12 text-center">
          <span className="text-4xl">🌅</span>
          <p className="font-semibold text-foreground mt-3">No Dinacharya plan yet</p>
          <p className="text-xs text-muted-foreground mt-1">Your practitioner will create a personalized daily routine for you after your consultation.</p>
        </div>
      )}

      {/* Content */}
      {!loading && tasks.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
          {/* Left: Task blocks */}
          <div className="space-y-5">
            {/* Today's progress */}
            <div className="bg-white rounded-2xl border border-border p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-foreground">Today&apos;s Progress</span>
                <span className="font-display text-2xl font-bold text-herb-green">{pct}%</span>
              </div>
              <Progress value={pct} className="h-2.5 bg-sand" />
              <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                <span>{done} of {total} practices completed</span>
                <span>{total - done} remaining</span>
              </div>
            </div>

            {/* Task blocks */}
            {blocks.map((block) => {
              const blockTasks = tasksByBlock(block);
              if (blockTasks.length === 0) return null;
              const blockDone = blockTasks.filter((t) => t.done).length;
              const meta = BLOCK_META[block];
              return (
                <div key={block} className="bg-white rounded-2xl border border-border overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
                    <div className="flex items-center gap-2.5">
                      <span className="text-lg">{meta.icon}</span>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{meta.label}</p>
                        <p className="text-[10px] text-muted-foreground">{meta.range}</p>
                      </div>
                    </div>
                    <span className={cn("text-[10px] font-semibold px-2.5 py-1 rounded-full border", meta.color)}>
                      {blockDone}/{blockTasks.length}
                    </span>
                  </div>
                  <div className="divide-y divide-border">
                    {blockTasks.map((task) => (
                      <button
                        key={task.id}
                        onClick={() => toggle(task.id)}
                        className={cn(
                          "w-full flex items-center gap-3 px-5 py-3.5 text-left transition-all hover:bg-muted/40",
                          task.done && "bg-herb-green/2"
                        )}
                      >
                        <div
                          className={cn(
                            "w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all",
                            task.done ? "border-herb-green bg-herb-green" : "border-muted-foreground/30"
                          )}
                        >
                          {task.done && (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={3}>
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </div>
                        <span className="text-base flex-shrink-0">{categoryIcon[task.category] ?? "🌿"}</span>
                        <div className="flex-1 min-w-0">
                          <p className={cn("text-sm font-medium", task.done ? "line-through text-muted-foreground" : "text-foreground")}>
                            {task.title}
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{task.description}</p>
                        </div>
                        <span className="text-xs text-muted-foreground flex-shrink-0 font-mono">{task.time}</span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right: Stats */}
          <div className="space-y-4">
            {/* Wellness impact */}
            <div className="bg-white rounded-2xl border border-border p-5">
              <h3 className="font-semibold text-foreground text-sm mb-3">Wellness Score Impact</h3>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground">Current</span>
                <span className="font-display text-2xl font-bold text-herb-green">{pct}</span>
              </div>
              <Progress value={pct} className="h-2 bg-sand mb-3" />
              <div className="space-y-2">
                {[
                  { label: "Dinacharya adherence", contrib: `+${done}` },
                  { label: "Consistency bonus", contrib: pct >= 80 ? "+5" : "+0" },
                ].map((item) => (
                  <div key={item.label} className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{item.label}</span>
                    <span className="text-herb-green font-medium">{item.contrib}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Prakriti tip */}
            <div className="bg-ivory-deep rounded-2xl border border-border p-5">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">🌿</span>
                <h3 className="font-semibold text-foreground text-sm">Daily Tip</h3>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Consistent Dinacharya is especially grounding — irregular routines aggravate Vata and disrupt digestion. Complete your morning routine first for best results.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
