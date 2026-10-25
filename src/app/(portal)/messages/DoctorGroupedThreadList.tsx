"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, User, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PatientInboxThread } from "./type";
import { groupThreadsByDoctor, patientRoleLabel } from "./grouping";

const COLLAPSED_KEY = "yurcore:messages:collapsed-doctors";

function readCollapsed(): Set<string> {
  try {
    const raw = localStorage.getItem(COLLAPSED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function writeCollapsed(ids: Set<string>) {
  try {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...ids]));
  } catch {
    // Storage unavailable: the state just isn't remembered.
  }
}

interface Props {
  threads: PatientInboxThread[];
  search: string;
  activeId: string | null;
  onSelect: (id: string) => void;
}

/**
 * Patient inbox list: each doctor once, with one row per patient (you or a family
 * member). Groups start expanded and remember being collapsed; the group holding
 * the open conversation always stays expanded.
 */
export function DoctorGroupedThreadList({ threads, search, activeId, onSelect }: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  useEffect(() => setCollapsed(readCollapsed()), []);

  const groups = useMemo(() => groupThreadsByDoctor(threads, search), [threads, search]);
  const activePractitionerId = threads.find((t) => t.id === activeId)?.practitionerId ?? null;
  const searching = search.trim() !== "";

  function toggle(practitionerId: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(practitionerId)) next.delete(practitionerId);
      else next.add(practitionerId);
      writeCollapsed(next);
      return next;
    });
  }

  if (groups.length === 0) {
    return (
      <div className="px-6 py-10 text-center">
        <p className="text-sm font-semibold text-slate-800">No matching conversations</p>
        <p className="text-xs text-slate-500 mt-1">No doctor or patient matches &ldquo;{search.trim()}&rdquo;.</p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-slate-100">
      {groups.map((group) => {
        const containsActive = group.practitionerId === activePractitionerId;
        // Searching shows every match; the open conversation's doctor never collapses.
        const expanded = searching || containsActive || !collapsed.has(group.practitionerId);
        const count = group.threads.length;
        return (
          <li key={group.practitionerId}>
            <button
              type="button"
              onClick={() => !containsActive && !searching && toggle(group.practitionerId)}
              aria-expanded={expanded}
              aria-disabled={containsActive || searching}
              title={containsActive ? "Contains the open conversation" : undefined}
              className={cn(
                "w-full flex items-center gap-3 px-5 py-3 text-left transition-colors",
                containsActive || searching ? "cursor-default" : "hover:bg-slate-50"
              )}
            >
              <div className="w-9 h-9 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center flex-shrink-0">
                <span className="text-[11px] font-bold text-slate-700">{group.doctorInitials}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13.5px] font-semibold text-slate-900 truncate">{group.doctorName}</p>
                <p className="text-[11px] text-slate-500">
                  {count} {count === 1 ? "conversation" : "conversations"}
                </p>
              </div>
              {group.unreadCount > 0 && !expanded && (
                <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-herb-green text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                  {group.unreadCount > 99 ? "99+" : group.unreadCount}
                </span>
              )}
              {!containsActive && !searching && (
                <ChevronDown className={cn("w-4 h-4 text-slate-400 transition-transform flex-shrink-0", expanded ? "" : "-rotate-90")} />
              )}
            </button>

            {expanded && (
              <ul className="pb-2">
                {group.threads.map((t) => {
                  const selected = t.id === activeId;
                  const Icon = t.isFamilyMember ? Users : User;
                  return (
                    <li key={t.id} className="px-3">
                      <button
                        type="button"
                        onClick={() => onSelect(t.id)}
                        aria-current={selected ? "true" : undefined}
                        className={cn(
                          "relative w-full text-left pl-4 pr-3 py-2.5 ml-6 max-w-[calc(100%-1.5rem)] rounded-lg border flex items-start gap-2.5 transition-colors",
                          selected ? "bg-slate-50 border-slate-300" : "border-transparent hover:bg-slate-50"
                        )}
                      >
                        {selected && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-herb-green" />}
                        <Icon className="w-3.5 h-3.5 text-slate-400 mt-0.5 flex-shrink-0" aria-hidden />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline justify-between gap-2">
                            <p className={cn("text-[13px] truncate text-slate-900", t.unread ? "font-bold" : "font-semibold")}>
                              {t.patientName}
                            </p>
                            <span className="text-[10px] text-slate-400 whitespace-nowrap flex-shrink-0">{t.lastMessageTime}</span>
                          </div>
                          <p className="text-[11px] text-slate-500 truncate">
                            {t.isFamilyMember ? patientRoleLabel(t) : `You · ${patientRoleLabel(t)}`}
                          </p>
                          <div className="flex items-center justify-between gap-2 mt-0.5">
                            <p className={cn("text-xs truncate", !t.hasMessages ? "italic text-slate-400" : t.unread ? "font-medium text-slate-800" : "text-slate-500")}>
                              {t.lastMessage}
                            </p>
                            {t.unreadCount > 0 && (
                              <span
                                className="min-w-[18px] h-[18px] px-1 rounded-full bg-herb-green text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0"
                                aria-label={`${t.unreadCount} unread`}
                              >
                                {t.unreadCount > 99 ? "99+" : t.unreadCount}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}
