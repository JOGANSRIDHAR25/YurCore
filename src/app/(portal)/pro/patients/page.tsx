"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/auth-context";
import { setNavContext } from "@/lib/nav-context-client";
import { MISSED_BY_LABEL_FOR_DOCTOR, type MissedBy } from "@/shared/appointments/attendance";
async function getRegistryPatients(): Promise<Patient[]> {
  const response = await fetch("/api/registry", {
    method: "GET",
    credentials: "include",
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.error || "Unable to load patient registry");
  }
  return result.data as Patient[];
}

async function getPatientFamily(patientId: string): Promise<FamilyMember[]> {
  const response = await fetch(`/api/registry/${patientId}/family`, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.error || "Unable to load family members");
  }
  return result.data as FamilyMember[];
}
import {
  Search, Users, Calendar, Clock,
  Edit3, Stethoscope, RefreshCw, FileText, ChevronRight
} from "lucide-react";

type Problem = { code: string; name: string; status: "active" | "controlled" | "resolved" };

type AppointmentEntry = {
  dateRaw: string;
  date: string;
  day: string;
  time: string;
  status: "today" | "upcoming" | "missed";
  isMissed?: boolean;
  missedBy?: MissedBy | null;
  patientLeft?: boolean;
};

type FamilyMember = {
  id: string;
  patientId: string;
  name: string;
  relationship: string;
  age: number;
  gender: string;
};

type Patient = {
  id: string;
  isFamilyMember?: boolean;
  name: string;
  age: number;
  gender: string;
  phone: string;
  abha: string | null;
  bloodGroup: string;
  prakriti: string;
  lastVisit: string;
  lastVisitDaysAgo: number;
  completedVisitLast30Days: boolean;
  nextFollowUp: string | null;
  followUpDue: boolean;
  isToday: boolean;
  conditions: string;
  systems: string[];
  totalVisits: number;
  problems: Problem[];
  allergySummary: string;
  activeMeds: number;
  vitals: { bpSys: number; bpDia: number; pulse: number; spo2: number; weight: number } | null;
  upcomingAppointments: AppointmentEntry[];
};

const STATUS_STYLE: Record<AppointmentEntry["status"], string> = {
  today: "bg-emerald-50 text-emerald-700 border-emerald-100",
  upcoming: "bg-indigo-50 text-indigo-700 border-indigo-100",
  missed: "bg-amber-50 text-amber-700 border-amber-100",
};

const STATUS_LABEL: Record<AppointmentEntry["status"], string> = {
  today: "Today",
  upcoming: "Upcoming",
  missed: "Missed",
};

