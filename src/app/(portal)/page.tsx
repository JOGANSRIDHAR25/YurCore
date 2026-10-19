"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ABHABadge } from "@/components/Badges";
import { PractitionerCard } from "@/components/PractitionerCard";
import { UpcomingCarousel } from "@/components/UpcomingCarousel";
import { useAppointments } from "@/hooks/use-appointments";
import { usePatientUpcomingCalls, fetchDetailedConsultations } from "@/hooks/use-consultations";
import { usePractitioners } from "@/hooks/use-discover";
import { usePatientProfile } from "@/hooks/use-profile";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/auth-context";
import { ENABLE_VIDEO_CONSULTATION } from "@/lib/feature-flags";
import { setNavContext } from "@/lib/nav-context-client";
import {
  FileText, Download, User, Calendar, Pill, Heart, Award, Clock, ArrowRight,
  Sun, Sunrise, Sunset, Moon, Utensils, UtensilsCrossed, Check, X
} from "lucide-react";

const parseFrequency = (freq: string) => {
  const f = freq?.toLowerCase() || "";
  let m = false, a = false, e = false, n = false;

  if (f.includes("-")) {
    const parts = f.split("-").map(p => p.trim());
    if (parts.length === 3) {
      m = parts[0] !== "0";
      a = parts[1] !== "0";
      n = parts[2] !== "0";
    } else if (parts.length === 4) {
      m = parts[0] !== "0";
      a = parts[1] !== "0";
      e = parts[2] !== "0";
      n = parts[3] !== "0";
    }
  } else {
    if (f.includes("morning") || f.includes("bd") || f.includes("tds") || f.includes("twice") || f.includes("thrice")) m = true;
    if (f.includes("afternoon") || f.includes("tds") || f.includes("thrice")) a = true;
    if (f.includes("evening")) e = true;
    if (f.includes("night") || f.includes("bd") || f.includes("twice") || f.includes("tds") || f.includes("thrice")) n = true;
  }
  return { m, a, e, n };
};

const parseTiming = (timing: string) => {
  const t = (timing || "").toLowerCase();
  const bf = t.includes("before") || t.includes("empty");
  const af = t.includes("after") || t.includes("post") || !bf;
  return { bf, af: af && !bf };
};

