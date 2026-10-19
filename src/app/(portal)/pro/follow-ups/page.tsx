"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/auth-context";
import { usePractitionerUpcomingCalls } from "@/hooks/use-consultations";
import type { FollowUpRow } from "./type";
import {
  Calendar, Clock, User, AlertCircle, CheckCircle2, 
  CalendarDays, Activity, Inbox, ChevronRight, Video, MapPin, 
  Plus, MoreHorizontal, UserCheck
} from "lucide-react";

type Filter = "today" | "week" | "overdue" | "completed";

const FILTER_LABELS: Record<Filter, string> = {
  today: "Today",
  week: "Upcoming",
  overdue: "Overdue",
  completed: "Completed",
};

const STATUS_STYLES: Record<Filter, string> = {
  today: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  week: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
  overdue: "bg-red-50 text-red-700 ring-1 ring-red-200",
  completed: "bg-gray-100 text-gray-700 ring-1 ring-gray-200",
};

async function fetchFollowUps(): Promise<FollowUpRow[]> {
  const response = await fetch("/api/follow-up", { method: "GET", credentials: "include", cache: "no-store" });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.error || "Unable to load follow-ups");
  }
  return result.data as FollowUpRow[];
}

async function updateFollowUpDate(followUpId: string, recommendedDate: string): Promise<void> {
  const response = await fetch("/api/follow-up", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "updateDate", followUpId, recommendedDate }),
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.error || "Unable to update follow-up date");
  }
}