export default function PatientsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [apptTab, setApptTab] = useState<AppointmentEntry["status"]>("today");
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [viewedFamilyPatient, setViewedFamilyPatient] = useState<Patient | null>(null);

  async function fetchPatients() {
    setIsLoading(true);
    try {
      const data = await getRegistryPatients();
      setPatients(data);
    } catch (err) {
      console.error("Fetch error:", err);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (user?.id) {
      fetchPatients();
    }
  }, [user?.id]);

  let filtered = patients.filter(p => !p.isFamilyMember);
  if (query.trim()) {
    const q = query.toLowerCase();
    filtered = filtered.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.phone.includes(q) ||
      (p.abha?.toLowerCase().includes(q) ?? false) ||
      p.conditions.toLowerCase().includes(q) ||
      p.problems.some(pr => pr.name.toLowerCase().includes(q))
    );
  }
  useEffect(() => {
    if (filtered.length > 0) {
      const exists = filtered.some(p => p.id === selectedPatientId);
      if (!exists) {
        setSelectedPatientId(filtered[0].id);
      }
    } else {
      setSelectedPatientId(null);
    }
  }, [filtered.map(p => p.id).join(","), query]);

  const activePatient =
    patients.find(p => p.id === selectedPatientId) ||
    (viewedFamilyPatient?.id === selectedPatientId ? viewedFamilyPatient : undefined);

  // Pick a sensible default sub-tab whenever the selected patient changes:
  // prefer Today, then Upcoming, then Past — whichever actually has entries.
  useEffect(() => {
    if (!activePatient) return;
    const appts = activePatient.upcomingAppointments;
    if (appts.some(a => a.status === "today")) setApptTab("today");
    else if (appts.some(a => a.status === "upcoming")) setApptTab("upcoming");
    else setApptTab("missed");
  }, [selectedPatientId]);

  // Load the selected account owner's family members so the doctor can see
  // and switch into their records the same way as any other patient.
  useEffect(() => {
    if (!activePatient) {
      setFamilyMembers([]);
      return;
    }
    let cancelled = false;
    getPatientFamily(activePatient.id)
      .then((data) => {
        if (!cancelled) setFamilyMembers(data);
      })
      .catch((err) => {
        console.error("Fetch family members error:", err);
        if (!cancelled) setFamilyMembers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [activePatient?.id]);

  function handleSelectFamilyMember(fm: FamilyMember) {
    const existing = patients.find((p) => p.id === fm.patientId);
    if (existing) {
      setViewedFamilyPatient(null);
    } else {
      setViewedFamilyPatient({
        id: fm.patientId,
        name: fm.name,
        age: fm.age,
        gender: fm.gender,
        phone: "",
        abha: null,
        bloodGroup: "Not Recorded",
        prakriti: "Unknown",
        lastVisit: "No visits",
        lastVisitDaysAgo: 99,
        completedVisitLast30Days: false,
        nextFollowUp: null,
        followUpDue: false,
        isToday: false,
        conditions: "No recorded conditions",
        systems: ["Ayurveda"],
        totalVisits: 0,
        problems: [],
        allergySummary: "No known allergies",
        activeMeds: 0,
        vitals: null,
        upcomingAppointments: [],
      });
    }
    setSelectedPatientId(fm.patientId);
  }

  const apptsForTab = activePatient
    ? activePatient.upcomingAppointments.filter(a => a.status === apptTab)
    : [];

  return (
    <div className="h-[100dvh] overflow-hidden bg-slate-50/50 flex">
      {/* LEFT SIDEBAR: Patient Search & List */}
      <div className="w-[380px] border-r border-slate-200 bg-white flex flex-col flex-shrink-0">
        <div className="p-6 border-b border-slate-100">
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Patient Registry</h1>
            <p className="text-xs text-slate-500 mt-1">Search &amp; manage patient records</p>
          </div>

          <div className="relative mt-4">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name, phone, ABHA, condition..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all font-medium placeholder:text-slate-400"
            />
          </div>
        </div>

        {/* Patient Cards List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <RefreshCw className="w-6 h-6 text-indigo-500 animate-spin" />
              <p className="text-xs text-slate-500 mt-3 font-medium">Loading patients...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 px-4">
              <Users className="w-8 h-8 text-slate-300 mx-auto mb-3" />
              <h4 className="text-sm font-semibold text-slate-700">No patients found</h4>
              <p className="text-xs text-slate-400 mt-1 max-w-[200px] mx-auto">Try adjusting your search or filters.</p>
            </div>
          ) : (
            filtered.map((p) => {
              const isSelected = selectedPatientId === p.id;
              const apptCount = p.upcomingAppointments.length;
              return (
                <div
                  key={p.id}
                  onClick={() => setSelectedPatientId(p.id)}
                  className={cn(
                    "p-4 rounded-xl cursor-pointer transition-all flex items-start justify-between group",
                    isSelected
                      ? "bg-indigo-50/70 border border-indigo-100/50 shadow-sm"
                      : "hover:bg-slate-50 border border-transparent"
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={cn(
                      "w-11 h-11 rounded-xl flex items-center justify-center font-bold text-sm shadow-sm transition-colors flex-shrink-0",
                      isSelected
                        ? "bg-indigo-600 text-white"
                        : "bg-slate-100 text-slate-700 group-hover:bg-indigo-50 group-hover:text-indigo-600"
                    )}>
                      {p.name[0]?.toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <h4 className={cn("font-semibold text-sm transition-colors truncate", isSelected ? "text-indigo-950" : "text-slate-800")}>{p.name}</h4>
                      <p className="text-xs text-slate-400 font-medium mt-0.5">{p.age} y • {p.gender}</p>
                      <p className="text-[11px] text-slate-500 font-mono mt-1">{p.phone}</p>
                    </div>
                  </div>
                  <span className={cn(
                    "text-[10px] font-bold px-2 py-1 rounded-md border tracking-wide uppercase shadow-sm flex items-center gap-1 flex-shrink-0",
                    apptCount > 0
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-slate-50 text-slate-500 border-slate-200"
                  )}>
                    {apptCount} Appt{apptCount !== 1 ? "s" : ""}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* RIGHT WORKSPACE: Selected Patient's Appointment Queue */}
      <div className="flex-1 overflow-y-auto bg-slate-50/30 p-8">
        {!activePatient ? (
          <div className="h-full flex flex-col items-center justify-center max-w-2xl mx-auto text-center py-20">
            <div className="w-20 h-20 bg-indigo-50 border border-indigo-100/50 rounded-2xl flex items-center justify-center shadow-sm mb-6">
              <Stethoscope className="w-10 h-10 text-indigo-500" />
            </div>
            <h3 className="text-xl font-bold text-slate-900">Select a Patient</h3>
            <p className="text-sm text-slate-500 mt-2 max-w-md">
              Choose a patient card from the directory list on the left to view their booked appointment queue.
            </p>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto w-full">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 border-b border-slate-200 pb-6">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">{activePatient.name}</h2>
                <p className="text-sm text-slate-500 mt-1">{activePatient.age} years old • {activePatient.gender} • {activePatient.phone}</p>
              </div>
              <button
                onClick={async () => {
                  await setNavContext("patient", { patientId: activePatient.id });
                  router.push("/pro/patient");
                }}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4.5 py-2.5 rounded-xl shadow-md shadow-indigo-600/10 transition-all"
              >
                <Edit3 className="w-4 h-4" />
                Update Record
              </button>
            </div>

            {/* Patient summary strip */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm mb-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Last Visit</p>
                <p className="text-sm font-semibold text-slate-800 mt-0.5">{activePatient.lastVisit}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Visits</p>
                <p className="text-sm font-semibold text-slate-800 mt-0.5">{activePatient.totalVisits}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Active Medicines</p>
                <p className="text-sm font-semibold text-slate-800 mt-0.5">{activePatient.activeMeds}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Blood Group</p>
                <p className="text-sm font-semibold text-slate-800 mt-0.5">{activePatient.bloodGroup}</p>
              </div>
            </div>

            {/* Family members of this account owner */}
            {familyMembers.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm mb-6">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-4">
                  <Users className="w-4 h-4 text-indigo-500" />
                  Family Members
                </h3>
                <div className="space-y-2">
                  {familyMembers.map((fm) => (
                    <div
                      key={fm.id}
                      onClick={() => handleSelectFamilyMember(fm)}
                      className="flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-sm flex-shrink-0">
                          {fm.name[0]?.toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-sm text-slate-800 truncate">{fm.name}</p>
                            <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full capitalize">
                              {fm.relationship}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 font-medium mt-0.5">{fm.age} y • {fm.gender}</p>
                        </div>
                      </div>
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          await setNavContext("patient", { patientId: fm.patientId });
                          router.push("/pro/patient");
                        }}
                        className="flex-shrink-0 flex items-center gap-1.5 border border-slate-200 hover:bg-white text-xs font-semibold text-slate-700 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        Update Record
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Appointment queue timeline */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-indigo-500" />
                Booked Appointments
              </h3>
              <button
                onClick={async () => {
                  await setNavContext("prescriptions", { patientId: activePatient.id });
                  router.push("/pro/prescriptions");
                }}
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 transition-colors"
              >
                View past prescriptions
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Today / Upcoming / Past sub-tabs — filters the list below */}
            <div className="flex gap-2 mb-5">
              {([
                { id: "today", label: "Today" },
                { id: "upcoming", label: "Upcoming" },
                { id: "missed", label: "Past" },
              ] as { id: AppointmentEntry["status"]; label: string }[]).map((t) => {
                const count = activePatient.upcomingAppointments.filter(a => a.status === t.id).length;
                const isActive = apptTab === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setApptTab(t.id)}
                    className={cn(
                      "px-3.5 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5",
                      isActive
                        ? "bg-indigo-600 text-white shadow-sm"
                        : "bg-white text-slate-600 hover:bg-slate-50 border border-slate-200"
                    )}
                  >
                    {t.label}
                    <span className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded-md font-bold",
                      isActive ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
                    )}>{count}</span>
                  </button>
                );
              })}
            </div>

            {apptsForTab.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center shadow-sm">
                <FileText className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                <p className="text-sm font-semibold text-slate-700">
                  No {apptTab === "missed" ? "past" : apptTab} appointments
                </p>
                <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                  Once a consultation is completed, it moves out of this queue and into Prescriptions.
                </p>
              </div>
            ) : (
              <div className="space-y-3 relative before:absolute before:left-[17px] before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                {apptsForTab.map((appt, idx) => (
                  <div key={`${appt.dateRaw}-${appt.time}-${idx}`} className="relative pl-10 flex items-start gap-4 group">
                    <div className="absolute left-0.5 top-1.5 w-8 h-8 rounded-full border border-slate-200 bg-white flex items-center justify-center shadow-sm group-hover:border-indigo-400 group-hover:shadow transition-all">
                      <Clock className="w-3.5 h-3.5 text-slate-500 group-hover:text-indigo-600 transition-colors" />
                    </div>
                    <div className="flex-1 bg-white border border-slate-200 hover:border-slate-300 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all flex items-center justify-between gap-6">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="font-semibold text-base text-slate-900">{appt.date}</span>
                          <span className="text-xs text-slate-500 font-medium">{appt.day}</span>
                          <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-md border uppercase tracking-wide", STATUS_STYLE[appt.isMissed ? "missed" : appt.status])}>
                            {STATUS_LABEL[appt.isMissed ? "missed" : appt.status]}
                          </span>
                        </div>
                        <p className="text-sm text-slate-600 font-medium">{appt.time || "Time not set"}</p>
                        {appt.isMissed && appt.missedBy && (
                          <p className="text-xs font-semibold text-amber-700">{appt.patientLeft ? "Patient left before the consultation" : MISSED_BY_LABEL_FOR_DOCTOR[appt.missedBy]}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}