export default function HomePage() {
  const router = useRouter();
  const { user } = useAuth();
  const displayName = user?.name?.trim() || "there";

  const [greeting, setGreeting] = useState("Good morning");

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour >= 12 && hour < 17) setGreeting("Good afternoon");
    else if (hour >= 17) setGreeting("Good evening");
  }, []);

  // Fetch from backend
  const { data: practitioners } = usePractitioners();
  const { data: appointments, loading: appointmentsLoading } = useAppointments(user?.id);
  const { data: profile } = usePatientProfile(user?.id);
  const { data: upcomingCalls } = usePatientUpcomingCalls(user?.id);

  const [consultations, setConsultations] = useState<any[]>([]);
  const [selectedConsultId, setSelectedConsultId] = useState<string | null>(null);
  const [hiddenDoctorIds, setHiddenDoctorIds] = useState<string[]>([]);

  useEffect(() => {
    const hidden = localStorage.getItem("hidden_doctors");
    if (hidden) {
      try {
        setHiddenDoctorIds(JSON.parse(hidden));
      } catch (e) { }
    }
  }, []);

  useEffect(() => {
    async function loadConsultations() {
      if (user?.id) {
        const data = await fetchDetailedConsultations();
        setConsultations(data || []);
      }
    }
    loadConsultations();
  }, [user?.id]);

  const parseApptDate = (dateStr: string) => {
    if (!dateStr) return Infinity;
    const str = dateStr.replace(/ · |, /, " ");

    // Extract time if present
    const timeMatch = str.match(/\d{1,2}:\d{2}\s*(?:AM|PM)/i);
    const timeStr = timeMatch ? timeMatch[0] : "11:59 PM"; // Default to end of day if no time

    if (str.toLowerCase().startsWith("today")) {
      const d = new Date();
      return new Date(`${d.toDateString()} ${timeStr}`).getTime();
    }
    if (str.toLowerCase().startsWith("tomorrow")) {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      return new Date(`${d.toDateString()} ${timeStr}`).getTime();
    }

    // For standard dates like "16 Jul 2026"
    // Try to inject the time if it isn't parsed implicitly
    const parsedTime = new Date(`${str.replace(timeMatch ? timeMatch[0] : "", "").trim()} ${timeStr}`).getTime();
    return isNaN(parsedTime) ? Infinity : parsedTime;
  };

  // "upcoming" already means still joinable: the backend keeps a slot
  // upcoming until its cutoff (start + slot duration + buffer), and for as
  // long as it's in session — so don't drop it here once the start time passes.
  const upcomingAppointments = (appointments ?? [])
    .filter((a) => a.status === "upcoming")
    .sort((a, b) => {
      const dateA = parseApptDate(a.date);
      const dateB = parseApptDate(b.date);
      return dateA - dateB;
    });

  const hasUpcoming = upcomingAppointments.length > 0;
  const nextUpcoming = hasUpcoming ? upcomingAppointments[0] : null;
  // Join Room / Waiting Room only make sense for a video consultation — an
  // in-clinic visit has no room to join.
  const nextIsVideo = ENABLE_VIDEO_CONSULTATION && nextUpcoming?.mode === "video";

  const nextUpcomingCall = upcomingCalls?.[0];
  let showBanner = false;
  let bannerMessage = "";

  if (nextUpcomingCall) {
    const callDate = nextUpcomingCall.isoDateTime
      ? new Date(nextUpcomingCall.isoDateTime)
      : new Date(`${nextUpcomingCall.rawDate || nextUpcomingCall.date}T10:00:00`);

    const diffDays = Math.ceil((callDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays >= 0 && diffDays <= 3) {
      showBanner = true;
      bannerMessage = `Your upcoming appointment is with ${nextUpcomingCall.practitionerName} on ${nextUpcomingCall.date} at ${nextUpcomingCall.time}`;
    }
  }

  const formatDate = (dateStr: string | undefined | null) => {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  // Get unique consulting doctors (most recent consult per doctor)
  const consultingDoctorsMap = new Map<string, any>();
  consultations.forEach((c) => {
    const doctor = c.practitioners;
    if (doctor && !consultingDoctorsMap.has(doctor.id)) {
      consultingDoctorsMap.set(doctor.id, c);
    }
  });
  const consultingDoctors = Array.from(consultingDoctorsMap.values());

  const visibleDoctors = consultingDoctors.filter(
    (c) => !hiddenDoctorIds.includes(c.practitioners?.id)
  );

  const activeConsult = selectedConsultId
    ? consultations.find((c) => c.id === selectedConsultId)
    : null;

  const handleHideDoctor = (docId: string) => {
    const updated = [...hiddenDoctorIds, docId];
    setHiddenDoctorIds(updated);
    localStorage.setItem("hidden_doctors", JSON.stringify(updated));
    if (activeConsult?.practitioners?.id === docId) {
      const remaining = visibleDoctors.filter((c) => c.practitioners?.id !== docId);
      if (remaining.length > 0) {
        setSelectedConsultId(remaining[0].id);
      } else {
        setSelectedConsultId(null);
      }
    }
  };

  const handleRestoreDoctor = (docId: string) => {
    const updated = hiddenDoctorIds.filter((id) => id !== docId);
    setHiddenDoctorIds(updated);
    localStorage.setItem("hidden_doctors", JSON.stringify(updated));
  };

  const doctor = activeConsult?.practitioners;
  const emr = activeConsult?.emr_notes ? (Array.isArray(activeConsult.emr_notes) ? activeConsult.emr_notes[0] : activeConsult.emr_notes) : null;
  const prescription = activeConsult?.prescriptions?.[0];
  const rxItems = prescription?.prescription_items || [];

  let chiefComplaints: string[] = [];
  try {
    if (emr?.chief_complaint) {
      chiefComplaints = JSON.parse(emr.chief_complaint);
    }
  } catch (e) { }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 max-w-7xl mx-auto">
      {/* Banner */}
      {showBanner && (
        <div className="mb-6 bg-indigo-50 border border-indigo-200 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center">
              <span className="text-lg">🔔</span>
            </div>
            <p className="text-sm font-semibold text-indigo-900">{bannerMessage}</p>
          </div>
        </div>
      )}

      {/* Welcome Header */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/60 pb-6">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-foreground">
            {greeting}, {displayName}
          </h1>
          <p className="text-sm text-muted-foreground mt-1.5">Here&apos;s your wellness overview and AYUSH companion updates.</p>
          {profile?.abhaId && (
            <div className="mt-2.5">
              <ABHABadge abhaId={profile.abhaId} linked />
            </div>
          )}
        </div>
        {nextUpcoming && (
          <Link href={nextIsVideo ? `/consult?id=${nextUpcoming.consultationId || nextUpcoming.id}` : "/appointments"}>
            <div className="flex items-center gap-2 bg-gradient-to-r from-herb-green to-herb-green-light text-white px-5 py-3 rounded-2xl text-sm font-semibold hover:shadow-lg hover:opacity-95 transition-all cursor-pointer shadow-sm active:scale-98">
              <span>{nextIsVideo ? "📹" : "🏥"}</span>
              <span>{nextIsVideo ? "Join Today's Consult" : "View Today's Appointment"}</span>
            </div>
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8">
        {/* Left column */}
        <div className="space-y-8">
          {/* Upcoming consult banner */}
          {appointmentsLoading ? (
            <div className="rounded-[24px] p-6 bg-neutral-100 animate-pulse h-[220px]" />
          ) : nextUpcoming ? (
            <div className="space-y-0">
              {/* Main Hero Card for Nearest Appointment */}
              <div className="bg-gradient-to-br from-herb-green via-herb-green-light to-herb-green/95 rounded-[24px] p-6 text-white relative overflow-hidden shadow-lg shadow-herb-green/20 border border-herb-green/30">
                <div className="relative z-10 flex items-start justify-between gap-4">
                  <div>
                    <span className="text-[10px] font-extrabold text-white/90 bg-white/20 px-3 py-1.5 rounded-full uppercase tracking-widest border border-white/20 shadow-sm flex items-center gap-1.5 w-fit">
                      <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                      Next Consultation
                    </span>
                    <h3 className="font-display text-2xl font-black mt-4 tracking-tight drop-shadow-sm">{nextUpcoming.doctor}</h3>
                    <p className="text-[15px] text-white/90 mt-1 font-medium drop-shadow-sm">{nextUpcoming.specialty}</p>

                    <div className="flex items-center gap-3 mt-4 text-[13px] font-semibold text-white/95">
                      <div className="flex items-center gap-1.5 bg-black/10 px-3 py-1.5 rounded-lg border border-white/10">
                        <Calendar size={14} className="opacity-80" />
                        <span>{nextUpcoming.date.split(/ · |, /)[0]}</span>
                      </div>
                      <div className="flex items-center gap-1.5 bg-black/10 px-3 py-1.5 rounded-lg border border-white/10">
                        <Clock size={14} className="opacity-80" />
                        <span>{nextUpcoming.date.split(/ · |, /)[1] || "10:00 AM"}</span>
                      </div>
                    </div>

                    {nextUpcoming.expiresAtLabel && (
                      <p className="mt-2 text-[11px] text-white/75 font-medium">
                        {nextIsVideo ? "Join" : "Arrive at the clinic"} before {nextUpcoming.expiresAtLabel}, or this slot will be marked missed.
                      </p>
                    )}

                    <div className="mt-6 flex items-center gap-3 flex-wrap">
                      {nextIsVideo ? (
                        <>
                          <button
                            onClick={async () => {
                              await setNavContext("video", { appointmentId: nextUpcoming.id });
                              router.push("/consult");
                            }}
                            className="px-5 py-2.5 bg-white text-herb-green text-xs font-black rounded-xl hover:bg-white/95 transition-all shadow-md active:scale-95 flex items-center gap-2"
                          >
                            Join Room
                            <ArrowRight size={14} />
                          </button>
                          <button
                            onClick={async () => {
                              await setNavContext("video", { appointmentId: nextUpcoming.id });
                              router.push("/waiting-room");
                            }}
                            className="px-5 py-2.5 bg-white/15 text-white text-xs font-bold rounded-xl hover:bg-white/25 border border-white/20 transition-all active:scale-95 shadow-sm"
                          >
                            Waiting Room
                          </button>
                        </>
                      ) : (
                        <Link href="/appointments">
                          <button className="px-5 py-2.5 bg-white text-herb-green text-xs font-black rounded-xl hover:bg-white/95 transition-all shadow-md active:scale-95 flex items-center gap-2">
                            View Details
                            <ArrowRight size={14} />
                          </button>
                        </Link>
                      )}
                      {!nextUpcoming.inSession && !nextUpcoming.arrived && (
                        <Link href="/appointments">
                          <button className="px-5 py-2.5 bg-transparent text-white/90 text-xs font-bold rounded-xl hover:bg-white/10 hover:text-white transition-all active:scale-95">
                            Reschedule
                          </button>
                        </Link>
                      )}
                    </div>
                  </div>

                  <div className="hidden sm:flex w-20 h-20 rounded-2xl bg-white/15 border border-white/30 items-center justify-center flex-shrink-0">
                    <span className="text-white font-black font-display text-2xl tracking-wider drop-shadow-md">{nextUpcoming.initials}</span>
                  </div>
                </div>
              </div>

              {/* Carousel for Remaining Consultations */}
              <UpcomingCarousel appointments={upcomingAppointments.slice(1)} />
            </div>
          ) : (
            <div className="bg-gradient-to-br from-herb-green via-[#228B22] to-herb-green/90 rounded-[2rem] p-7 text-white relative overflow-hidden shadow-lg border border-herb-green/20">
              <div className="absolute -right-4 -top-4 w-28 h-28 rounded-full bg-white/5 blur-xl pointer-events-none" />
              <div className="absolute -right-2 -bottom-6 w-36 h-36 rounded-full bg-white/5 blur-lg pointer-events-none" />

              <div className="relative z-10 max-w-2xl">
                <span className="text-[10px] font-bold text-white/80 bg-white/15 px-2.5 py-1 rounded-full uppercase tracking-wider border border-white/10">
                  Consultation
                </span>
                <h3 className="font-display text-xl font-bold mt-3">Book your first AYUSH consultation</h3>
                <p className="text-sm text-white/85 mt-1.5 leading-relaxed font-medium">
                  Get personalized, holistic treatment and digital prescriptions from verified Ayurveda, Homeopathy, and Yoga experts.
                </p>
                <div className="mt-6">
                  <Link href="/discover">
                    <button className="px-5 py-2.5 bg-white text-herb-green text-xs font-bold rounded-xl hover:bg-white/95 transition-all shadow-md active:scale-98">
                      Find Practitioner
                    </button>
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* Quick actions Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { href: "/discover", icon: "🩺", label: "Book Consult", sub: "6 AYUSH specialties", color: "bg-emerald-500/10 text-emerald-700" },
              { href: "/records", icon: "📁", label: "Health Records", sub: "Timeline & ABHA", color: "bg-sky-500/10 text-sky-700" },
            ].map((item) => (
              <Link key={item.href} href={item.href} className="group block">
                <div className="bg-white rounded-3xl p-5 border border-border/80 hover:border-herb-green/30 hover:shadow-[0_12px_24px_-8px_rgba(27,107,74,0.08)] hover:-translate-y-1 transition-all duration-300 cursor-pointer text-center relative overflow-hidden h-full">
                  <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center text-xl mx-auto mb-3.5 transition-transform duration-300 group-hover:scale-110", item.color)}>
                    {item.icon}
                  </div>
                  <p className="text-xs font-bold text-foreground group-hover:text-herb-green transition-colors">{item.label}</p>
                  <p className="text-[10px] text-muted-foreground mt-1 font-medium">{item.sub}</p>
                </div>
              </Link>
            ))}
          </div>

          {/* Your Consulting Doctors Section */}
          <section className="bg-white rounded-[2rem] border border-border/80 p-6 shadow-sm">
            <h2 className="font-display font-bold text-foreground text-base mb-4 flex items-center gap-2">
              <Heart className="w-5 h-5 text-emerald-500" />
              Your Consulting Doctors
            </h2>
            {visibleDoctors.length === 0 ? (
              <div className="text-center py-8 bg-neutral-50 rounded-2xl border border-dashed border-border flex flex-col items-center justify-center">
                <p className="text-sm text-muted-foreground font-medium">
                  {consultingDoctors.length === 0
                    ? "No consultations found yet."
                    : "All consulting doctors have been hidden."}
                </p>
                {consultingDoctors.length === 0 && (
                  <Link href="/discover" className="mt-3 inline-block">
                    <button className="px-4 py-2 bg-herb-green text-white text-xs font-bold rounded-xl hover:bg-herb-green/95 transition-all shadow-sm active:scale-98">
                      Book First Consult
                    </button>
                  </Link>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {visibleDoctors.map((c) => {
                  const doc = c.practitioners;
                  const isSelected = activeConsult?.id === c.id;
                  return (
                    <div
                      key={doc.id}
                      className={cn(
                        "p-4 rounded-2xl border transition-all duration-300 flex flex-col justify-between gap-3 shadow-sm hover:shadow-md",
                        isSelected
                          ? "bg-herb-green/5 border-herb-green/30 ring-1 ring-herb-green/20"
                          : "bg-white border-border/80 hover:border-herb-green/20"
                      )}
                    >
                      <div className="flex items-start justify-between gap-3 w-full">
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-xl bg-herb-green/10 flex items-center justify-center font-bold text-herb-green text-sm flex-shrink-0">
                            {doc.full_name?.split(" ").filter((w: string) => w).map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-foreground">{doc.full_name}</p>
                            <p className="text-xs text-muted-foreground mt-0.5 font-medium">
                              {doc.specializations?.join(" · ") || "Specialist"}
                            </p>
                            <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1 font-mono">
                              <Clock className="w-3 h-3 text-slate-400" />
                              Last Consult: {formatDate(c.created_at)}
                            </p>
                          </div>
                        </div>

                        {/* Hide doctor button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleHideDoctor(doc.id);
                          }}
                          title="Remove doctor from dashboard"
                          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                      <button
                        onClick={() => setSelectedConsultId(c.id)}
                        className={cn(
                          "w-full py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 active:scale-[0.97] shadow-sm",
                          isSelected
                            ? "bg-herb-green text-white hover:bg-herb-green/90"
                            : "bg-white border border-border text-foreground hover:bg-neutral-50"
                        )}
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>View Recent Prescription</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Restore Section */}
            {hiddenDoctorIds.length > 0 && (
              <div className="border-t border-dashed border-slate-200 mt-5 pt-4">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Hidden Doctors</p>
                <div className="flex flex-wrap gap-2">
                  {hiddenDoctorIds.map((docId) => {
                    const consultObj = consultingDoctors.find(c => c.practitioners?.id === docId);
                    const docName = consultObj?.practitioners?.full_name || "Doctor";
                    return (
                      <button
                        key={docId}
                        onClick={() => handleRestoreDoctor(docId)}
                        className="text-xs bg-slate-50 border border-slate-200 text-slate-600 hover:border-herb-green/30 hover:text-herb-green px-3 py-1.5 rounded-xl transition-all shadow-sm flex items-center gap-1.5 active:scale-95 group"
                      >
                        <span>{docName}</span>
                        <span className="font-bold text-[9px] text-slate-400 group-hover:text-herb-green">+ Add back</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          {/* Prescription Preview Modal */}
          {activeConsult && (
            <div
              className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-6 overflow-y-auto"
              onClick={() => setSelectedConsultId(null)}
            >
              <section
                className="bg-white rounded-[2rem] border border-border/80 p-6 shadow-2xl space-y-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto relative hide-scrollbar"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Close Button */}
                <button
                  onClick={() => setSelectedConsultId(null)}
                  className="absolute top-6 right-6 p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors z-10"
                  aria-label="Close prescription"
                >
                  <X className="w-5 h-5" />
                </button>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4 pr-10">
                  <div>
                    <h3 className="font-display font-semibold text-foreground text-base flex items-center gap-2">
                      <Pill className="w-5 h-5 text-indigo-500" />
                      Prescription Details
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Consultation with Dr. {activeConsult.practitioners?.full_name} on {formatDate(activeConsult.created_at)}
                    </p>
                  </div>
                  <a
                    href={`/api/consultations/${activeConsult.id}/pdf`}
                    target="_blank"
                    className="flex items-center justify-center gap-1.5 px-4 py-2 bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-xl text-xs font-bold hover:bg-indigo-100/80 transition-all hover:shadow-sm active:scale-98 flex-shrink-0"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download PDF</span>
                  </a>
                </div>

                {/* Patient Details & Clinical Summary */}
                <div className="bg-[#F8FAFC] border border-slate-200/60 rounded-2xl p-5 grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                  <div>
                    <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5" /> Patient Details
                    </h4>
                    <div className="space-y-2">
                      <p className="text-slate-600">Name: <span className="font-semibold text-slate-800">{profile?.name || user?.name}</span></p>
                      <p className="text-slate-600">Age: <span className="font-semibold text-slate-800">{profile?.age || "N/A"} y</span></p>
                      <p className="text-slate-600">Gender: <span className="font-semibold text-slate-800 capitalize">{profile?.gender || "N/A"}</span></p>
                      {activeConsult.id && (
                        <p className="text-slate-600 font-mono text-xs">ID: <span className="font-semibold text-slate-800 uppercase">{activeConsult.id.split('-')[0]}</span></p>
                      )}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5" /> Clinical Summary
                    </h4>
                    <div className="space-y-3">
                      <div>
                        <p className="text-xs text-slate-500 font-semibold">Chief Complaint</p>
                        <p className="text-slate-800 font-medium mt-0.5">
                          {chiefComplaints.join(", ") || "No complaints recorded."}
                        </p>
                      </div>
                      {emr?.history_present && (
                        <div>
                          <p className="text-xs text-slate-500 font-semibold">History of Present Illness</p>
                          <p className="text-slate-700 leading-relaxed mt-0.5 text-xs font-medium">
                            {emr.history_present}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Prescribed Formulations */}
                <div>
                  <h4 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                    <Pill className="w-4 h-4 text-emerald-500" />
                    Prescribed Medicines
                  </h4>
                  {rxItems.length > 0 ? (
                    <div className="overflow-x-auto rounded-[20px] border border-slate-200/80 bg-white shadow-sm hide-scrollbar">
                      <table className="w-full text-left border-collapse min-w-[700px]">
                        <thead className="sticky top-0 bg-white/95 backdrop-blur-sm z-10">
                          <tr className="border-b border-slate-200">
                            <th className="p-4 font-bold text-slate-500 text-[13px] bg-white border-r border-slate-200">Medicine</th>
                            <th className="p-3 text-center border-r border-slate-200">
                              <div className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 px-2.5 py-1.5 rounded-lg text-[12px] font-semibold border border-emerald-200">
                                <Sunrise size={14} className="opacity-75" /> Morning
                              </div>
                            </th>
                            <th className="p-3 text-center border-r border-slate-200">
                              <div className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 px-2.5 py-1.5 rounded-lg text-[12px] font-semibold border border-emerald-200">
                                <Sun size={14} className="opacity-75" /> Afternoon
                              </div>
                            </th>
                            <th className="p-3 text-center border-r border-slate-200">
                              <div className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 px-2.5 py-1.5 rounded-lg text-[12px] font-semibold border border-emerald-200">
                                <Sunset size={14} className="opacity-75" /> Evening
                              </div>
                            </th>
                            <th className="p-3 text-center border-r border-slate-200">
                              <div className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 px-2.5 py-1.5 rounded-lg text-[12px] font-semibold border border-emerald-200">
                                <Moon size={14} className="opacity-75" /> Night
                              </div>
                            </th>
                            <th className="p-3 text-center border-r border-slate-200">
                              <div className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 px-2.5 py-1.5 rounded-lg text-[12px] font-semibold border border-emerald-200">
                                <UtensilsCrossed size={14} className="opacity-75" /> Before Food
                              </div>
                            </th>
                            <th className="p-3 text-center">
                              <div className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 px-2.5 py-1.5 rounded-lg text-[12px] font-semibold border border-emerald-200">
                                <Utensils size={14} className="opacity-75" /> After Food
                              </div>
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {rxItems.map((item: any, idx: number) => {
                            const { m, a, e, n } = parseFrequency(item.frequency);
                            const { bf, af } = parseTiming(item.time_of_intake || item.anupana);
                            return (
                              <tr key={idx} className="hover:bg-slate-50/80 transition-colors group">
                                <td className="p-4 align-top max-w-[200px] border-r border-slate-200">
                                  <div className="font-semibold text-[16px] text-slate-800 tracking-tight leading-tight">
                                    {item.medicine_name}
                                  </div>
                                  <div className="text-[13px] text-slate-500 font-medium mt-0.5">
                                    {item.classical_type || "Tablet"} ({item.dose || "—"})
                                  </div>
                                  {(item.special_instructions || item.duration_days) && (
                                    <div className="mt-2.5 text-[12px] text-slate-500 bg-slate-50 p-2.5 rounded-xl border border-slate-200 inline-block w-full">
                                      {item.duration_days && <div className="font-semibold text-slate-600 flex items-center gap-1.5"><Calendar size={13} /> {item.duration_days} Days</div>}
                                      {item.special_instructions && <div className="flex items-start gap-1.5 mt-1.5 text-slate-400 italic"><FileText size={13} className="shrink-0 mt-0.5" /> {item.special_instructions}</div>}
                                    </div>
                                  )}
                                </td>
                                <td className="p-4 text-center align-middle border-r border-slate-200">
                                  {m && <Check size={20} className="text-emerald-500 mx-auto opacity-90 drop-shadow-sm group-hover:scale-110 transition-transform" strokeWidth={3} />}
                                </td>
                                <td className="p-4 text-center align-middle border-r border-slate-200">
                                  {a && <Check size={20} className="text-emerald-500 mx-auto opacity-90 drop-shadow-sm group-hover:scale-110 transition-transform" strokeWidth={3} />}
                                </td>
                                <td className="p-4 text-center align-middle border-r border-slate-200">
                                  {e && <Check size={20} className="text-emerald-500 mx-auto opacity-90 drop-shadow-sm group-hover:scale-110 transition-transform" strokeWidth={3} />}
                                </td>
                                <td className="p-4 text-center align-middle border-r border-slate-200">
                                  {n && <Check size={20} className="text-emerald-500 mx-auto opacity-90 drop-shadow-sm group-hover:scale-110 transition-transform" strokeWidth={3} />}
                                </td>
                                <td className="p-4 text-center align-middle border-r border-slate-200">
                                  {bf && <Check size={20} className="text-emerald-500 mx-auto opacity-90 drop-shadow-sm group-hover:scale-110 transition-transform" strokeWidth={3} />}
                                </td>
                                <td className="p-4 text-center align-middle">
                                  {af && <Check size={20} className="text-emerald-500 mx-auto opacity-90 drop-shadow-sm group-hover:scale-110 transition-transform" strokeWidth={3} />}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="p-5 text-center bg-slate-50 border border-dashed border-slate-200 rounded-[20px]">
                      <p className="text-[13px] text-slate-400 font-medium">No formulations prescribed.</p>
                    </div>
                  )}
                </div>

                {/* Instructions / Careplan */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                  {/* Dietary Advice */}
                  <div className="bg-amber-50/20 border border-amber-100 rounded-2xl p-5">
                    <h4 className="text-xs font-bold text-amber-800 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                      🥗 Dietary & Nutrition Advice
                    </h4>
                    {prescription?.dietary_advice ? (
                      <div
                        className="text-xs text-slate-700 leading-relaxed font-medium prose prose-sm max-w-none [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mb-1 [&_p]:mb-3 last:[&_p]:mb-0"
                        dangerouslySetInnerHTML={{ __html: prescription.dietary_advice }}
                      />
                    ) : (
                      <p className="text-xs text-slate-400 italic">No specific dietary advice recorded.</p>
                    )}
                  </div>

                  {/* Lifestyle Advice */}
                  <div className="bg-emerald-50/20 border border-emerald-100 rounded-2xl p-5">
                    <h4 className="text-xs font-bold text-emerald-800 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                      🧘 Lifestyle & Exercise Advice
                    </h4>
                    {prescription?.lifestyle_advice ? (
                      <p className="text-xs text-slate-700 leading-relaxed font-medium">
                        {prescription.lifestyle_advice.replace(/\[Upcoming Session Fixed: .*?\]/g, '').trim() || "No specific lifestyle advice recorded."}
                      </p>
                    ) : (
                      <p className="text-xs text-slate-400 italic">No specific lifestyle advice recorded.</p>
                    )}
                  </div>
                </div>

                {/* Follow-up Section */}
                {prescription?.followup_date && (
                  <div className="bg-indigo-50/30 border border-indigo-100/50 rounded-2xl p-4 flex items-center gap-3">
                    <Calendar className="w-5 h-5 text-indigo-500" />
                    <div className="text-xs font-medium text-indigo-900">
                      Next Follow-up Consultation Scheduled On: <span className="font-bold text-indigo-700">{formatDate(prescription.followup_date)}</span>
                    </div>
                  </div>
                )}
              </section>
            </div>
          )}

        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Top Practitioners */}
          <section className="bg-white rounded-[2rem] border border-border/80 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display font-bold text-foreground text-sm">Top Practitioners</h2>
              <Link href="/discover" className="text-xs text-herb-green font-semibold hover:underline">
                View all →
              </Link>
            </div>
            <div className="space-y-4">
              {(practitioners ?? []).slice(0, 3).map((doctor) => (
                <PractitionerCard key={doctor.id} doctor={doctor} compact />
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}