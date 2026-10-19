

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { setNavContext } from "@/lib/nav-context-client";
import { ENABLE_VIDEO_CONSULTATION } from "@/lib/feature-flags";
import type { AppointmentRow } from "@/features/appointments/appointments.type";
import { MISSED_BY_LABEL_FOR_PATIENT } from "@/shared/appointments/attendance";
import {
  Calendar,
  CheckCircle2,
  XCircle,
  Video,
  MapPin,
  Search,
  Plus,
  Star,
  FileText,
  Stethoscope,
  UserRound,
  Users,
} from "lucide-react";

type Tab = "upcoming" | "past" | "cancelled";

function StarRating({ value }: { value: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          size={11}
          className={cn(
            value >= s ? "fill-amber-500 text-amber-500" : "text-neutral-200"
          )}
        />
      ))}
    </div>
  );
}

// Avatar generator helper for doctor initials (mirrors Health Records page)
function getDoctorInitials(name: string) {
  if (!name || name.trim() === "") return "DR";
  const cleanName = name.replace(/^Dr\.\s*/i, "").trim();
  const parts = cleanName.split(" ").filter(Boolean);
  if (parts.length > 1) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return cleanName.slice(0, 2).toUpperCase();
}

// Helper to deterministically generate doctor meta details
function getDoctorMeta(doctorName: string, specialty: string) {
  const hash = doctorName.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const qualifications = specialty.includes("Homeopathy") ? ["BHMS", "MD"] :
                         specialty.includes("Naturopathy") ? ["BNYS", "ND"] :
                         specialty.includes("Unani") ? ["BUMS"] :
                         specialty.includes("Siddha") ? ["BSMS"] : ["BAMS", "MD (Ayur)"];
  const languages = hash % 2 === 0 ? ["English", "Hindi"] : ["English", "Tamil", "Hindi"];
  return { qualifications, languages };
}

function splitDateTime(dateText: string): { d: string; t: string } {
  if (dateText.startsWith("Today, ")) {
    return { d: "Today", t: dateText.slice("Today, ".length) };
  }
  const parts = dateText.split(" · ");
  if (parts.length === 2) return { d: parts[0], t: parts[1] };
  return { d: dateText, t: "" };
}

async function fetchAppointments(): Promise<AppointmentRow[]> {
  const response = await fetch("/api/appointments", {
    method: "GET",
    credentials: "include",
    cache: "no-store",
  });

  const result = await response.json();

  if (!response.ok || !result.success) {
    throw new Error(result.message || "Unable to load appointments");
  }

  return result.data as AppointmentRow[];
}

async function cancelAppointment(appointmentId: string, reason: string): Promise<void> {
  const response = await fetch("/api/appointments", {
    method: "DELETE",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ appointmentId, reason }),
  });

  const result = await response.json();

  if (!response.ok || !result.success) {
    throw new Error(result.message || "Unable to cancel appointment");
  }
}

