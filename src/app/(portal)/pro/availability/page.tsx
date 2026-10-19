"use client";

import { useState, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/auth-context";
import { useCalendarAvailability } from "@/hooks/use-availability";
import { usePractitioner } from "@/hooks/use-discover";
import { updateCalendarAvailability, updatePractitionerSettings, CalendarAvailabilityRow } from "@/hooks/use-availability";
import {
  ChevronLeft, ChevronRight, Plus, Trash2, Check, Save, Copy, Clock, Coffee, Building, Video
} from "lucide-react";
import toast from "react-hot-toast";
import { ENABLE_VIDEO_CONSULTATION } from "@/lib/feature-flags";

const DAYS_OF_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getMonthName(month: number, year: number) {
  return new Date(year, month).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

function formatDateKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default function AvailabilityPage() {
  const { user } = useAuth();

  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [selectedDate, setSelectedDate] = useState<string>(formatDateKey(today));

  // Determine date bounds for the query
  const startDate = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-01`;
  const endDate = new Date(currentYear, currentMonth + 1, 0).toISOString().split("T")[0];

  const { data: practitioner } = usePractitioner(user?.id);
  const { data: availabilityDb, loading: availabilityLoading, refetch } = useCalendarAvailability(user?.id, startDate, endDate);

  // Local state for availability overrides
  const [availability, setAvailability] = useState<Record<string, CalendarAvailabilityRow>>({});
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Settings state (Global per practitioner)
  const [consultationMode, setConsultationMode] = useState<"both" | "video" | "clinic">(
    ENABLE_VIDEO_CONSULTATION ? "both" : "clinic"
  );
  const [videoFee, setVideoFee] = useState(399);
  const [clinicFee, setClinicFee] = useState(250);
  const [slotDuration, setSlotDuration] = useState(30);
  const [bufferMins, setBufferMins] = useState(0);

  useEffect(() => {
    if (availabilityDb && !hasChanges) {
      const map: Record<string, CalendarAvailabilityRow> = {};
      availabilityDb.forEach(row => {
        map[row.date] = row;
      });
      setAvailability(map);
    }
  }, [availabilityDb, hasChanges]);

  useEffect(() => {
    if (practitioner) {
      setSlotDuration(practitioner.slotDuration || 30);
      setBufferMins(practitioner.bufferMin || 0);
      if (practitioner.videoFee) setVideoFee(practitioner.videoFee);
      if (practitioner.clinicFee) setClinicFee(practitioner.clinicFee);
      // A mode is offered exactly when its fee is set — slots are generated per fee.
      const offersVideo = ENABLE_VIDEO_CONSULTATION && (practitioner.videoFee ?? 0) > 0;
      const offersClinic = (practitioner.clinicFee ?? 0) > 0;
      if (offersVideo && offersClinic) setConsultationMode("both");
      else if (offersVideo) setConsultationMode("video");
      else if (offersClinic) setConsultationMode("clinic");
    }
  }, [practitioner]);

  // Calendar logic
  const calendarDays = useMemo(() => {
    const firstDay = new Date(currentYear, currentMonth, 1);
    const startDayOfWeek = firstDay.getDay();

    const totalDays = new Date(currentYear, currentMonth + 1, 0).getDate();
    const days = [];

    for (let i = 0; i < startDayOfWeek; i++) {
      days.push(null);
    }

    for (let day = 1; day <= totalDays; day++) {
      const dateStr = formatDateKey(new Date(currentYear, currentMonth, day));
      days.push({ day, dateStr });
    }

    return days;
  }, [currentMonth, currentYear]);

  const nextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0); setCurrentYear(y => y + 1);
    } else {
      setCurrentMonth(m => m + 1);
    }
  };

  const prevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11); setCurrentYear(y => y - 1);
    } else {
      setCurrentMonth(m => m - 1);
    }
  };

  const todayKey = formatDateKey(today);
  const isPrevDisabled = currentYear < today.getFullYear() || (currentYear === today.getFullYear() && currentMonth <= today.getMonth());

  const handleDateSelect = (dateStr: string) => {
    setSelectedDate(dateStr);
  };

  const mutateDate = (dateStr: string, updateFn: (prev: CalendarAvailabilityRow) => CalendarAvailabilityRow) => {
    setAvailability(prev => {
      const existing = prev[dateStr] || {
        date: dateStr,
        working_start: "09:00",
        working_end: "22:00",
        breaks: [],
        op_timings: [],
        slots: [], // In a real app we might auto-generate slots here based on working_start and breaks
        is_holiday: false,
        is_leave: false,
      };
      return { ...prev, [dateStr]: updateFn(existing) };
    });
    setHasChanges(true);
  };

  const selectedData = availability[selectedDate] || {
    date: selectedDate,
    working_start: "09:00",
    working_end: "22:00",
    breaks: [],
    op_timings: [],
    slots: [],
    is_holiday: false,
    is_leave: false,
  };

  const handleSave = async () => {
    if (!user?.id) return;
    setIsSaving(true);
    try {
      const updates = Object.values(availability);
      if (updates.length > 0) {
        await updateCalendarAvailability(user.id, updates);
      }

      // The mode not offered is stored with no fee, so no slots are generated for it.
      const offersVideo = ENABLE_VIDEO_CONSULTATION && consultationMode !== "clinic";
      const offersClinic = consultationMode !== "video";
      await updatePractitionerSettings(user.id, {
        baseVideoFee: offersVideo ? videoFee : 0,
        baseClinicFee: offersClinic ? clinicFee : 0,
        slotDurationMin: slotDuration,
        bufferMin: bufferMins,
      });

      toast.success("Availability saved successfully!");
      setHasChanges(false);
      refetch();
    } catch (err) {
      toast.error("Failed to save changes.");
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  // Helper for rendering date status
  const getDateStatusClass = (dateStr: string) => {
    const data = availability[dateStr];
    if (!data) return "border-neutral-200 hover:border-herb-green/30 text-neutral-600";
    if (data.is_holiday || data.is_leave) return "border-red-200 bg-red-50 text-red-600";
    if (data.working_start) return "border-herb-green bg-herb-green/5 text-herb-green font-bold";
    return "border-neutral-200 hover:border-herb-green/30 text-neutral-600";
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto min-h-screen bg-neutral-50/30">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display text-foreground tracking-tight">Availability</h1>
          <p className="text-sm text-muted-foreground mt-1">Configure your daily consultation schedule</p>
        </div>
        <button
          onClick={handleSave}
          disabled={isSaving || !hasChanges}
          className={cn(
            "px-6 py-2.5 rounded-full font-bold text-sm transition-all shadow-sm flex items-center gap-2",
            hasChanges
              ? "bg-[#254EDb] text-white hover:bg-blue-700 active:scale-95"
              : "bg-blue-600 text-white opacity-50 cursor-not-allowed"
          )}
        >
          {isSaving ? <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" /> : null}
          {isSaving ? "Saving..." : "Save Changes"}
        </button>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">

        {/* LEFT: COMPACT CALENDAR (30%) */}
        <div className="w-full lg:w-[320px] shrink-0 space-y-6">
          <div className="bg-white rounded-3xl p-5 border border-neutral-150 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <button
                  onClick={prevMonth}
                  disabled={isPrevDisabled}
                  className={cn(
                    "p-1 border border-neutral-200 rounded-full",
                    isPrevDisabled ? "opacity-50 cursor-not-allowed bg-neutral-50" : "hover:bg-neutral-50"
                  )}
                >
                  <ChevronLeft size={16} />
                </button>
                <h2 className="text-sm font-bold font-display">{getMonthName(currentMonth, currentYear)}</h2>
                <button onClick={nextMonth} className="p-1 border border-neutral-200 rounded-full hover:bg-neutral-50">
                  <ChevronRight size={16} />
                </button>
              </div>
              <button
                onClick={() => {
                  setCurrentMonth(today.getMonth());
                  setCurrentYear(today.getFullYear());
                  setSelectedDate(formatDateKey(today));
                }}
                className="px-3 py-1.5 text-[10px] font-bold border border-neutral-200 rounded-full hover:bg-neutral-50"
              >
                Today
              </button>
            </div>

            {/* Calendar Grid */}
            <div className="grid grid-cols-7 gap-1.5 mb-1">
              {DAYS_OF_WEEK.map(d => (
                <div key={d} className="text-center text-[10px] font-bold text-muted-foreground">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {calendarDays.map((d, i) => {
                if (!d) return <div key={`empty-${i}`} className="h-8" />;

                const isPast = d.dateStr < todayKey;
                const isSelected = selectedDate === d.dateStr;
                const statusClass = getDateStatusClass(d.dateStr);

                return (
                  <button
                    key={d.dateStr}
                    onClick={() => handleDateSelect(d.dateStr)}
                    disabled={isPast}
                    className={cn(
                      "h-8 w-full flex items-center justify-center rounded-lg text-xs transition-all",
                      isSelected ? "bg-[#254EDb] text-white font-bold shadow-sm ring-2 ring-[#254EDb]/20 ring-offset-1" : statusClass,
                      !isSelected && !isPast && "hover:bg-neutral-100 border border-transparent",
                      isPast && "opacity-40 cursor-not-allowed border-transparent"
                    )}
                  >
                    {d.day}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* RIGHT: SELECTED DATE DETAILS (70%) */}
        <div className="flex-1 min-w-0">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

            {/* COLUMN 1: Daily Working Hours */}
            <div className="space-y-6">

              {/* Daily Title & Toggle */}
              <div className="bg-white rounded-3xl p-6 border border-neutral-150 shadow-sm flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold font-display">{new Date(selectedDate).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short", year: "numeric" })}</h3>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-[#254EDb]">
                    {(!selectedData.is_holiday && !selectedData.is_leave) ? "ON" : "OFF"}
                  </span>
                  <button
                    onClick={() => mutateDate(selectedDate, d => ({ ...d, is_holiday: !d.is_holiday, is_leave: !d.is_leave }))}
                    className={cn(
                      "relative w-10 h-6 rounded-full transition-all duration-200",
                      (!selectedData.is_holiday && !selectedData.is_leave) ? "bg-[#254EDb]" : "bg-neutral-300"
                    )}
                  >
                    <div className={cn("absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-all duration-200", (!selectedData.is_holiday && !selectedData.is_leave) ? "left-5" : "left-1")} />
                  </button>
                </div>
              </div>

              {(!selectedData.is_holiday && !selectedData.is_leave) && (
                <>
                  {/* Working Hours */}
                  <div className="bg-white rounded-3xl p-6 border border-neutral-150 shadow-sm">
                    <h4 className="text-xs font-bold text-muted-foreground flex items-center gap-2 mb-4">
                      <span className="w-4 h-4 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-500"><Clock size={10} /></span> Working Hours
                    </h4>
                    <div className="flex items-center gap-4">
                      <div className="flex-1">
                        <span className="text-[10px] text-muted-foreground block mb-1">Start</span>
                        <div className="border border-neutral-200 rounded-full px-4 py-2 flex items-center">
                          <input
                            type="time"
                            value={selectedData.working_start || "09:00"}
                            onChange={(e) => mutateDate(selectedDate, d => ({ ...d, working_start: e.target.value }))}
                            className="bg-transparent border-none text-sm font-medium w-full focus:outline-none"
                          />
                        </div>
                      </div>
                      <div className="text-neutral-300 mt-4">→</div>
                      <div className="flex-1">
                        <span className="text-[10px] text-muted-foreground block mb-1">End</span>
                        <div className="border border-neutral-200 rounded-full px-4 py-2 flex items-center">
                          <input
                            type="time"
                            value={selectedData.working_end || "17:00"}
                            onChange={(e) => mutateDate(selectedDate, d => ({ ...d, working_end: e.target.value }))}
                            className="bg-transparent border-none text-sm font-medium w-full focus:outline-none"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Breaks */}
                  <div className="bg-white rounded-3xl p-6 border border-neutral-150 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-xs font-bold text-muted-foreground flex items-center gap-2">
                        <span className="w-4 h-4 rounded-full bg-orange-100 flex items-center justify-center text-orange-500"><Coffee size={10} /></span> Breaks <span className="bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full text-[10px]">{selectedData.breaks?.length || 0}</span>
                      </h4>
                      <button
                        onClick={() => mutateDate(selectedDate, d => ({ ...d, breaks: [...(d.breaks || []), { start: "13:00", end: "14:00" }] }))}
                        className="text-[10px] font-bold text-[#254EDb] flex items-center gap-1"
                      >
                        <Plus size={12} /> Add Break
                      </button>
                    </div>
                    <div className="space-y-3">
                      {selectedData.breaks?.map((brk, idx) => (
                        <div key={idx} className="flex items-center gap-2 bg-orange-50/50 p-3 rounded-2xl border border-orange-100/50">
                          <input
                            type="time"
                            value={brk.start}
                            onChange={(e) => mutateDate(selectedDate, d => {
                              const newBreaks = [...d.breaks];
                              newBreaks[idx].start = e.target.value;
                              return { ...d, breaks: newBreaks };
                            })}
                            className="bg-white border border-neutral-200 rounded-full px-2.5 py-1.5 text-xs font-medium flex-1 min-w-0 focus:outline-none"
                          />
                          <div className="text-neutral-300 flex-shrink-0">→</div>
                          <input
                            type="time"
                            value={brk.end}
                            onChange={(e) => mutateDate(selectedDate, d => {
                              const newBreaks = [...d.breaks];
                              newBreaks[idx].end = e.target.value;
                              return { ...d, breaks: newBreaks };
                            })}
                            className="bg-white border border-neutral-200 rounded-full px-2.5 py-1.5 text-xs font-medium flex-1 min-w-0 focus:outline-none"
                          />
                          <button
                            onClick={() => mutateDate(selectedDate, d => {
                              const newBreaks = [...d.breaks];
                              newBreaks.splice(idx, 1);
                              return { ...d, breaks: newBreaks };
                            })}
                            className="p-1.5 flex-shrink-0 text-neutral-400 hover:text-red-500"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* OP Timings */}
                  <div className="bg-white rounded-3xl p-6 border border-neutral-150 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-xs font-bold text-muted-foreground flex items-center gap-2">
                        <span className="w-4 h-4 rounded-full bg-blue-100 flex items-center justify-center text-blue-500"><Building size={10} /></span> OP Timings <span className="bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full text-[10px]">{selectedData.op_timings?.length || 0}</span>
                      </h4>
                      <button
                        onClick={() => mutateDate(selectedDate, d => ({ ...d, op_timings: [...(d.op_timings || []), { start: "15:00", end: "16:00" }] }))}
                        className="text-[10px] font-bold text-[#254EDb] flex items-center gap-1"
                      >
                        <Plus size={12} /> Add OP Timing
                      </button>
                    </div>
                    <div className="space-y-3">
                      {selectedData.op_timings?.map((op, idx) => (
                        <div key={idx} className="flex items-center gap-2 bg-blue-50/50 p-3 rounded-2xl border border-blue-100/50">
                          <input
                            type="time"
                            value={op.start}
                            onChange={(e) => mutateDate(selectedDate, d => {
                              const newOps = [...(d.op_timings || [])];
                              newOps[idx].start = e.target.value;
                              return { ...d, op_timings: newOps };
                            })}
                            className="bg-white border border-neutral-200 rounded-full px-2.5 py-1.5 text-xs font-medium flex-1 min-w-0 focus:outline-none"
                          />
                          <div className="text-neutral-300 flex-shrink-0">→</div>
                          <input
                            type="time"
                            value={op.end}
                            onChange={(e) => mutateDate(selectedDate, d => {
                              const newOps = [...(d.op_timings || [])];
                              newOps[idx].end = e.target.value;
                              return { ...d, op_timings: newOps };
                            })}
                            className="bg-white border border-neutral-200 rounded-full px-2.5 py-1.5 text-xs font-medium flex-1 min-w-0 focus:outline-none"
                          />
                          <button
                            onClick={() => mutateDate(selectedDate, d => {
                              const newOps = [...(d.op_timings || [])];
                              newOps.splice(idx, 1);
                              return { ...d, op_timings: newOps };
                            })}
                            className="p-1.5 flex-shrink-0 text-neutral-400 hover:text-red-500"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* COLUMN 2: Global Config & Preview */}
            <div className="space-y-6">

              {/* Consultation Mode */}
              {ENABLE_VIDEO_CONSULTATION && (
                <div className="bg-white rounded-3xl p-6 border border-neutral-150 shadow-sm">
                  <h4 className="text-xs font-bold text-muted-foreground mb-4">Consultation Mode</h4>
                  <div className="space-y-2">
                    {[
                      { id: "both", label: "Video & In-Clinic", icon: <Building size={14} /> },
                      { id: "video", label: "Video Only", icon: <Video size={14} /> },
                      { id: "clinic", label: "In-Clinic Only", icon: <Building size={14} /> }
                    ].map(mode => (
                      <button
                        key={mode.id}
                        onClick={() => { setConsultationMode(mode.id as any); setHasChanges(true); }}
                        className={cn(
                          "w-full flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all text-sm font-medium",
                          consultationMode === mode.id
                            ? "border-[#254EDb] bg-blue-50/50 text-[#254EDb]"
                            : "border-neutral-200 text-neutral-600 hover:bg-neutral-50"
                        )}
                      >
                        <div className={cn("w-4 h-4 rounded-full border flex items-center justify-center", consultationMode === mode.id ? "border-[#254EDb]" : "border-neutral-300")}>
                          {consultationMode === mode.id && <div className="w-2.5 h-2.5 rounded-full bg-[#254EDb]" />}
                        </div>
                        <span className="flex items-center gap-2">{mode.icon} {mode.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Consultation Fees */}
              <div className="bg-white rounded-3xl p-6 border border-neutral-150 shadow-sm">
                <h4 className="text-xs font-bold text-muted-foreground mb-4">Consultation Fees</h4>
                <div className="space-y-4">
                  {ENABLE_VIDEO_CONSULTATION && consultationMode !== "clinic" && (
                    <div>
                      <label className="text-[10px] text-muted-foreground flex items-center gap-1.5 mb-1"><Video size={12} /> Video Consultation Fee</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500 font-medium">₹</span>
                        <input
                          type="number"
                          value={videoFee}
                          onChange={e => { setVideoFee(Number(e.target.value)); setHasChanges(true); }}
                          className="w-full pl-8 pr-4 py-2 border border-neutral-200 rounded-full text-sm font-medium focus:outline-none focus:border-[#254EDb]"
                        />
                      </div>
                    </div>
                  )}
                  {consultationMode !== "video" && (
                  <div>
                    <label className="text-[10px] text-muted-foreground flex items-center gap-1.5 mb-1"><Building size={12} /> In-Clinic Consultation Fee</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500 font-medium">₹</span>
                      <input
                        type="number"
                        value={clinicFee}
                        onChange={e => { setClinicFee(Number(e.target.value)); setHasChanges(true); }}
                        className="w-full pl-8 pr-4 py-2 border border-neutral-200 rounded-full text-sm font-medium focus:outline-none focus:border-[#254EDb]"
                      />
                    </div>
                  </div>
                  )}
                </div>
              </div>

              {/* Slot Duration */}
              <div className="bg-white rounded-3xl p-6 border border-neutral-150 shadow-sm">
                <h4 className="text-xs font-bold text-muted-foreground mb-4">Slot Duration</h4>
                <div className="flex flex-wrap gap-2">
                  {[15, 20, 30, 45, 60].map(mins => (
                    <button
                      key={mins}
                      onClick={() => { setSlotDuration(mins); setHasChanges(true); }}
                      className={cn(
                        "px-4 py-2 rounded-full text-xs font-bold border transition-all",
                        slotDuration === mins
                          ? "bg-[#254EDb] text-white border-[#254EDb]"
                          : "border-neutral-200 text-neutral-600 hover:bg-neutral-50"
                      )}
                    >
                      {mins}m
                    </button>
                  ))}
                </div>
              </div>

              {/* Buffer Between Slots */}
              <div className="bg-white rounded-3xl p-6 border border-neutral-150 shadow-sm">
                <h4 className="text-xs font-bold text-muted-foreground mb-1">Buffer Between Slots</h4>
                <p className="text-[10px] text-muted-foreground mb-4">Transition time between appointments</p>
                <div className="flex flex-wrap gap-2">
                  {[0, 5, 10, 15].map(mins => (
                    <button
                      key={mins}
                      onClick={() => { setBufferMins(mins); setHasChanges(true); }}
                      className={cn(
                        "px-4 py-2 rounded-full text-xs font-bold border transition-all",
                        bufferMins === mins
                          ? "bg-[#254EDb] text-white border-[#254EDb]"
                          : "border-neutral-200 text-neutral-600 hover:bg-neutral-50"
                      )}
                    >
                      {mins === 0 ? "None" : `${mins}m`}
                    </button>
                  ))}
                </div>
              </div>

            </div>
          </div>
        </div>

      </div>
    </div>
  );
}