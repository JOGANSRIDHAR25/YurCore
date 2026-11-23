"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle, Building, CalendarDays, CalendarX2, ChevronLeft, ChevronRight, Clock, Coffee,
  Copy, Info, Plus, RotateCcw, Stethoscope, Trash2, Video,
} from "lucide-react";
import toast from "react-hot-toast";

import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/auth-context";
import { usePractitioner } from "@/hooks/use-discover";
import {
  previewAvailabilityChange,
  saveAvailabilityChange,
  updatePractitionerSettings,
  useAvailabilityState,
  useCalendarAvailability,
  useDoctorAppointments,
  useWeeklySchedule,
  type AvailabilityChange,
  type ConflictingAppointment,
  type WeeklyDay,
} from "@/hooks/use-availability";
import {
  AcceptingBookingsSwitch,
  ConfirmCancellationDialog,
  Modal,
  cancellationToast,
  formatDayLabel,
} from "@/components/availability/AvailabilityDialogs";
import {
  DEFAULT_WEEKLY_SCHEDULE,
  WEEKDAY_LABELS,
  WEEKDAY_SHORT,
  checkTimeAgainstPlan,
  datesBetween,
  dbWeekday,
  formatTime12,
  hhmm,
  resolveDayPlan,
  toIsoDate,
  validateHours,
  type DateOverride,
  type TimeRange,
} from "@/shared/availability/schedule";
import { ENABLE_VIDEO_CONSULTATION } from "@/lib/feature-flags";

type Tab = "weekly" | "dates" | "settings";
type Scope = "dates" | "forward";

const CAL_HEADERS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function cloneDefault(): WeeklyDay[] {
  return DEFAULT_WEEKLY_SCHEDULE.map((d) => ({ ...d, breaks: d.breaks.map((b) => ({ ...b })), opTimings: [] }));
}

function normaliseWeekly(rows: WeeklyDay[] | null): WeeklyDay[] {
  if (!rows || rows.length === 0) return cloneDefault();
  return Array.from({ length: 7 }, (_, day) => {
    const row = rows.find((r) => r.dayOfWeek === day);
    if (!row) return { ...cloneDefault()[day], isActive: false };
    return {
      dayOfWeek: day,
      startTime: hhmm(row.startTime) || "09:00",
      endTime: hhmm(row.endTime) || "17:00",
      breaks: (row.breaks ?? []).map((b) => ({ start: hhmm(b.start), end: hhmm(b.end) })),
      opTimings: (row.opTimings ?? []).map((b) => ({ start: hhmm(b.start), end: hhmm(b.end) })),
      isActive: row.isActive,
    };
  });
}

function normaliseOverride(row: Partial<DateOverride> & { date: string }): DateOverride {
  return {
    date: row.date,
    working_start: row.working_start ? hhmm(row.working_start) : null,
    working_end: row.working_end ? hhmm(row.working_end) : null,
    breaks: (row.breaks ?? []).map((b) => ({ start: hhmm(b.start), end: hhmm(b.end) })),
    op_timings: (row.op_timings ?? []).map((b) => ({ start: hhmm(b.start), end: hhmm(b.end) })),
    is_holiday: Boolean(row.is_holiday),
    is_leave: Boolean(row.is_leave),
  };
}

/* -------------------------------------------------------------------------- */
/*                              Small UI pieces                                */
/* -------------------------------------------------------------------------- */

function TimeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="time"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="min-w-0 flex-1 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium focus:border-[#254EDb] focus:outline-none"
    />
  );
}

function RangeList({
  kind,
  ranges,
  onAdd,
  onChange,
  onRemove,
  onApplyAll,
}: {
  kind: "break" | "op";
  ranges: TimeRange[];
  onAdd: () => void;
  onChange: (index: number, range: TimeRange) => void;
  onRemove: (index: number) => void;
  onApplyAll?: (range: TimeRange) => void;
}) {
  const isBreak = kind === "break";
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground">
          <span className={cn("flex h-4 w-4 items-center justify-center rounded-full", isBreak ? "bg-orange-100 text-orange-500" : "bg-blue-100 text-blue-500")}>
            {isBreak ? <Coffee size={10} /> : <Building size={10} />}
          </span>
          {isBreak ? "Breaks" : "OP timings"}
          <span className="font-normal text-neutral-400">{isBreak ? "(no bookings)" : "(walk-in OP, no online bookings)"}</span>
        </span>
        <button type="button" onClick={onAdd} className="flex items-center gap-1 text-[10px] font-bold text-[#254EDb]">
          <Plus size={12} /> Add
        </button>
      </div>
      <div className="space-y-2">
        {ranges.map((r, idx) => (
          <div key={idx} className={cn("flex items-center gap-2 rounded-2xl border p-2", isBreak ? "border-orange-100/60 bg-orange-50/50" : "border-blue-100/60 bg-blue-50/50")}>
            <TimeInput value={r.start} onChange={(v) => onChange(idx, { ...r, start: v })} />
            <span className="text-neutral-300">→</span>
            <TimeInput value={r.end} onChange={(v) => onChange(idx, { ...r, end: v })} />
            {onApplyAll && (
              <button
                type="button"
                title="Use on every working day"
                onClick={() => onApplyAll(r)}
                className="shrink-0 rounded-full p-1.5 text-neutral-400 hover:bg-white hover:text-[#254EDb]"
              >
                <Copy size={13} />
              </button>
            )}
            <button type="button" onClick={() => onRemove(idx)} className="shrink-0 rounded-full p-1.5 text-neutral-400 hover:text-red-500">
              <Trash2 size={13} />
            </button>
          </div>
        ))}
        {ranges.length === 0 && <p className="text-[11px] text-neutral-400">None</p>}
      </div>
    </div>
  );
}