export default function AppointmentsPage() {
  const router = useRouter();
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [processingCancelId, setProcessingCancelId] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDoctorName, setSelectedDoctorName] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("upcoming");
  const [isExpanded, setIsExpanded] = useState(false);

  async function loadAppointments(): Promise<void> {
    try {
      setLoading(true);
      setError("");
      const data = await fetchAppointments();
      setAppointments(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load appointments");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAppointments();
  }, []);

  // Overall stats across every doctor
  const upcoming = appointments.filter((a) => a.status === "upcoming");
  const past = appointments.filter((a) => a.status === "past");
  const cancelled = appointments.filter((a) => a.status === "cancelled");
  // Group appointments by doctor (Health Records style directory)
  const doctorGroups: Record<string, AppointmentRow[]> = {};
  appointments.forEach((appt) => {
    const key = appt.doctor || "Medical Practitioner";
    if (!doctorGroups[key]) doctorGroups[key] = [];
    doctorGroups[key].push(appt);
  });

  const uniqueDoctors = Object.entries(doctorGroups).map(([name, list]) => ({
    name,
    specialty: list[0]?.specialty || "Ayurveda",
    list,
    totalCount: list.length,
    upcomingCount: list.filter((a) => a.status === "upcoming").length,
    pastCount: list.filter((a) => a.status === "past").length,
    cancelledCount: list.filter((a) => a.status === "cancelled").length,
  }));

  const filteredDoctors = uniqueDoctors.filter((d) =>
    !searchQuery.trim() || d.name.toLowerCase().includes(searchQuery.trim().toLowerCase())
  );

  const doctorNamesKey = filteredDoctors.map((d) => d.name).join("|");

  useEffect(() => {
    if (filteredDoctors.length > 0) {
      const exists = filteredDoctors.some((d) => d.name === selectedDoctorName);
      if (!exists) {
        setSelectedDoctorName(filteredDoctors[0].name);
      }
    } else {
      setSelectedDoctorName(null);
    }
  }, [doctorNamesKey]);

  const activeDoctor = uniqueDoctors.find((d) => d.name === selectedDoctorName);

  function selectDoctor(name: string) {
    setSelectedDoctorName(name);
    setActiveTab("upcoming");
    setIsExpanded(false);
  }

  const todayStr = new Date().toLocaleDateString("en-CA");

  const doctorTabList = (activeDoctor?.list || []).filter((a) => a.status === activeTab);
  const sortedDoctorTabList = [...doctorTabList].sort((a, b) => {
    if (activeTab === "upcoming") {
      return new Date(`${a.dateRaw}T${a.timeRaw}`).getTime() - new Date(`${b.dateRaw}T${b.timeRaw}`).getTime();
    }
    return new Date(b.dateRaw).getTime() - new Date(a.dateRaw).getTime();
  });
  const displayList = sortedDoctorTabList.slice(0, isExpanded ? undefined : 5);

  async function handleCancel(id: string) {
    if (processingCancelId) return;
    setProcessingCancelId(id);
    try {
      await cancelAppointment(id, "Cancelled by patient");
      setCancellingId(null);
      alert("Appointment cancelled successfully");
      try {
        await loadAppointments();
      } catch (err) {
        // The cancellation itself succeeded; only the list refresh failed.
        console.error("Failed to refresh appointments after cancellation:", err);
      }
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Failed to cancel appointment");
    } finally {
      setProcessingCancelId(null);
    }
  }

  function renderAppointmentRow(appt: AppointmentRow) {
    const isUpcoming = appt.status === "upcoming";
    const isPast = appt.status === "past";
    const isCancelled = appt.status === "cancelled";
    const isTodayAppt = isUpcoming && appt.dateRaw === todayStr;
    const { d: dateOnly, t: timeOnly } = splitDateTime(appt.date);

    const isMissed = isPast && appt.pastOutcome === "missed";
    const isAwaitingNotes = isPast && appt.pastOutcome === "awaiting_notes";

    const statusPill = isUpcoming && appt.inSession
      ? { label: "In Session", cls: "bg-emerald-50 text-emerald-700 border-emerald-100" }
      : isUpcoming && appt.arrived
      ? { label: "Arrived", cls: "bg-indigo-50 text-indigo-700 border-indigo-100" }
      : isUpcoming
      ? { label: "Confirmed", cls: "bg-emerald-50 text-emerald-700 border-emerald-100" }
      : isMissed
      ? { label: "Missed", cls: "bg-amber-50 text-amber-700 border-amber-100" }
      : isAwaitingNotes
      ? { label: "Prescription Pending", cls: "bg-violet-50 text-violet-700 border-violet-100" }
      : isPast
      ? { label: "Completed", cls: "bg-slate-100 text-slate-500 border-slate-200" }
      : { label: "Cancelled", cls: "bg-red-50 text-red-500 border-red-100" };

    return (
      <div key={appt.id} className="relative pl-10 flex items-start gap-4 group">
        {/* Timeline Dot Icon */}
        <div className="absolute left-0.5 top-1.5 w-8 h-8 rounded-full border border-slate-200 bg-white flex items-center justify-center shadow-sm group-hover:border-herb-green/50 group-hover:shadow transition-all">
          <Calendar className="w-3.5 h-3.5 text-slate-500 group-hover:text-herb-green transition-colors" />
        </div>

        {/* Appointment Card */}
        <div className="flex-1 bg-white border border-slate-200 hover:border-slate-300 rounded-2xl p-5 sm:p-6 shadow-sm hover:shadow-md transition-all flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-2.5">
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="font-semibold text-base text-slate-900">{dateOnly}</span>
                {timeOnly && <span className="text-sm text-slate-500 font-medium">{timeOnly}</span>}
                <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-md border uppercase tracking-wide", statusPill.cls)}>
                  {statusPill.label}
                </span>
                {isTodayAppt && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-100 text-amber-700 uppercase tracking-wide animate-pulse">
                    Today
                  </span>
                )}
              </div>

              {appt.bookedFor && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-lg border",
                      appt.bookedFor.isFamilyMember
                        ? "bg-indigo-50 text-indigo-700 border-indigo-100"
                        : "bg-slate-50 text-slate-700 border-slate-200"
                    )}
                  >
                    {appt.bookedFor.isFamilyMember ? <Users size={12} /> : <UserRound size={12} />}
                    <span className="text-slate-500 font-medium">For</span>
                    <span className="capitalize">{appt.bookedFor.name}</span>
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    {appt.bookedFor.isFamilyMember
                      ? `Family member${appt.bookedFor.relationship ? ` · ${appt.bookedFor.relationship}` : ""}`
                      : "Account owner"}
                  </span>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-slate-600 font-medium">
                <span className="flex items-center gap-1.5">
                  {ENABLE_VIDEO_CONSULTATION && appt.mode === "video" ? (
                    <Video size={12} className="text-herb-green" />
                  ) : (
                    <MapPin size={12} className="text-slate-400" />
                  )}
                  {ENABLE_VIDEO_CONSULTATION && appt.mode === "video" ? "Video Consultation" : "In-Clinic Visit"}
                </span>
                <span>Fee: <span className="font-bold text-slate-800">{appt.fee}</span></span>
                {isPast && appt.rating && (
                  <span className="flex items-center gap-1.5">
                    <StarRating value={appt.rating} />
                  </span>
                )}
              </div>

              {isMissed && appt.missedBy && (
                <p className="text-[11px] text-amber-700 font-semibold">
                  {appt.patientLeft ? "Closed — you left before the consultation" : MISSED_BY_LABEL_FOR_PATIENT[appt.missedBy]}
                </p>
              )}

              {isAwaitingNotes && (
                <p className="text-[11px] text-violet-700">
                  Your consultation is done — your doctor is preparing your prescription.
                </p>
              )}

              {isCancelled && appt.reason && (
                <p className="text-[11px] text-red-600">
                  <span className="font-bold">Reason:</span> {appt.reason}
                  {appt.refunded && <span className="text-emerald-700 font-bold"> · Full refund processed.</span>}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
              {ENABLE_VIDEO_CONSULTATION && isUpcoming && appt.mode === "video" && (
                <button
                  onClick={async () => {
                    await setNavContext("video", { appointmentId: appt.id });
                    router.push("/waiting-room");
                  }}
                  className="inline-flex items-center justify-center gap-1.5 rounded-full bg-herb-green px-4 py-2 text-xs font-bold text-white hover:bg-herb-green/90 transition-colors"
                >
                  <Video size={13} />
                  Join
                </button>
              )}

              {isCancelled ? (
                <Link href="/discover">
                  <button className="py-2 px-4 rounded-full bg-herb-green/10 hover:bg-herb-green/15 active:scale-[0.98] font-bold text-xs text-herb-green transition-all cursor-pointer">
                    Book Replacement
                  </button>
                </Link>
              ) : isUpcoming ? (
                <button
                  onClick={async () => {
                    await setNavContext("doctor", { doctorId: appt.practitionerId });
                    router.push("/doctor");
                  }}
                  className="py-2 px-4 rounded-full bg-herb-green/10 hover:bg-herb-green/15 active:scale-[0.98] text-xs font-bold text-herb-green transition-all cursor-pointer"
                >
                  View Doctor
                </button>
              ) : null}

              {isUpcoming && !appt.inSession && !appt.arrived && (
                <button
                  onClick={() => setCancellingId(cancellingId === appt.id ? null : appt.id)}
                  className="py-2 px-4 rounded-full border border-neutral-200 hover:border-red-200 hover:bg-red-50 text-neutral-500 hover:text-red-500 text-xs font-bold transition-all cursor-pointer"
                >
                  Cancel
                </button>
              )}

              {isPast && appt.hasPrescription && (
                <Link href="/prescription" className="flex items-center gap-1 text-[11px] font-bold text-herb-green hover:underline">
                  <FileText size={12} />
                  Prescription
                </Link>
              )}
            </div>
          </div>

          {cancellingId === appt.id && (
            <div className="p-3.5 bg-red-50/50 border border-red-200/80 rounded-xl animate-in fade-in slide-in-from-top-1.5 duration-200">
              <h4 className="text-xs font-bold text-red-800">Cancel this appointment?</h4>
              <p className="text-[10px] text-red-700 mt-1 leading-relaxed font-semibold">
                Free cancellation up to 24h prior. Full refund in 3–5 business days.
              </p>
              <div className="flex gap-2 mt-3 max-w-xs">
                <button
                  onClick={() => setCancellingId(null)}
                  disabled={processingCancelId === appt.id}
                  className="flex-1 py-2 bg-white hover:bg-neutral-50 border border-neutral-200 text-neutral-600 rounded-full text-xs font-bold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Keep
                </button>
                <button
                  onClick={() => handleCancel(appt.id)}
                  disabled={processingCancelId === appt.id}
                  className="flex-1 py-2 bg-red-500 hover:bg-red-600 text-white rounded-full text-xs font-bold transition-all active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {processingCancelId === appt.id ? "Cancelling…" : "Confirm Cancel"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] overflow-hidden bg-slate-50/50 flex flex-col">
      {/* TOP HEADER */}
      <div className="bg-white border-b border-slate-200 flex-shrink-0">
        <div className="max-w-[1600px] mx-auto px-6 lg:px-8 py-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Appointments</h1>
              <p className="text-sm text-slate-500 mt-1 max-w-xl">
                {ENABLE_VIDEO_CONSULTATION
                  ? "Manage your consultations, join video clinics, and track prescriptions"
                  : "Manage your clinic visits and track prescriptions"}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto mt-2 sm:mt-0">
              {/* Search Bar — search by doctor name */}
              <div className="relative w-full sm:w-72 lg:w-80">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-slate-400" />
                </div>
                <input
                  type="text"
                  placeholder="Search doctor name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-full pl-10 pr-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-herb-green/20 focus:border-herb-green transition-all shadow-sm placeholder:text-slate-400 font-medium"
                />
              </div>

              <Link href="/discover" className="flex-shrink-0 w-full sm:w-auto">
                <button className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-5 py-2.5 bg-herb-green hover:bg-herb-green-light active:scale-[0.98] text-white text-xs font-bold rounded-full shadow-xs transition-all cursor-pointer">
                  <Plus size={14} className="stroke-[3]" />
                  <span>Book Consultation</span>
                </button>
              </Link>
            </div>
          </div>

          {/* Statistics Summary Row */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3.5 select-none mt-5">
            <div className="bg-slate-50/70 rounded-xl p-3.5 border border-slate-150 flex items-center gap-3">
              <div className="w-9 h-9 bg-indigo-50 border border-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
                <Calendar size={16} />
              </div>
              <div>
                <p className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">Upcoming</p>
                <h3 className="text-base font-black text-slate-900 mt-0.5 font-mono">{upcoming.length}</h3>
              </div>
            </div>
            <div className="bg-slate-50/70 rounded-xl p-3.5 border border-slate-150 flex items-center gap-3">
              <div className="w-9 h-9 bg-emerald-50 border border-emerald-100 text-emerald-600 rounded-lg flex items-center justify-center flex-shrink-0">
                <CheckCircle2 size={16} />
              </div>
              <div>
                <p className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">Completed</p>
                <h3 className="text-base font-black text-slate-900 mt-0.5 font-mono">{past.length}</h3>
              </div>
            </div>
            <div className="bg-slate-50/70 rounded-xl p-3.5 border border-slate-150 flex items-center gap-3">
              <div className="w-9 h-9 bg-red-50 border border-red-100 text-red-500 rounded-lg flex items-center justify-center flex-shrink-0">
                <XCircle size={16} />
              </div>
              <div>
                <p className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">Cancelled</p>
                <h3 className="text-base font-black text-slate-900 mt-0.5 font-mono">{cancelled.length}</h3>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Loading / Error States */}
      {loading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-10 h-10 rounded-full border-3 border-herb-green border-t-transparent animate-spin" />
        </div>
      )}

      {!loading && error && (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="bg-red-50 border border-red-200 rounded-3xl p-6 text-center max-w-md">
            <p className="text-xs font-bold text-red-600">{error}</p>
          </div>
        </div>
      )}

      {/* SPLIT WORKSPACE */}
      {!loading && !error && (
        <div className="flex-1 overflow-hidden flex max-w-[1600px] mx-auto w-full border-x border-slate-200 bg-white shadow-sm my-0">
          {/* LEFT SIDEBAR: Doctor Directory */}
          <div className="w-[350px] lg:w-[380px] border-r border-slate-200 bg-white flex flex-col flex-shrink-0">
            <div className="p-6 border-b border-slate-100 bg-white">
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">Doctor Directory</h2>
              <p className="text-xs text-slate-500 mt-1">Select a doctor to view their appointments</p>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 p-2 space-y-1">
              {filteredDoctors.map((doc) => {
                const isSelected = selectedDoctorName === doc.name;
                const docInitials = getDoctorInitials(doc.name);

                return (
                  <div
                    key={doc.name}
                    onClick={() => selectDoctor(doc.name)}
                    className={cn(
                      "p-4 rounded-xl cursor-pointer transition-all flex items-start justify-between group",
                      isSelected
                        ? "bg-herb-green/8 border border-herb-green/15 shadow-sm"
                        : "hover:bg-slate-50 border border-transparent"
                    )}
                  >
                    <div className="flex items-center gap-3.5">
                      <div className={cn(
                        "w-12 h-12 rounded-full flex items-center justify-center font-bold text-base shadow-sm flex-shrink-0 transition-transform",
                        isSelected
                          ? "bg-gradient-to-br from-herb-green to-teal-600 text-white shadow-herb-green/20"
                          : "bg-slate-100 border border-slate-200 text-slate-500 group-hover:bg-herb-green/5 group-hover:text-herb-green group-hover:border-herb-green/15"
                      )}>
                        {docInitials}
                      </div>
                      <div className="min-w-0 flex flex-col justify-center">
                        <h4 className={cn("font-bold text-sm transition-colors truncate", isSelected ? "text-slate-900" : "text-slate-700 group-hover:text-slate-900")}>
                          {doc.name.startsWith("Dr.") ? doc.name : `Dr. ${doc.name}`}
                        </h4>
                        <p className={cn("text-[11px] font-medium mt-0.5", isSelected ? "text-slate-500" : "text-slate-400")}>
                          {doc.upcomingCount} upcoming · {doc.pastCount} past · {doc.cancelledCount} cancelled
                        </p>
                      </div>
                    </div>
                    <span className={cn(
                      "text-[10px] font-bold px-2 py-0.5 rounded-full tracking-wide transition-colors flex-shrink-0 mt-1",
                      isSelected
                        ? "text-herb-green bg-herb-green/10"
                        : "text-slate-500 group-hover:text-herb-green"
                    )}>
                      {doc.totalCount} {doc.totalCount === 1 ? "Visit" : "Visits"}
                    </span>
                  </div>
                );
              })}

              {filteredDoctors.length === 0 && (
                <div className="text-center py-12 px-4">
                  <Stethoscope className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                  <h4 className="text-sm font-semibold text-slate-700">No doctors found</h4>
                  <p className="text-xs text-slate-400 mt-1 max-w-[200px] mx-auto leading-relaxed">
                    {appointments.length === 0
                      ? "You have no appointments yet."
                      : "Try adjusting your search query."}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT WORKSPACE: Selected Doctor's Appointments */}
          <div className="flex-1 overflow-y-auto bg-slate-50/30 p-8 flex flex-col">
            {!activeDoctor ? (
              <div className="flex-1 flex flex-col items-center justify-center max-w-2xl mx-auto text-center py-20">
                <div className="w-20 h-20 bg-herb-green/8 border border-herb-green/15 rounded-2xl flex items-center justify-center shadow-sm mb-6">
                  <Calendar className="w-10 h-10 text-herb-green" />
                </div>
                <h3 className="text-xl font-bold text-slate-900">No Appointments Found</h3>
                <p className="text-sm text-slate-500 mt-2 max-w-md">
                  You have no consultations scheduled. Book a session to consult with verified AYUSH experts.
                </p>
                <Link href="/discover" className="inline-block mt-5">
                  <button className="px-5 py-2.5 bg-herb-green hover:bg-herb-green-light active:scale-95 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer">
                    Browse Practitioners
                  </button>
                </Link>
              </div>
            ) : (
              <div className="max-w-4xl mx-auto w-full">
                <div className="flex items-center justify-between mb-6 border-b border-slate-200 pb-6">
                  <div>
                    <h2 className="text-2xl font-bold text-slate-900">
                      {activeDoctor.name.startsWith("Dr.") ? activeDoctor.name : `Dr. ${activeDoctor.name}`}
                    </h2>
                    <p className="text-sm text-slate-500 mt-1">
                      {getDoctorMeta(activeDoctor.name, activeDoctor.specialty).qualifications.join(", ")} · {activeDoctor.specialty}
                    </p>
                  </div>
                </div>

                {/* Segmented Tab Control — scoped to this doctor */}
                <div className="flex gap-1.5 bg-neutral-100/80 rounded-2xl p-1.5 w-fit select-none shadow-3xs mb-6">
                  {(["upcoming", "past", "cancelled"] as Tab[]).map((tab) => {
                    const active = activeTab === tab;
                    const count = tab === "upcoming" ? activeDoctor.upcomingCount : tab === "past" ? activeDoctor.pastCount : activeDoctor.cancelledCount;
                    return (
                      <button
                        key={tab}
                        onClick={() => { setActiveTab(tab); setIsExpanded(false); }}
                        className={cn(
                          "px-5 py-2.5 text-xs font-bold rounded-xl capitalize transition-all duration-200 cursor-pointer flex items-center gap-1.5 active:scale-[0.98]",
                          active
                            ? "bg-white text-herb-green shadow-xs"
                            : "text-muted-foreground/80 hover:text-foreground hover:bg-neutral-50/50"
                        )}
                      >
                        <span>{tab}</span>
                        <span className={cn(
                          "text-[10px] font-extrabold px-1.5 py-0.5 rounded-md leading-none border transition-all",
                          active
                            ? "bg-herb-green/5 text-herb-green border-herb-green/15"
                            : "bg-neutral-200 text-neutral-600 border-transparent"
                        )}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {displayList.length > 0 ? (
                  <div className="space-y-6 relative before:absolute before:left-[17px] before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                    {displayList.map((appt) => renderAppointmentRow(appt))}

                    {sortedDoctorTabList.length > 5 && (
                      <div className="pt-2 pl-10 flex justify-start">
                        <button
                          onClick={() => setIsExpanded((v) => !v)}
                          className="text-sm font-medium text-herb-green hover:text-herb-green-light hover:underline transition-colors focus:outline-none cursor-pointer"
                        >
                          {isExpanded ? "View Less" : "View More"}
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center shadow-2xs space-y-4">
                    <span className="text-5xl inline-block animate-bounce">
                      {activeTab === "upcoming" ? "🗓️" : activeTab === "past" ? "✓" : "✕"}
                    </span>
                    <h3 className="text-base font-black text-slate-900">
                      No {activeTab} Appointments
                    </h3>
                    <p className="text-xs text-slate-500 max-w-xs mx-auto leading-relaxed font-medium">
                      {activeTab === "upcoming"
                        ? `You have no upcoming consultations with ${activeDoctor.name}.`
                        : `There are no ${activeTab} appointments with ${activeDoctor.name}.`}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
} 