export default function FollowUpsPage() {
  const { user } = useAuth();
  const [followUps, setFollowUps] = useState<FollowUpRow[]>([]);
  const [loading, setLoading] = useState(true);
  const { data: upcomingCalls } = usePractitionerUpcomingCalls(user?.id);

  const [activeFilter, setActiveFilter] = useState<Filter>("today");
  const [schedulingId, setSchedulingId] = useState<string | null>(null);
  const [followUpDate, setFollowUpDate] = useState("");
  const [followUpNote, setFollowUpNote] = useState("");

  async function loadFollowUps(): Promise<void> {
    try {
      setLoading(true);
      const data = await fetchFollowUps();
      setFollowUps(data);
    } catch (err) {
      console.error("Failed to load follow-ups:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadFollowUps();
  }, []);

  function getFollowUpFilter(recommendedDateStr: string, isBooked: boolean): Filter {
    if (isBooked) return "completed";
    if (!recommendedDateStr) return "today";
    
    const recDate = new Date(recommendedDateStr);
    const today = new Date();
    today.setHours(0,0,0,0);
    recDate.setHours(0,0,0,0);

    const diffTime = recDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "today";
    if (diffDays < 0) return "overdue";
    return "week"; 
  }

  const formattedFollowUps = (followUps || []).map((fu) => {
    const filter = getFollowUpFilter(fu.recommendedDate, fu.isBooked);
    const dateLabel = fu.isBooked
      ? "Completed"
      : filter === "today"
      ? "Today"
      : filter === "overdue"
      ? `Overdue (${fu.recommendedDate ? new Date(fu.recommendedDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : ""})`
      : fu.recommendedDate ? new Date(fu.recommendedDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

    return {
      id: fu.id,
      patient: fu.patientName,
      initials: fu.patientInitials,
      age: fu.patientAge,
      gender: "Not specified",
      patientId: `PT-${fu.id.substring(0, 5).toUpperCase()}`,
      lastVisit: "Recent Consult",
      dueDate: dateLabel,
      dueDateRaw: fu.recommendedDate,
      reason: fu.isBooked ? "Scheduled consultation complete." : "Routine follow-up check-in.",
      filter,
      mode: "video" as const,
    };
  });

  const formattedUpcomingCalls = (upcomingCalls || []).map((call: any) => {
    const filter = getFollowUpFilter(call.date, false);
    return {
      id: `upcoming-${call.id}`,
      patient: call.patientName,
      initials: call.patientName.split(" ").filter((w: string) => w).map((w: string) => w[0]).join("").slice(0, 2).toUpperCase(),
      age: 35, 
      gender: "Not specified",
      patientId: `PT-${call.id.substring(0, 5).toUpperCase()}`,
      lastVisit: "Upcoming Call",
      dueDate: `${new Date(call.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })} at ${call.time}`,
      dueDateRaw: call.date,
      reason: "Session Fixed",
      filter: filter === "completed" ? "week" : filter,
      mode: "video" as const,
    };
  });

  const allFollowUps = [...formattedFollowUps, ...formattedUpcomingCalls];
  const filtered = allFollowUps.filter((f) => f.filter === activeFilter);

  const counts: Record<Filter, number> = {
    today: allFollowUps.filter((f) => f.filter === "today").length,
    week: allFollowUps.filter((f) => f.filter === "week").length,
    overdue: allFollowUps.filter((f) => f.filter === "overdue").length,
    completed: allFollowUps.filter((f) => f.filter === "completed").length,
  };

  async function handleSchedule(id: string) {
    if (!followUpDate) return;
    try {
      await updateFollowUpDate(id, followUpDate);
      setSchedulingId(null);
      setFollowUpDate("");
      setFollowUpNote("");
      await loadFollowUps();
    } catch (err) {
      console.error("Failed to update follow-up recommended date:", err);
    }
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="max-w-[1200px] mx-auto px-6 py-10">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-[32px] font-bold text-gray-900 tracking-tight leading-tight">Follow-up Dashboard</h1>
            <p className="text-[15px] text-gray-500 mt-1 font-medium">Manage scheduled patient follow-ups, upcoming reviews, overdue appointments, and completed check-ins.</p>
          </div>
          <button className="inline-flex items-center gap-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white px-5 py-2.5 rounded-[12px] font-semibold text-[15px] transition-all shadow-sm flex-shrink-0">
            <Plus className="w-5 h-5" />
            Schedule Follow-up
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 rounded-full border-2 border-[#2563EB] border-t-transparent animate-spin" />
          </div>
        ) : (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
              <div className="bg-white rounded-[16px] border border-[#E5E7EB] p-5 shadow-[0_2px_8px_rgba(0,0,0,0.02)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.05)] transition-all">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center">
                    <CalendarDays className="w-5 h-5 text-emerald-600" />
                  </div>
                </div>
                <p className="text-[32px] font-bold text-gray-900 leading-none">{counts.today}</p>
                <p className="text-[14px] font-medium text-gray-500 mt-2">Today's Follow-ups</p>
              </div>

              <div className="bg-white rounded-[16px] border border-[#E5E7EB] p-5 shadow-[0_2px_8px_rgba(0,0,0,0.02)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.05)] transition-all">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center">
                    <Calendar className="w-5 h-5 text-[#2563EB]" />
                  </div>
                </div>
                <p className="text-[32px] font-bold text-gray-900 leading-none">{counts.week}</p>
                <p className="text-[14px] font-medium text-gray-500 mt-2">Upcoming</p>
              </div>

              <div className="bg-white rounded-[16px] border border-[#E5E7EB] p-5 shadow-[0_2px_8px_rgba(0,0,0,0.02)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.05)] transition-all">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center">
                    <AlertCircle className="w-5 h-5 text-red-600" />
                  </div>
                </div>
                <p className="text-[32px] font-bold text-gray-900 leading-none">{counts.overdue}</p>
                <p className="text-[14px] font-medium text-gray-500 mt-2">Overdue</p>
              </div>

              <div className="bg-white rounded-[16px] border border-[#E5E7EB] p-5 shadow-[0_2px_8px_rgba(0,0,0,0.02)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.05)] transition-all">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center">
                    <CheckCircle2 className="w-5 h-5 text-gray-600" />
                  </div>
                </div>
                <p className="text-[32px] font-bold text-gray-900 leading-none">{counts.completed}</p>
                <p className="text-[14px] font-medium text-gray-500 mt-2">Completed</p>
              </div>
            </div>

            {/* Segmented Controls */}
            <div className="flex items-center bg-gray-100/80 p-1.5 rounded-full w-fit mb-6 border border-gray-200/60">
              {(["today", "week", "overdue", "completed"] as Filter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setActiveFilter(f)}
                  className={cn(
                    "px-6 py-2 rounded-full text-[14px] font-semibold transition-all duration-200",
                    activeFilter === f 
                      ? "bg-white text-[#2563EB] shadow-[0_1px_4px_rgba(0,0,0,0.1)]" 
                      : "text-gray-500 hover:text-gray-900 hover:bg-gray-200/50"
                  )}
                >
                  {FILTER_LABELS[f]}
                </button>
              ))}
            </div>

            {/* List */}
            <div className="space-y-4">
              {filtered.length === 0 ? (
                <div className="bg-white rounded-[16px] border border-[#E5E7EB] p-16 text-center shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
                  <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-5">
                    <Inbox className="w-10 h-10 text-gray-400" />
                  </div>
                  <h3 className="text-[22px] font-bold text-gray-900">No follow-ups scheduled</h3>
                  <p className="text-[15px] text-gray-500 mt-2 max-w-sm mx-auto">Newly scheduled follow-ups and patient check-ins will appear here.</p>
                  <button className="mt-8 inline-flex items-center gap-2 bg-white border border-[#E5E7EB] hover:bg-gray-50 text-gray-900 px-5 py-2.5 rounded-[12px] font-semibold text-[15px] transition-all shadow-sm">
                    Schedule Follow-up
                  </button>
                </div>
              ) : (
                filtered.map((fu) => (
                  <div
                    key={fu.id}
                    className="bg-white rounded-[16px] border border-[#E5E7EB] shadow-[0_2px_8px_rgba(0,0,0,0.02)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)] transition-all overflow-hidden"
                  >
                    <div className="p-6">
                      <div className="flex flex-col lg:flex-row gap-6 lg:items-center">
                        
                        {/* Left: Patient Info */}
                        <div className="flex items-center gap-4 lg:w-[280px] flex-shrink-0">
                          <div className="w-12 h-12 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center flex-shrink-0">
                            <span className="font-bold text-indigo-700 text-[15px]">{fu.initials}</span>
                          </div>
                          <div>
                            <p className="text-[16px] font-bold text-gray-900">{fu.patient}</p>
                            <div className="flex items-center gap-2 text-[13px] text-gray-500 mt-1 font-medium">
                              <span>{fu.age}y</span>
                              <span className="w-1 h-1 rounded-full bg-gray-300"></span>
                              <span>{fu.gender}</span>
                              <span className="w-1 h-1 rounded-full bg-gray-300"></span>
                              <span>{fu.patientId}</span>
                            </div>
                          </div>
                        </div>

                        <div className="hidden lg:block w-[1px] h-12 bg-gray-100"></div>

                        {/* Middle: Details */}
                        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <p className="text-[13px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Schedule & Type</p>
                            <div className="flex items-center gap-1.5 text-[15px] font-medium text-gray-900">
                              <Calendar className="w-4 h-4 text-gray-400" />
                              {fu.dueDate}
                              <span className="mx-1 text-gray-300">•</span>
                              {fu.mode === "video" ? <Video className="w-4 h-4 text-gray-400" /> : <MapPin className="w-4 h-4 text-gray-400" />}
                              <span className="text-[14px] text-gray-600">{fu.mode === "video" ? "Video" : "In-Clinic"}</span>
                            </div>
                          </div>
                          <div>
                            <p className="text-[13px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Reason</p>
                            <div className="flex items-center gap-1.5 text-[15px] font-medium text-gray-900 line-clamp-1">
                              <Activity className="w-4 h-4 text-gray-400" />
                              {fu.reason}
                            </div>
                          </div>
                        </div>

                        {/* Right: Badge & Actions */}
                        <div className="flex flex-row lg:flex-col items-center lg:items-end justify-between gap-4 lg:w-[140px] flex-shrink-0 border-t lg:border-t-0 border-gray-100 pt-4 lg:pt-0">
                          <span className={cn("text-[13px] font-semibold px-3 py-1 rounded-full", STATUS_STYLES[fu.filter])}>
                            {fu.filter === "today" && "Today"}
                            {fu.filter === "week" && "Upcoming"}
                            {fu.filter === "overdue" && "Overdue"}
                            {fu.filter === "completed" && "Completed"}
                          </span>
                        </div>
                      </div>

                      {/* Bottom Actions */}
                      <div className="mt-6 flex items-center gap-3 pt-4 border-t border-gray-50">
                        {fu.filter !== "completed" && (
                          <button
                            onClick={() => setSchedulingId(schedulingId === fu.id ? null : fu.id)}
                            className="bg-white border border-[#E5E7EB] hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-[10px] font-semibold text-[14px] transition-all shadow-sm"
                          >
                            Reschedule
                          </button>
                        )}
                        <button className="bg-white text-[#2563EB] hover:bg-blue-50 px-4 py-2 rounded-[10px] font-semibold text-[14px] transition-all ml-auto inline-flex items-center gap-1">
                          View Details
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Inline scheduler */}
                    {schedulingId === fu.id && (
                      <div className="border-t border-[#E5E7EB] bg-gray-50/50 p-6">
                        <div className="max-w-xl">
                          <p className="text-[15px] font-semibold text-gray-900 mb-4">Reschedule Follow-up</p>
                          <div className="space-y-4">
                            <div>
                              <label className="text-[13px] font-medium text-gray-700 block mb-1.5">
                                New Recommended Date
                              </label>
                              <input
                                type="date"
                                value={followUpDate}
                                onChange={(e) => setFollowUpDate(e.target.value)}
                                min={new Date().toISOString().split("T")[0]}
                                className="w-full text-[15px] border border-[#E5E7EB] rounded-[10px] px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] bg-white transition-all shadow-sm"
                              />
                            </div>
                            <div>
                              <label className="text-[13px] font-medium text-gray-700 block mb-1.5">
                                Follow-up Note (optional)
                              </label>
                              <textarea
                                rows={2}
                                value={followUpNote}
                                onChange={(e) => setFollowUpNote(e.target.value)}
                                placeholder="Reason for changing follow-up date…"
                                className="w-full text-[15px] border border-[#E5E7EB] rounded-[10px] px-3.5 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] bg-white transition-all shadow-sm"
                              />
                            </div>
                            <div className="flex gap-3 pt-2">
                              <button
                                onClick={() => handleSchedule(fu.id)}
                                disabled={!followUpDate}
                                className={cn(
                                  "px-5 py-2.5 text-[14px] font-semibold rounded-[10px] transition-all shadow-sm",
                                  followUpDate ? "bg-[#2563EB] text-white hover:bg-[#1D4ED8]" : "bg-gray-100 text-gray-400 cursor-not-allowed"
                                )}
                              >
                                Confirm Update
                              </button>
                              <button
                                onClick={() => setSchedulingId(null)}
                                className="px-5 py-2.5 border border-[#E5E7EB] rounded-[10px] text-[14px] font-medium text-gray-600 hover:bg-gray-50 bg-white shadow-sm"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