function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      aria-label={label}
      className={cn("relative h-6 w-10 shrink-0 rounded-full transition-all", on ? "bg-[#254EDb]" : "bg-neutral-300")}
    >
      <div className={cn("absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-all", on ? "left-5" : "left-1")} />
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/*                                    Page                                     */
/* -------------------------------------------------------------------------- */

export default function AvailabilityPage() {
  const { user } = useAuth();
  const enabled = Boolean(user?.id);

  const today = useMemo(() => new Date(), []);
  const todayKey = toIsoDate(today);

  const [tab, setTab] = useState<Tab>("weekly");
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("tab");
    if (requested === "dates" || requested === "settings") setTab(requested);
  }, []);

  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [selectedDate, setSelectedDate] = useState<string>(todayKey);

  const monthStart = toIsoDate(new Date(currentYear, currentMonth, 1));
  const monthEnd = toIsoDate(new Date(currentYear, currentMonth + 1, 0));

  /* ------------------------------ server data ------------------------------ */
  const { data: practitioner, refetch: refetchPractitioner } = usePractitioner(user?.id);
  const { data: state, refetch: refetchState } = useAvailabilityState(enabled);
  const { data: weeklyDb, loading: weeklyLoading, refetch: refetchWeekly } = useWeeklySchedule(enabled);
  const { data: overridesDb, refetch: refetchOverrides } = useCalendarAvailability(user?.id, monthStart, monthEnd);
  const { data: monthAppointments, refetch: refetchAppointments } = useDoctorAppointments(enabled, monthStart, monthEnd);

  const needsSetup = Boolean(state && !state.configured);

  /* ------------------------------- local edits ----------------------------- */
  const [weekly, setWeekly] = useState<WeeklyDay[]>(cloneDefault);
  const [weeklyDirty, setWeeklyDirty] = useState(false);
  const [dateEdits, setDateEdits] = useState<Record<string, DateOverride | null>>({});
  const [applyAllPrompt, setApplyAllPrompt] = useState<{ kind: "break" | "op"; day: number; index: number } | null>(null);

  const [consultationMode, setConsultationMode] = useState<"both" | "video" | "clinic">(ENABLE_VIDEO_CONSULTATION ? "both" : "clinic");
  const [videoFee, setVideoFee] = useState(399);
  const [clinicFee, setClinicFee] = useState(250);
  const [slotDuration, setSlotDuration] = useState(30);
  const [bufferMins, setBufferMins] = useState(0);
  const [settingsDirty, setSettingsDirty] = useState(false);

  useEffect(() => {
    if (weeklyDb && !weeklyDirty) setWeekly(normaliseWeekly(weeklyDb));
  }, [weeklyDb, weeklyDirty]);

  useEffect(() => {
    if (practitioner && !settingsDirty) {
      setSlotDuration(practitioner.slotDuration || 30);
      setBufferMins(practitioner.bufferMin || 0);
      if (practitioner.videoFee) setVideoFee(practitioner.videoFee);
      if (practitioner.clinicFee) setClinicFee(practitioner.clinicFee);
      const offersVideo = ENABLE_VIDEO_CONSULTATION && (practitioner.videoFee ?? 0) > 0;
      const offersClinic = (practitioner.clinicFee ?? 0) > 0;
      if (offersVideo && offersClinic) setConsultationMode("both");
      else if (offersVideo) setConsultationMode("video");
      else if (offersClinic) setConsultationMode("clinic");
    }
  }, [practitioner, settingsDirty]);

  const serverOverrides = useMemo(() => {
    const map: Record<string, DateOverride> = {};
    (overridesDb ?? []).forEach((row) => (map[row.date] = normaliseOverride(row)));
    return map;
  }, [overridesDb]);

  const effectiveOverride = useCallback(
    (date: string): DateOverride | undefined => {
      if (date in dateEdits) return dateEdits[date] ?? undefined;
      return serverOverrides[date];
    },
    [dateEdits, serverOverrides],
  );

  const planFor = useCallback((date: string) => resolveDayPlan(date, effectiveOverride(date), weekly), [effectiveOverride, weekly]);

  const appointmentsByDate = useMemo(() => {
    const map: Record<string, NonNullable<typeof monthAppointments>> = {};
    (monthAppointments ?? []).forEach((a) => (map[a.date] ??= []).push(a));
    return map;
  }, [monthAppointments]);

  const editCount = Object.keys(dateEdits).length;
  const hasChanges = weeklyDirty || editCount > 0 || settingsDirty || needsSetup;

  useEffect(() => {
    if (!(weeklyDirty || editCount > 0 || settingsDirty)) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [weeklyDirty, editCount, settingsDirty]);

  /* --------------------------------- weekly -------------------------------- */
  const updateDay = (day: number, fn: (d: WeeklyDay) => WeeklyDay) => {
    setWeekly((prev) => prev.map((d) => (d.dayOfWeek === day ? fn({ ...d, breaks: [...d.breaks], opTimings: [...d.opTimings] }) : d)));
    setWeeklyDirty(true);
  };

  const applyRangeToAllDays = (kind: "break" | "op", range: TimeRange) => {
    setWeekly((prev) =>
      prev.map((d) => {
        if (!d.isActive) return d;
        const key = kind === "break" ? "breaks" : "opTimings";
        const list = d[key].filter((r) => !(r.start === range.start && r.end === range.end));
        return { ...d, [key]: [...list, { ...range }].sort((a, b) => a.start.localeCompare(b.start)) };
      }),
    );
    setWeeklyDirty(true);
    setApplyAllPrompt(null);
    toast.success(`${kind === "break" ? "Break" : "OP timing"} ${formatTime12(range.start)} – ${formatTime12(range.end)} added to every working day`);
  };

  const copyDayToAll = (day: number) => {
    const source = weekly.find((d) => d.dayOfWeek === day);
    if (!source) return;
    setWeekly((prev) =>
      prev.map((d) =>
        d.isActive && d.dayOfWeek !== day
          ? { ...d, startTime: source.startTime, endTime: source.endTime, breaks: source.breaks.map((b) => ({ ...b })), opTimings: source.opTimings.map((b) => ({ ...b })) }
          : d,
      ),
    );
    setWeeklyDirty(true);
    toast.success(`${WEEKDAY_LABELS[day]}'s hours copied to all working days`);
  };

  /* ---------------------------------- dates -------------------------------- */
  const selectedPlan = planFor(selectedDate);
  const selectedOverride = effectiveOverride(selectedDate);
  const selectedWeekly = weekly[dbWeekday(selectedDate)];
  const selectedAppointments = appointmentsByDate[selectedDate] ?? [];

  const setDateEdit = (date: string, value: DateOverride | null) => {
    setDateEdits((prev) => {
      const next = { ...prev };
      // Reverting a date with no saved override is simply "no change".
      if (value === null && !serverOverrides[date]) delete next[date];
      else next[date] = value;
      return next;
    });
  };

  const editSelected = (fn: (d: DateOverride) => DateOverride) => {
    const base: DateOverride = selectedOverride ?? {
      date: selectedDate,
      working_start: selectedPlan.available ? selectedPlan.start : selectedWeekly.startTime || "09:00",
      working_end: selectedPlan.available ? selectedPlan.end : selectedWeekly.endTime || "17:00",
      breaks: selectedPlan.available ? selectedPlan.breaks.map((b) => ({ ...b })) : [],
      op_timings: selectedPlan.available ? selectedPlan.opTimings.map((b) => ({ ...b })) : [],
      is_holiday: false,
      is_leave: false,
    };
    setDateEdit(selectedDate, fn({ ...base, breaks: [...base.breaks], op_timings: [...(base.op_timings ?? [])] }));
  };

  const toggleSelectedDay = () => {
    if (selectedPlan.available) {
      editSelected((d) => ({ ...d, is_leave: true, is_holiday: false }));
      return;
    }
    // Turning a day back on: if the weekly schedule already covers it, just drop the override.
    if (selectedWeekly.isActive && !serverOverrides[selectedDate]) {
      setDateEdit(selectedDate, null);
      return;
    }
    editSelected((d) => ({
      ...d,
      is_leave: false,
      is_holiday: false,
      working_start: d.working_start || selectedWeekly.startTime || "09:00",
      working_end: d.working_end || selectedWeekly.endTime || "17:00",
    }));
  };

  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaveFrom, setLeaveFrom] = useState(todayKey);
  const [leaveTo, setLeaveTo] = useState(todayKey);

  const applyLeaveRange = () => {
    if (leaveTo < leaveFrom) {
      toast.error("'To' date must be on or after 'From' date");
      return;
    }
    const dates = datesBetween(leaveFrom, leaveTo);
    setDateEdits((prev) => {
      const next = { ...prev };
      dates.forEach((date) => {
        next[date] = { date, working_start: null, working_end: null, breaks: [], op_timings: [], is_holiday: false, is_leave: true };
      });
      return next;
    });
    setLeaveOpen(false);
    setSelectedDate(leaveFrom);
    const [y, m] = leaveFrom.split("-").map(Number);
    setCurrentYear(y);
    setCurrentMonth(m - 1);
    toast(`${dates.length} day(s) marked as leave. Press Save to apply.`, { icon: "🗓️" });
  };

  /* ---------------------------------- save --------------------------------- */
  const [scopeOpen, setScopeOpen] = useState(false);
  const [scope, setScope] = useState<Scope>("dates");
  const [conflicts, setConflicts] = useState<ConflictingAppointment[]>([]);
  const [pendingChange, setPendingChange] = useState<AvailabilityChange | null>(null);
  const [saving, setSaving] = useState(false);

  const workingDateEdits = Object.values(dateEdits).filter((d): d is DateOverride => Boolean(d && !d.is_leave && !d.is_holiday));
  const scopeWeekdays = Array.from(new Set(workingDateEdits.map((d) => dbWeekday(d.date)))).sort();

  const validateEdits = (): string | null => {
    for (const d of weekly) {
      if (!d.isActive) continue;
      const err = validateHours(d.startTime, d.endTime, d.breaks, d.opTimings);
      if (err) return `${WEEKDAY_LABELS[d.dayOfWeek]}: ${err}`;
    }
    if (weekly.every((d) => !d.isActive) && (weeklyDirty || needsSetup)) {
      return "Turn on at least one working day in your weekly hours";
    }
    for (const d of workingDateEdits) {
      const err = validateHours(d.working_start ?? "", d.working_end ?? "", d.breaks, d.op_timings ?? []);
      if (err) return `${formatDayLabel(d.date)}: ${err}`;
    }
    return null;
  };

  const buildChange = (chosenScope: Scope): AvailabilityChange => {
    const change: AvailabilityChange = { dates: [], clearDates: [], weekly: [] };
    const weeklyOut = new Map<number, WeeklyDay>();
    if (weeklyDirty || needsSetup) weekly.forEach((d) => weeklyOut.set(d.dayOfWeek, d));

    Object.entries(dateEdits).forEach(([date, ov]) => {
      if (ov === null) {
        change.clearDates!.push(date);
      } else if (chosenScope === "forward" && !ov.is_leave && !ov.is_holiday) {
        const day = dbWeekday(date);
        weeklyOut.set(day, {
          dayOfWeek: day,
          startTime: ov.working_start ?? "09:00",
          endTime: ov.working_end ?? "17:00",
          breaks: ov.breaks,
          opTimings: ov.op_timings ?? [],
          isActive: true,
        });
        change.clearDates!.push(date);
      } else {
        change.dates!.push(ov);
      }
    });
    change.weekly = Array.from(weeklyOut.values());
    return change;
  };

  const resetAfterSave = () => {
    setWeeklyDirty(false);
    setDateEdits({});
    setSettingsDirty(false);
    setConflicts([]);
    setPendingChange(null);
    refetchState();
    refetchWeekly();
    refetchOverrides();
    refetchAppointments();
    refetchPractitioner();
  };

  const saveSettingsIfNeeded = async () => {
    if (!settingsDirty || !user?.id) return;
    const offersVideo = ENABLE_VIDEO_CONSULTATION && consultationMode !== "clinic";
    const offersClinic = consultationMode !== "video";
    await updatePractitionerSettings(user.id, {
      baseVideoFee: offersVideo ? videoFee : 0,
      baseClinicFee: offersClinic ? clinicFee : 0,
      slotDurationMin: slotDuration,
      bufferMin: bufferMins,
    });
  };

  const commit = async (change: AvailabilityChange, cancelConflicts: boolean, cancelReason?: string) => {
    setSaving(true);
    try {
      const scheduleChanged = (change.dates?.length ?? 0) + (change.clearDates?.length ?? 0) + (change.weekly?.length ?? 0) > 0 || needsSetup;
      let message = needsSetup ? "You're live! Patients can now see your available slots" : "Availability saved";
      if (scheduleChanged) {
        const leaveDays = change.dates?.filter((d) => d.is_leave).length ?? 0;
        const { cancellation } = await saveAvailabilityChange({
          change,
          cancelConflicts,
          cancelReason,
          actionLabel: leaveDays > 0 ? `You marked ${leaveDays} day(s) as leave` : "You changed your consultation hours",
        });
        await saveSettingsIfNeeded();
        cancellationToast(cancellation, message);
      } else {
        await saveSettingsIfNeeded();
        message = "Consultation settings saved";
        toast.success(message);
      }
      resetAfterSave();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save changes");
    } finally {
      setSaving(false);
    }
  };

  const proceedWithScope = async (chosenScope: Scope) => {
    setScopeOpen(false);
    const change = buildChange(chosenScope);
    setSaving(true);
    try {
      const found = await previewAvailabilityChange(change);
      setSaving(false);
      if (found.length > 0) {
        setPendingChange(change);
        setConflicts(found);
        return;
      }
      await commit(change, false);
    } catch (err) {
      setSaving(false);
      toast.error(err instanceof Error ? err.message : "Could not check your appointments");
    }
  };

  const handleSave = () => {
    const err = validateEdits();
    if (err) {
      toast.error(err);
      return;
    }
    if (workingDateEdits.length > 0) {
      setScope("dates");
      setScopeOpen(true);
      return;
    }
    void proceedWithScope("dates");
  };

  /* -------------------------------- calendar ------------------------------- */
  const calendarDays = useMemo(() => {
    const first = new Date(currentYear, currentMonth, 1).getDay();
    const total = new Date(currentYear, currentMonth + 1, 0).getDate();
    const days: ({ day: number; dateStr: string } | null)[] = Array.from({ length: first }, () => null);
    for (let day = 1; day <= total; day++) days.push({ day, dateStr: toIsoDate(new Date(currentYear, currentMonth, day)) });
    return days;
  }, [currentMonth, currentYear]);

  const isPrevDisabled = currentYear < today.getFullYear() || (currentYear === today.getFullYear() && currentMonth <= today.getMonth());
  const shiftMonth = (delta: number) => {
    const d = new Date(currentYear, currentMonth + delta, 1);
    setCurrentMonth(d.getMonth());
    setCurrentYear(d.getFullYear());
  };

  /* --------------------------------- render -------------------------------- */
  return (
    <div className="mx-auto min-h-screen max-w-7xl bg-neutral-50/30 p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Availability</h1>
          <p className="mt-1 text-sm text-muted-foreground">Your regular weekly hours, plus changes and leave for specific dates</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving || !hasChanges}
          className={cn(
            "flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-bold text-white shadow-sm transition-all",
            hasChanges ? "bg-[#254EDb] hover:bg-blue-700 active:scale-95" : "cursor-not-allowed bg-blue-600 opacity-50",
          )}
        >
          {saving && <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
          {saving ? "Saving..." : needsSetup ? "Save & go live" : `Save changes${editCount > 0 ? ` (${editCount} date${editCount === 1 ? "" : "s"})` : ""}`}
        </button>
      </div>

      {/* First-time setup */}
      {needsSetup && (
        <div className="mb-6 flex items-start gap-3 rounded-3xl border border-amber-200 bg-amber-50 p-5">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="text-sm text-amber-900">
            <p className="font-bold">Confirm your hours to start receiving patients</p>
            <p className="mt-0.5 text-amber-800">
              We&apos;ve pre-filled a default schedule: <strong>Mon–Sat, 9:00 AM – 5:00 PM, lunch break 1–2 PM, Sunday off</strong>.
              Adjust it below and press <strong>Save &amp; go live</strong>. Until then, patients can&apos;t see or book you.
            </p>
          </div>
        </div>
      )}

      {/* Status + how it works */}
      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,340px)_1fr]">
        <AcceptingBookingsSwitch state={state ? { ...state } : null} onChanged={refetchState} />
        <div className="flex items-start gap-2 rounded-[12px] border border-neutral-150 bg-white px-4 py-3 text-xs leading-relaxed text-neutral-600">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#254EDb]" />
          <p>
            <strong>Accepting bookings</strong> is your master switch — off hides you from patients (existing appointments stay unless you cancel them).
            The <strong>day ON/OFF</strong> switch under <em>Specific dates</em> is for leave on particular days. If a change clashes with booked
            appointments, we&apos;ll show you the patients and ask before cancelling anything.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 inline-flex rounded-full border border-neutral-200 bg-white p-1 text-xs font-bold">
        {(
          [
            { id: "weekly", label: "Weekly hours", icon: <Clock size={13} /> },
            { id: "dates", label: "Specific dates & leave", icon: <CalendarDays size={13} /> },
            { id: "settings", label: "Fees & slot length", icon: <Stethoscope size={13} /> },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn("flex items-center gap-1.5 rounded-full px-4 py-2 transition-all", tab === t.id ? "bg-[#254EDb] text-white" : "text-neutral-600 hover:bg-neutral-50")}
          >
            {t.icon}
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {/* ───────────────────────────── Weekly hours ───────────────────────────── */}
      {tab === "weekly" && (
        <div className="space-y-3">
          {weeklyLoading && !weeklyDb ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Loading your schedule…</p>
          ) : (
            weekly.map((day) => (
              <div key={day.dayOfWeek} className="rounded-3xl border border-neutral-150 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex w-36 items-center gap-3">
                    <Toggle
                      on={day.isActive}
                      label={`${WEEKDAY_LABELS[day.dayOfWeek]} ${day.isActive ? "on" : "off"}`}
                      onClick={() => updateDay(day.dayOfWeek, (d) => ({ ...d, isActive: !d.isActive }))}
                    />
                    <span className={cn("text-sm font-bold", day.isActive ? "text-foreground" : "text-neutral-400")}>{WEEKDAY_LABELS[day.dayOfWeek]}</span>
                  </div>
                  {day.isActive ? (
                    <>
                      <div className="flex min-w-[220px] flex-1 items-center gap-2">
                        <TimeInput value={day.startTime} onChange={(v) => updateDay(day.dayOfWeek, (d) => ({ ...d, startTime: v }))} />
                        <span className="text-neutral-300">→</span>
                        <TimeInput value={day.endTime} onChange={(v) => updateDay(day.dayOfWeek, (d) => ({ ...d, endTime: v }))} />
                      </div>
                      <button
                        type="button"
                        onClick={() => copyDayToAll(day.dayOfWeek)}
                        className="flex items-center gap-1 rounded-full border border-neutral-200 px-3 py-1.5 text-[10px] font-bold text-neutral-600 hover:bg-neutral-50"
                      >
                        <Copy size={11} /> Copy to all days
                      </button>
                    </>
                  ) : (
                    <span className="text-xs text-neutral-400">Day off — no bookings</span>
                  )}
                </div>

                {day.isActive && (
                  <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                    {(["break", "op"] as const).map((kind) => {
                      const key = kind === "break" ? "breaks" : "opTimings";
                      return (
                        <div key={kind}>
                          <RangeList
                            kind={kind}
                            ranges={day[key]}
                            onAdd={() => {
                              const range = kind === "break" ? { start: "13:00", end: "14:00" } : { start: "15:00", end: "16:00" };
                              updateDay(day.dayOfWeek, (d) => ({ ...d, [key]: [...d[key], range] }));
                              setApplyAllPrompt({ kind, day: day.dayOfWeek, index: day[key].length });
                            }}
                            onChange={(i, r) => updateDay(day.dayOfWeek, (d) => ({ ...d, [key]: d[key].map((x, j) => (j === i ? r : x)) }))}
                            onRemove={(i) => {
                              updateDay(day.dayOfWeek, (d) => ({ ...d, [key]: d[key].filter((_, j) => j !== i) }));
                              setApplyAllPrompt(null);
                            }}
                            onApplyAll={(r) => applyRangeToAllDays(kind, r)}
                          />
                          {applyAllPrompt && applyAllPrompt.kind === kind && applyAllPrompt.day === day.dayOfWeek && day[key][applyAllPrompt.index] && (
                            <div className="mt-2 flex flex-wrap items-center gap-2 rounded-2xl border border-[#254EDb]/20 bg-blue-50 px-3 py-2 text-[11px] text-blue-900">
                              <span className="flex-1">
                                Use this {kind === "break" ? "break" : "OP timing"} on <strong>every working day</strong>, not just {WEEKDAY_LABELS[day.dayOfWeek]}?
                              </span>
                              <button
                                type="button"
                                onClick={() => applyRangeToAllDays(kind, day[key][applyAllPrompt.index])}
                                className="rounded-full bg-[#254EDb] px-3 py-1 font-bold text-white"
                              >
                                All days
                              </button>
                              <button type="button" onClick={() => setApplyAllPrompt(null)} className="rounded-full border border-blue-200 bg-white px-3 py-1 font-bold">
                                Only {WEEKDAY_SHORT[day.dayOfWeek]}
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))
          )}
          <p className="px-2 text-[11px] text-muted-foreground">
            Tip: set the exact time on a new break first, then press &quot;All days&quot; (or the copy icon) to reuse it everywhere.
          </p>
        </div>
      )}

      {/* ─────────────────────────── Specific dates ─────────────────────────── */}
      {tab === "dates" && (
        <div className="flex flex-col gap-6 lg:flex-row">
          {/* Calendar */}
          <div className="w-full shrink-0 space-y-4 lg:w-[340px]">
            <div className="rounded-3xl border border-neutral-150 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => shiftMonth(-1)}
                    disabled={isPrevDisabled}
                    className={cn("rounded-full border border-neutral-200 p-1", isPrevDisabled ? "cursor-not-allowed bg-neutral-50 opacity-50" : "hover:bg-neutral-50")}
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <h2 className="font-display text-sm font-bold">
                    {new Date(currentYear, currentMonth).toLocaleDateString("en-IN", { month: "long", year: "numeric" })}
                  </h2>
                  <button onClick={() => shiftMonth(1)} className="rounded-full border border-neutral-200 p-1 hover:bg-neutral-50">
                    <ChevronRight size={16} />
                  </button>
                </div>
                <button
                  onClick={() => {
                    setCurrentMonth(today.getMonth());
                    setCurrentYear(today.getFullYear());
                    setSelectedDate(todayKey);
                  }}
                  className="rounded-full border border-neutral-200 px-3 py-1.5 text-[10px] font-bold hover:bg-neutral-50"
                >
                  Today
                </button>
              </div>

              <div className="mb-1 grid grid-cols-7 gap-1.5">
                {CAL_HEADERS.map((d) => (
                  <div key={d} className="text-center text-[10px] font-bold text-muted-foreground">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1.5">
                {calendarDays.map((d, i) => {
                  if (!d) return <div key={`empty-${i}`} className="h-10" />;
                  const isPast = d.dateStr < todayKey;
                  const isSelected = selectedDate === d.dateStr;
                  const plan = planFor(d.dateStr);
                  const count = appointmentsByDate[d.dateStr]?.length ?? 0;
                  const edited = d.dateStr in dateEdits;
                  const hasClash =
                    count > 0 && (appointmentsByDate[d.dateStr] ?? []).some((a) => !checkTimeAgainstPlan(plan, a.time, a.durationMin).ok);
                  return (
                    <button
                      key={d.dateStr}
                      onClick={() => setSelectedDate(d.dateStr)}
                      disabled={isPast}
                      title={count > 0 ? `${count} appointment(s)` : undefined}
                      className={cn(
                        "relative flex h-10 w-full flex-col items-center justify-center rounded-lg border text-xs transition-all",
                        isSelected
                          ? "border-[#254EDb] bg-[#254EDb] font-bold text-white shadow-sm"
                          : !plan.available
                          ? plan.reason === "leave"
                            ? "border-red-200 bg-red-50 text-red-600"
                            : "border-transparent bg-neutral-50 text-neutral-400"
                          : plan.source === "date"
                          ? "border-[#254EDb]/40 bg-blue-50/60 font-bold text-[#254EDb]"
                          : "border-transparent text-neutral-700 hover:bg-neutral-100",
                        isPast && "cursor-not-allowed opacity-40",
                      )}
                    >
                      {d.day}
                      {count > 0 && (
                        <span
                          className={cn(
                            "mt-0.5 rounded-full px-1 text-[8px] font-bold leading-[12px]",
                            isSelected ? "bg-white text-[#254EDb]" : hasClash ? "bg-red-600 text-white" : "bg-emerald-500 text-white",
                          )}
                        >
                          {count}
                        </span>
                      )}
                      {edited && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-amber-500" />}
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[10px] text-neutral-500">
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-blue-100 ring-1 ring-[#254EDb]/40" /> Custom hours</span>
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-red-100 ring-1 ring-red-200" /> Leave</span>
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-neutral-100" /> Weekly day off</span>
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Unsaved change</span>
                <span className="flex items-center gap-1.5"><span className="rounded-full bg-emerald-500 px-1 text-[8px] font-bold text-white">2</span> Appointments</span>
                <span className="flex items-center gap-1.5"><span className="rounded-full bg-red-600 px-1 text-[8px] font-bold text-white">2</span> Will clash</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setLeaveFrom(selectedDate >= todayKey ? selectedDate : todayKey);
                setLeaveTo(selectedDate >= todayKey ? selectedDate : todayKey);
                setLeaveOpen(true);
              }}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-red-200 bg-white px-4 py-3 text-xs font-bold text-red-600 hover:bg-red-50"
            >
              <CalendarX2 size={14} /> Mark leave for several days
            </button>
          </div>

          {/* Selected day */}
          <div className="grid min-w-0 flex-1 grid-cols-1 gap-6 xl:grid-cols-2">
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-3xl border border-neutral-150 bg-white p-5 shadow-sm">
                <div>
                  <h3 className="font-display text-sm font-bold">
                    {new Date(`${selectedDate}T00:00:00`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short", year: "numeric" })}
                  </h3>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {!selectedPlan.available
                      ? selectedPlan.reason === "leave"
                        ? "On leave — no bookings this day"
                        : `Day off in your weekly hours (${WEEKDAY_LABELS[dbWeekday(selectedDate)]})`
                      : selectedPlan.source === "date"
                      ? "Custom hours for this date only"
                      : `Following your ${WEEKDAY_LABELS[dbWeekday(selectedDate)]} weekly hours`}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-[#254EDb]">{selectedPlan.available ? "ON" : "OFF"}</span>
                  <Toggle on={selectedPlan.available} onClick={toggleSelectedDay} label="Available this day" />
                </div>
              </div>

              {selectedPlan.available && (
                <div className="space-y-5 rounded-3xl border border-neutral-150 bg-white p-5 shadow-sm">
                  <div>
                    <span className="mb-2 flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground">
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-neutral-100 text-neutral-500"><Clock size={10} /></span>
                      Working hours
                    </span>
                    <div className="flex items-center gap-2">
                      <TimeInput value={selectedPlan.start} onChange={(v) => editSelected((d) => ({ ...d, working_start: v }))} />
                      <span className="text-neutral-300">→</span>
                      <TimeInput value={selectedPlan.end} onChange={(v) => editSelected((d) => ({ ...d, working_end: v }))} />
                    </div>
                  </div>
                  <RangeList
                    kind="break"
                    ranges={selectedPlan.breaks}
                    onAdd={() => editSelected((d) => ({ ...d, breaks: [...d.breaks, { start: "13:00", end: "14:00" }] }))}
                    onChange={(i, r) => editSelected((d) => ({ ...d, breaks: d.breaks.map((x, j) => (j === i ? r : x)) }))}
                    onRemove={(i) => editSelected((d) => ({ ...d, breaks: d.breaks.filter((_, j) => j !== i) }))}
                  />
                  <RangeList
                    kind="op"
                    ranges={selectedPlan.opTimings}
                    onAdd={() => editSelected((d) => ({ ...d, op_timings: [...(d.op_timings ?? []), { start: "15:00", end: "16:00" }] }))}
                    onChange={(i, r) => editSelected((d) => ({ ...d, op_timings: (d.op_timings ?? []).map((x, j) => (j === i ? r : x)) }))}
                    onRemove={(i) => editSelected((d) => ({ ...d, op_timings: (d.op_timings ?? []).filter((_, j) => j !== i) }))}
                  />
                </div>
              )}

              {selectedPlan.source === "date" && (
                <button
                  type="button"
                  onClick={() => setDateEdit(selectedDate, null)}
                  className="flex items-center gap-1.5 px-2 text-[11px] font-bold text-neutral-500 hover:text-[#254EDb]"
                >
                  <RotateCcw size={12} /> Go back to my regular {WEEKDAY_LABELS[dbWeekday(selectedDate)]} hours
                </button>
              )}
            </div>

            {/* Appointments on this date */}
            <div className="h-fit rounded-3xl border border-neutral-150 bg-white p-5 shadow-sm">
              <h4 className="mb-3 flex items-center justify-between text-xs font-bold text-muted-foreground">
                <span>Appointments this day</span>
                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] text-neutral-600">{selectedAppointments.length}</span>
              </h4>
              {selectedAppointments.length === 0 ? (
                <p className="py-6 text-center text-xs text-neutral-400">No appointments booked on this date.</p>
              ) : (
                <ul className="space-y-2">
                  {selectedAppointments.map((a) => {
                    const fit = checkTimeAgainstPlan(selectedPlan, a.time, a.durationMin);
                    return (
                      <li
                        key={a.id}
                        className={cn("flex items-center justify-between gap-3 rounded-2xl border px-3 py-2.5", fit.ok ? "border-neutral-150" : "border-red-200 bg-red-50/60")}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-gray-900">{a.patientName}</p>
                          <p className="text-[11px] text-gray-500">
                            {formatTime12(a.time)} · {a.durationMin} min{a.reason ? ` · ${a.reason}` : ""}
                          </p>
                          {!fit.ok && <p className="mt-0.5 text-[11px] font-bold text-red-600">{fit.reason} — will need cancelling</p>}
                        </div>
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-600">
                          {a.mode === "video" ? <Video size={10} /> : <Building size={10} />}
                          {a.mode === "video" ? "Video" : "Clinic"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
              {selectedAppointments.length > 0 && (
                <Link href="/pro" className="mt-3 block text-center text-[11px] font-bold text-[#254EDb]">
                  Open today&apos;s queue on the dashboard →
                </Link>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────── Fees & slot length ─────────────────────── */}
      {tab === "settings" && (
        <div className="grid max-w-3xl grid-cols-1 gap-6 md:grid-cols-2">
          {ENABLE_VIDEO_CONSULTATION && (
            <div className="rounded-3xl border border-neutral-150 bg-white p-6 shadow-sm">
              <h4 className="mb-4 text-xs font-bold text-muted-foreground">Consultation mode</h4>
              <div className="space-y-2">
                {(
                  [
                    { id: "both", label: "Video & In-Clinic", icon: <Building size={14} /> },
                    { id: "video", label: "Video only", icon: <Video size={14} /> },
                    { id: "clinic", label: "In-Clinic only", icon: <Building size={14} /> },
                  ] as const
                ).map((mode) => (
                  <button
                    key={mode.id}
                    onClick={() => {
                      setConsultationMode(mode.id);
                      setSettingsDirty(true);
                    }}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-medium transition-all",
                      consultationMode === mode.id ? "border-[#254EDb] bg-blue-50/50 text-[#254EDb]" : "border-neutral-200 text-neutral-600 hover:bg-neutral-50",
                    )}
                  >
                    {mode.icon} {mode.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-3xl border border-neutral-150 bg-white p-6 shadow-sm">
            <h4 className="mb-4 text-xs font-bold text-muted-foreground">Consultation fees</h4>
            <div className="space-y-4">
              {ENABLE_VIDEO_CONSULTATION && consultationMode !== "clinic" && (
                <label className="block">
                  <span className="mb-1 flex items-center gap-1.5 text-[10px] text-muted-foreground"><Video size={12} /> Video consultation fee</span>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 font-medium text-neutral-500">₹</span>
                    <input
                      type="number"
                      min={0}
                      value={videoFee}
                      onChange={(e) => {
                        setVideoFee(Number(e.target.value));
                        setSettingsDirty(true);
                      }}
                      className="w-full rounded-full border border-neutral-200 py-2 pl-8 pr-4 text-sm font-medium focus:border-[#254EDb] focus:outline-none"
                    />
                  </div>
                </label>
              )}
              {consultationMode !== "video" && (
                <label className="block">
                  <span className="mb-1 flex items-center gap-1.5 text-[10px] text-muted-foreground"><Building size={12} /> In-clinic consultation fee</span>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 font-medium text-neutral-500">₹</span>
                    <input
                      type="number"
                      min={0}
                      value={clinicFee}
                      onChange={(e) => {
                        setClinicFee(Number(e.target.value));
                        setSettingsDirty(true);
                      }}
                      className="w-full rounded-full border border-neutral-200 py-2 pl-8 pr-4 text-sm font-medium focus:border-[#254EDb] focus:outline-none"
                    />
                  </div>
                </label>
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-neutral-150 bg-white p-6 shadow-sm">
            <h4 className="mb-4 text-xs font-bold text-muted-foreground">Slot duration</h4>
            <div className="flex flex-wrap gap-2">
              {[15, 20, 30, 45, 60].map((mins) => (
                <button
                  key={mins}
                  onClick={() => {
                    setSlotDuration(mins);
                    setSettingsDirty(true);
                  }}
                  className={cn(
                    "rounded-full border px-4 py-2 text-xs font-bold transition-all",
                    slotDuration === mins ? "border-[#254EDb] bg-[#254EDb] text-white" : "border-neutral-200 text-neutral-600 hover:bg-neutral-50",
                  )}
                >
                  {mins}m
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-neutral-150 bg-white p-6 shadow-sm">
            <h4 className="mb-1 text-xs font-bold text-muted-foreground">Buffer between slots</h4>
            <p className="mb-4 text-[10px] text-muted-foreground">Transition time between appointments</p>
            <div className="flex flex-wrap gap-2">
              {[0, 5, 10, 15].map((mins) => (
                <button
                  key={mins}
                  onClick={() => {
                    setBufferMins(mins);
                    setSettingsDirty(true);
                  }}
                  className={cn(
                    "rounded-full border px-4 py-2 text-xs font-bold transition-all",
                    bufferMins === mins ? "border-[#254EDb] bg-[#254EDb] text-white" : "border-neutral-200 text-neutral-600 hover:bg-neutral-50",
                  )}
                >
                  {mins === 0 ? "None" : `${mins}m`}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ──────────────────────────────── Dialogs ────────────────────────────── */}

      {/* After changing hours on specific dates: only those dates, or continue? */}
      <Modal open={scopeOpen} onClose={() => setScopeOpen(false)} wide>
        <h3 className="pr-6 text-lg font-bold text-gray-900">How long should the new hours apply?</h3>
        <p className="mt-1 text-sm text-gray-600">
          You changed hours on {workingDateEdits.length} date{workingDateEdits.length === 1 ? "" : "s"}:{" "}
          <span className="font-semibold">{workingDateEdits.slice(0, 4).map((d) => formatDayLabel(d.date)).join(", ")}{workingDateEdits.length > 4 ? "…" : ""}</span>
        </p>
        <div className="mt-4 space-y-2">
          {(
            [
              {
                value: "dates",
                label: "Only on these dates",
                hint: "After that, go back to my regular weekly hours.",
              },
              {
                value: "forward",
                label: `Continue with these hours every ${scopeWeekdays.map((d) => WEEKDAY_LABELS[d]).join(", ")}`,
                hint: "Updates your weekly hours from now on. Dates with their own custom hours or leave are not affected.",
              },
            ] as const
          ).map((option) => (
            <label
              key={option.value}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition-colors",
                scope === option.value ? "border-indigo-300 bg-indigo-50" : "border-gray-200 hover:bg-gray-50",
              )}
            >
              <input type="radio" name="scope" className="mt-1 accent-indigo-600" checked={scope === option.value} onChange={() => setScope(option.value)} />
              <span>
                <span className="block text-sm font-semibold text-gray-900">{option.label}</span>
                <span className="block text-xs text-gray-500">{option.hint}</span>
              </span>
            </label>
          ))}
        </div>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={() => setScopeOpen(false)} className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50">
            Back
          </button>
          <button type="button" onClick={() => proceedWithScope(scope)} className="rounded-xl bg-[#254EDb] px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700">
            Continue
          </button>
        </div>
      </Modal>

      {/* Conflicting appointments: confirm before cancelling */}
      <ConfirmCancellationDialog
        open={conflicts.length > 0}
        title={`${conflicts.length} patient${conflicts.length === 1 ? " has" : "s have"} an appointment in this time`}
        description={
          <>
            Saving this change means you won&apos;t be available for {conflicts.length === 1 ? "this appointment" : "these appointments"}.
            Confirm to cancel {conflicts.length === 1 ? "it" : "them"} and save, or go back and adjust your hours.
          </>
        }
        appointments={conflicts}
        confirmLabel={`Cancel ${conflicts.length} & save`}
        busy={saving}
        onClose={() => {
          setConflicts([]);
          setPendingChange(null);
        }}
        onConfirm={(reason) => pendingChange && commit(pendingChange, true, reason)}
      />

      {/* Leave for a date range */}
      <Modal open={leaveOpen} onClose={() => setLeaveOpen(false)}>
        <h3 className="pr-6 text-lg font-bold text-gray-900">Mark leave</h3>
        <p className="mt-1 text-sm text-gray-600">You won&apos;t be bookable on these days. Your weekly hours stay the same for every other day.</p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="text-xs font-bold text-gray-700">
            From
            <input
              type="date"
              min={todayKey}
              value={leaveFrom}
              onChange={(e) => {
                setLeaveFrom(e.target.value);
                if (leaveTo < e.target.value) setLeaveTo(e.target.value);
              }}
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-normal"
            />
          </label>
          <label className="text-xs font-bold text-gray-700">
            To
            <input
              type="date"
              min={leaveFrom}
              value={leaveTo}
              onChange={(e) => setLeaveTo(e.target.value)}
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-normal"
            />
          </label>
        </div>
        <p className="mt-3 text-xs text-gray-500">If anyone has booked on these days, you&apos;ll see who before anything is cancelled.</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={() => setLeaveOpen(false)} className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button type="button" onClick={applyLeaveRange} className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700">
            Mark {datesBetween(leaveFrom, leaveTo).length} day(s) as leave
          </button>
        </div>
      </Modal>
    </div>
  );
}
