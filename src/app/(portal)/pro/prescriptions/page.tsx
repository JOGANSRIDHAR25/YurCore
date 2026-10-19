
"use client";

import Link from "next/link";
import { useState, useRef, Suspense, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/auth-context";
import { usePractitionerPrescriptions } from "@/hooks/use-prescriptions";
import { getNavContext, setNavContext } from "@/lib/nav-context-client";
import { InvoiceDialog } from "@/components/consultation-report/InvoiceDialog";
import {
  FileText, Download, Calendar, User, Search, RefreshCw,
  CheckCircle2, Clock, ArrowLeft, Pill, Stethoscope, Activity,
  Droplets, Phone, MapPin, FileUp, ChevronRight, X, Check, ChevronDown, Users
} from "lucide-react";

type FamilyMember = {
  id: string;
  patientId: string;
  name: string;
  relationship: string;
  age: number;
  gender: string;
};

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

async function getDependentPatientIds(): Promise<Set<string>> {
  const response = await fetch("/api/registry", {
    method: "GET",
    credentials: "include",
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok || !result.success) return new Set();
  return new Set(
    (result.data as any[]).filter((p) => p.isFamilyMember).map((p) => p.id),
  );
}

function PrescriptionsContent() {
  const { user } = useAuth();
  const router = useRouter();

  const { data: prescriptions = [], loading } = usePractitionerPrescriptions(user?.id);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [selectedRxId, setSelectedRxId] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const [dateFilterType, setDateFilterType] = useState<"all" | "today" | "yesterday" | "week" | "month" | "custom">("all");
  const [customDate, setCustomDate] = useState<string | null>(null);
  const [openDateDropdown, setOpenDateDropdown] = useState(false);

  const [dependentPatientIds, setDependentPatientIds] = useState<Set<string>>(new Set());
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [viewedFamilyMember, setViewedFamilyMember] = useState<FamilyMember | null>(null);

  useEffect(() => {
    getDependentPatientIds().then(setDependentPatientIds).catch(() => setDependentPatientIds(new Set()));
  }, [user?.id]);

  useEffect(() => {
    getNavContext<{ patientId: string }>("prescriptions").then((result) => {
      if (result?.patientId) setSelectedPatientId(result.patientId);
    });
  }, []);

  const isWithinDateFilter = useCallback((recordDateStr: string) => {
    if (dateFilterType === "all") return true;
    if (!recordDateStr) return false;

    const recordDate = new Date(recordDateStr);
    if (isNaN(recordDate.getTime())) return true;

    const now = new Date();
    const recordStart = new Date(recordDate.getFullYear(), recordDate.getMonth(), recordDate.getDate()).getTime();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    switch (dateFilterType) {
      case "today":
        return recordStart === todayStart;
      case "yesterday": {
        const yesterdayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        yesterdayStart.setDate(yesterdayStart.getDate() - 1);
        return recordStart === yesterdayStart.getTime();
      }
      case "week": {
        const sevenDaysAgoStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        sevenDaysAgoStart.setDate(sevenDaysAgoStart.getDate() - 7);
        return recordStart >= sevenDaysAgoStart.getTime();
      }
      case "month": {
        const thirtyDaysAgoStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        thirtyDaysAgoStart.setDate(thirtyDaysAgoStart.getDate() - 30);
        return recordStart >= thirtyDaysAgoStart.getTime();
      }
      case "custom": {
        if (!customDate) return true;
        const [year, month, day] = customDate.split("-").map(Number);
        const customStart = new Date(year, month - 1, day).getTime();
        return recordStart === customStart;
      }
      default:
        return true;
    }
  }, [dateFilterType, customDate]);

  const rxs = (prescriptions || []) as any[];

  // Filter prescriptions by date
  const filteredRxs = rxs.filter((rx) => isWithinDateFilter(rx.date));

  // Group prescriptions by Patient ID
  const patientGroups: Record<string, any[]> = {};
  filteredRxs.forEach((rx) => {
    const key = rx.patientId || rx.doctorName || "unknown";
    if (!patientGroups[key]) {
      patientGroups[key] = [];
    }
    patientGroups[key].push(rx);
  });

  // Extract unique patient list
  const uniquePatients = Object.entries(patientGroups).map(([id, list]) => {
    const latest = list[0];
    return {
      id,
      name: latest.patientName || latest.doctorName || "Unknown Patient",
      initials: latest.doctorInitials || "P",
      gender: latest.gender || "Unknown",
      age: latest.age || "N/A",
      phone: latest.phone || "—",
      consultationsCount: list.length,
      list
    };
  });

  // Family members' patient ids, from the prescription rows themselves
  // (ownerPatient) as well as the registry lookup.
  const familyPatientIds = new Set<string>(dependentPatientIds);
  rxs.forEach((rx) => {
    if (rx.ownerPatient && rx.patientId) familyPatientIds.add(rx.patientId);
  });

  const familyPatientIdsKey = Array.from(familyPatientIds).sort().join(",");

  // Account owners only — dependents (family members) are shown within
  // their owner's "Family Members" card instead of the top-level directory.
  // When only a family member has been consulted so far, their owner has no
  // prescriptions of their own, so add the owner from the dependent's row —
  // otherwise the family member's record would have no way to be reached.
  const ownerPatients = uniquePatients.filter(p => !familyPatientIds.has(p.id));
  filteredRxs.forEach((rx) => {
    const owner = rx.ownerPatient;
    if (!owner || ownerPatients.some(p => p.id === owner.id)) return;
    const dependentsCount = filteredRxs.filter((r) => r.ownerPatient?.id === owner.id).length;
    ownerPatients.push({
      id: owner.id,
      name: owner.name,
      initials: owner.name.split(" ").filter(Boolean).map((w: string) => w[0]).join("").slice(0, 2).toUpperCase() || "P",
      gender: owner.gender,
      age: owner.age,
      phone: owner.phone || "—",
      consultationsCount: 0,
      familyRecordsCount: dependentsCount,
      list: [] as any[],
    } as any);
  });

  // Filter patient list based on search
  const filteredPatients = ownerPatients.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.phone.includes(searchQuery)
  );

  // Get active selected patient details — falls back to a placeholder for a
  // family member who has no prescriptions of their own yet (so they never
  // appear in `uniquePatients`, which is built purely from prescription rows).
  const activePatient =
    uniquePatients.find(p => p.id === selectedPatientId) ||
    ownerPatients.find(p => p.id === selectedPatientId) ||
    (viewedFamilyMember?.patientId === selectedPatientId
      ? {
          id: viewedFamilyMember.patientId,
          name: viewedFamilyMember.name,
          initials: viewedFamilyMember.name[0]?.toUpperCase() || "P",
          gender: viewedFamilyMember.gender,
          age: viewedFamilyMember.age,
          phone: "—",
          consultationsCount: 0,
          list: [] as any[],
        }
      : undefined);
  const activeRx = rxs.find(r => r.id === selectedRxId);

  useEffect(() => {
    if (ownerPatients.length > 0) {
      const exists =
        uniquePatients.some(p => p.id === selectedPatientId) ||
        ownerPatients.some(p => p.id === selectedPatientId) ||
        viewedFamilyMember?.patientId === selectedPatientId;
      if (!exists) {
        setSelectedPatientId(ownerPatients[0].id);
      }
    } else {
      setSelectedPatientId(null);
    }
  }, [ownerPatients, uniquePatients, selectedPatientId, viewedFamilyMember]);

  // Load the selected account owner's family members.
  useEffect(() => {
    if (!activePatient || familyPatientIds.has(activePatient.id)) {
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
  }, [activePatient?.id, familyPatientIdsKey]);

  function handleSelectFamilyMember(fm: FamilyMember) {
    const existing = uniquePatients.find(p => p.id === fm.patientId);
    setViewedFamilyMember(existing ? null : fm);
    setSelectedPatientId(fm.patientId);
    setSelectedRxId(null);
    setIsExpanded(false);
  }

  return (
    <div className="h-[100dvh] overflow-hidden bg-slate-50/50 flex">
      {/* LEFT SIDEBAR: Patient Search & List */}
      <div className="w-[380px] border-r border-slate-200 bg-white flex flex-col flex-shrink-0">
        <div className="p-6 border-b border-slate-100">
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Patient Directory</h1>
          <p className="text-xs text-slate-500 mt-1">Select a patient to view consultation histories</p>

          <div className="flex items-center gap-2 mt-4">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search patients..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all font-medium placeholder:text-slate-400"
              />
            </div>

            {/* Date Filter Dropdown */}
            <div className="relative flex-shrink-0">
              <button
                type="button"
                onClick={() => setOpenDateDropdown(!openDateDropdown)}
                className={cn(
                  "h-[42px] px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm select-none",
                  dateFilterType !== "all"
                    ? "bg-indigo-50 border-indigo-200 text-indigo-700 ring-1 ring-indigo-200/30"
                    : "bg-white hover:bg-slate-50 border-slate-200 text-slate-600"
                )}
                title={dateFilterType !== "all" ? "Date Filter Active" : "Filter by Date"}
              >
                <Calendar className={cn("h-4 w-4", dateFilterType !== "all" ? "text-indigo-600" : "text-slate-400")} />
                {dateFilterType !== "all" && (
                  <span className="max-w-[65px] truncate text-[11px]">
                    {dateFilterType === "today" && "Today"}
                    {dateFilterType === "yesterday" && "Yest."}
                    {dateFilterType === "week" && "7d"}
                    {dateFilterType === "month" && "30d"}
                    {dateFilterType === "custom" && customDate && new Date(customDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                  </span>
                )}
                {dateFilterType !== "all" ? (
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      setDateFilterType("all");
                      setCustomDate(null);
                      setOpenDateDropdown(false);
                    }}
                    className="hover:bg-indigo-100 rounded-full p-0.5 transition-colors"
                  >
                    <X className="h-3 w-3 text-indigo-600" />
                  </span>
                ) : (
                  <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                )}
              </button>

              {openDateDropdown && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setOpenDateDropdown(false)} />
                  <div className="absolute right-0 top-[calc(100%+8px)] z-35 bg-white border border-slate-200/80 rounded-2xl shadow-xl min-w-[200px] p-1.5 animate-in fade-in slide-in-from-top-1 duration-150">
                    {[
                      { type: "all", label: "All Time" },
                      { type: "today", label: "Today" },
                      { type: "yesterday", label: "Yesterday" },
                      { type: "week", label: "Last 7 Days" },
                      { type: "month", label: "Last 30 Days" }
                    ].map((item) => (
                      <button
                        type="button"
                        key={item.type}
                        onClick={() => {
                          setDateFilterType(item.type as any);
                          setCustomDate(null);
                          setOpenDateDropdown(false);
                        }}
                        className="w-full text-left px-3.5 py-2 text-xs font-semibold hover:bg-slate-50 rounded-xl transition-colors flex items-center justify-between text-slate-700"
                      >
                        <span className={dateFilterType === item.type ? "text-indigo-600 font-bold" : ""}>{item.label}</span>
                        {dateFilterType === item.type && <Check className="h-3.5 w-3.5 text-indigo-600" />}
                      </button>
                    ))}

                    <div className="border-t border-slate-100 my-1.5" />

                    <div className="px-3 py-1.5">
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Custom Date</label>
                      <input
                        type="date"
                        value={customDate || ""}
                        onChange={(e) => {
                          if (e.target.value) {
                            setCustomDate(e.target.value);
                            setDateFilterType("custom");
                            setOpenDateDropdown(false);
                          }
                        }}
                        className="w-full bg-slate-50 hover:bg-slate-100/50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-indigo-500 font-semibold cursor-pointer transition-all"
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Patient Cards List */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 p-2 space-y-1">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <RefreshCw className="w-6 h-6 text-indigo-500 animate-spin" />
              <p className="text-xs text-slate-500 mt-3 font-medium">Loading patients...</p>
            </div>
          ) : filteredPatients.length === 0 ? (
            <div className="text-center py-12 px-4">
              <User className="w-8 h-8 text-slate-300 mx-auto mb-3" />
              <h4 className="text-sm font-semibold text-slate-700">No patients found</h4>
              <p className="text-xs text-slate-400 mt-1 max-w-[200px] mx-auto">Try refining your search terms or verify patient list.</p>
            </div>
          ) : (
            filteredPatients.map((p) => {
              const isSelected = selectedPatientId === p.id;
              return (
                <div
                  key={p.id}
                  onClick={() => {
                    setSelectedPatientId(p.id);
                    setSelectedRxId(null); // Clear selected consultation details on patient change
                    setIsExpanded(false); // Reset expanded state
                    setViewedFamilyMember(null);
                  }}
                  className={cn(
                    "p-4 rounded-xl cursor-pointer transition-all flex items-start justify-between group",
                    isSelected
                      ? "bg-indigo-50/70 border border-indigo-100/50 shadow-sm"
                      : "hover:bg-slate-50 border border-transparent"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-11 h-11 rounded-xl flex items-center justify-center font-bold text-sm shadow-sm transition-colors",
                      isSelected
                        ? "bg-indigo-600 text-white"
                        : "bg-slate-100 text-slate-700 group-hover:bg-indigo-50 group-hover:text-indigo-600"
                    )}>
                      {p.initials}
                    </div>
                    <div>
                      <h4 className={cn("font-semibold text-sm transition-colors", isSelected ? "text-indigo-950" : "text-slate-800")}>{p.name}</h4>
                      <p className="text-xs text-slate-400 font-medium mt-0.5">{p.age} y • {p.gender}</p>
                      <p className="text-[11px] text-slate-500 font-mono mt-1">{p.phone}</p>
                    </div>
                  </div>
                  <span className={cn(
                    "text-[10px] font-bold px-2 py-1 rounded-md border tracking-wide uppercase shadow-sm flex items-center gap-1",
                    isSelected
                      ? "bg-indigo-100 text-indigo-800 border-indigo-200"
                      : "bg-slate-50 text-slate-500 border-slate-200"
                  )}>
                    {(p as any).familyRecordsCount
                      ? `${(p as any).familyRecordsCount} Family ${(p as any).familyRecordsCount === 1 ? "Record" : "Records"}`
                      : `${p.consultationsCount} Records`}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* RIGHT WORKSPACE: History List or Detailed Report View */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto bg-slate-50/30 p-8 flex flex-col">
        {!selectedPatientId ? (
          /* Empty Workspace State */
          <div className="flex-1 flex flex-col items-center justify-center max-w-2xl mx-auto text-center py-20">
            <div className="w-20 h-20 bg-indigo-50 border border-indigo-100/50 rounded-2xl flex items-center justify-center shadow-sm mb-6">
              <Stethoscope className="w-10 h-10 text-indigo-500" />
            </div>
            <h3 className="text-xl font-bold text-slate-900">Select a Patient</h3>
            <p className="text-sm text-slate-500 mt-2 max-w-md">
              Choose a patient card from the directory list on the left to view their consultation notes, vitals, prescriptions and files.
            </p>
          </div>
        ) : !selectedRxId ? (
          /* Timeline Consultation History List for Selected Patient */
          <div className="max-w-4xl mx-auto w-full">
            <div className="flex items-center justify-between mb-8 border-b border-slate-200 pb-6">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">{activePatient?.name}&apos;s Medical History</h2>
                <p className="text-sm text-slate-500 mt-1">{activePatient?.age} years old • {activePatient?.gender} • {activePatient?.phone}</p>
              </div>
              <button
                onClick={async () => {
                  if (!activePatient?.id) return;
                  await setNavContext("patient", { patientId: activePatient.id });
                  router.push("/pro/patient");
                }}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4.5 py-2.5 rounded-xl shadow-md shadow-indigo-600/10 transition-all"
              >
                Create New Record
              </button>
            </div>

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
                      className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors"
                    >
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
                  ))}
                </div>
              </div>
            )}

            {activePatient?.list.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center shadow-sm">
                <FileText className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                <p className="text-sm font-semibold text-slate-700">No prescriptions yet</p>
                <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                  {activePatient.name} has no recorded consultations with you.
                </p>
              </div>
            ) : (
            <div className="space-y-6 relative before:absolute before:left-[17px] before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
              {[...(activePatient?.list || [])]
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                .slice(0, isExpanded ? undefined : 5)
                .map((rx, idx) => (
                  <div
                    key={rx.id}
                    className={cn(
                      "relative pl-10 flex items-start gap-4 group",
                      !isExpanded || idx < 5 ? "" : "animate-in fade-in slide-in-from-top-4 duration-300"
                    )}
                  >
                    {/* Timeline Dot Icon */}
                    <div className="absolute left-0.5 top-1.5 w-8 h-8 rounded-full border border-slate-200 bg-white flex items-center justify-center shadow-sm group-hover:border-indigo-400 group-hover:shadow transition-all">
                      <Calendar className="w-3.5 h-3.5 text-slate-500 group-hover:text-indigo-600 transition-colors" />
                    </div>

                    {/* Record Card */}
                    <div
                      onClick={() => setSelectedRxId(rx.id)}
                      className="flex-1 bg-white border border-slate-200 hover:border-slate-300 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all cursor-pointer flex items-center justify-between gap-6"
                    >
                      <div className="space-y-2.5">
                        <div className="flex items-center gap-3">
                          <span className="font-semibold text-base text-slate-900">{rx.date}</span>
                          <span className="text-xs font-semibold px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-md border border-emerald-100 uppercase tracking-wide">
                            Completed
                          </span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-y-1.5 gap-x-6 text-sm text-slate-600 font-medium">
                          <div className="flex items-center gap-1.5">
                            <FileText className="w-4 h-4 text-slate-400" />
                            <span>Diagnosis: <span className="text-slate-800">{rx._raw?.diagnosis || rx.chiefComplaint || "Routine Check-up"}</span></span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Pill className="w-4 h-4 text-slate-400" />
                            <span>{rx.items?.length || 0} Prescribed Formulations</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <button className="flex items-center gap-1 py-2.5 px-4 bg-slate-50 hover:bg-slate-100 border border-slate-200 hover:border-slate-300 text-slate-700 text-sm font-semibold rounded-xl transition-all shadow-sm">
                          <span>Open Report</span>
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

              {/* View More / View Less Navigation */}
              {activePatient?.list && activePatient.list.length > 5 && (
                <div className="pt-4 pl-10 flex justify-start">
                  <button
                    onClick={() => {
                      if (isExpanded) {
                        setIsExpanded(false);
                        if (scrollContainerRef.current) {
                          scrollContainerRef.current.scrollTo({ top: 0, behavior: "smooth" });
                        }
                      } else {
                        setIsExpanded(true);
                      }
                    }}
                    className="text-sm font-medium text-indigo-600 hover:text-indigo-800 hover:underline transition-colors focus:outline-none"
                  >
                    {isExpanded ? "View Less" : "View More"}
                  </button>
                </div>
              )}
            </div>
            )}
          </div>
        ) : (
          /* Detailed Report View of Selected Consultation */
          <div className="max-w-4xl mx-auto w-full">
            {/* Header / Actions */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8 border-b border-slate-200 pb-6">
              <div>
                <button
                  onClick={() => setSelectedRxId(null)}
                  className="inline-flex items-center text-sm font-semibold text-slate-500 hover:text-indigo-600 transition-colors mb-3"
                >
                  <ArrowLeft className="w-4 h-4 mr-1.5" />
                  Back to Consultation History
                </button>
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
                  Consultation Record
                  <span className="px-2.5 py-0.5 text-xs font-semibold bg-emerald-50 text-emerald-700 rounded-md border border-emerald-100 uppercase tracking-wider">Completed</span>
                </h1>
                <p className="text-xs text-slate-500 mt-1">
                  ID: {activeRx?.consultationId?.split('-')[0].toUpperCase()} • Consulted on {activeRx?.date}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <InvoiceDialog
                  consultationId={activeRx?.consultationId}
                  patientName={activePatient?.name || "N/A"}
                  doctorName={user?.name || "N/A"}
                  invoiceDate={activeRx?.date}
                />
                <Link href={`/api/consultations/${activeRx?.consultationId}/pdf`} target="_blank">
                  <button className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl shadow-md shadow-indigo-600/10 transition-all">
                    <Download className="w-4 h-4" />
                    Download PDF Report
                  </button>
                </Link>
              </div>
            </div>

            <div className="space-y-6">
              {/* Patient details metadata summary */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                <h2 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <User className="w-4.5 h-4.5 text-indigo-500" />
                  Patient Profile Summary
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-sm">
                  <div>
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Full Name</p>
                    <p className="font-semibold text-slate-800 mt-0.5">{activePatient?.name}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Age & Gender</p>
                    <p className="font-semibold text-slate-800 mt-0.5">{activePatient?.age} y / {activePatient?.gender}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Phone</p>
                    <p className="font-semibold text-slate-800 mt-0.5">{activePatient?.phone}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Address</p>
                    <p className="font-semibold text-slate-800 mt-0.5 truncate" title={activeRx?._raw?.address || activePatient?.phone}>{activeRx?._raw?.address || "Bangalore, India"}</p>
                  </div>
                </div>
              </div>

              {/* SOAP Consultation Details */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                <h2 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <Stethoscope className="w-4.5 h-4.5 text-indigo-500" />
                  Consultation SOAP Notes
                </h2>
                <div className="space-y-4">
                  {activeRx?._raw?.visitReason && (
                    <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Visit Reason</p>
                      <p className="text-slate-800 text-sm">{activeRx._raw.visitReason}</p>
                    </div>
                  )}

                  {activeRx?._raw?.chiefComplaints && activeRx._raw.chiefComplaints.length > 0 && (
                    <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Chief Complaints</p>
                      <div className="flex flex-wrap gap-2">
                        {activeRx._raw.chiefComplaints.map((c: string, i: number) => (
                          <span key={i} className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 shadow-sm">{c}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {activeRx?._raw?.presentIllness && (
                    <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">History of Present Illness (Subjective)</p>
                      <p className="text-slate-800 text-sm whitespace-pre-line leading-relaxed">{activeRx._raw.presentIllness}</p>
                    </div>
                  )}

                  {activeRx?._raw?.previousHistory && (
                    <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Past Medical History</p>
                      <p className="text-slate-800 text-sm">{activeRx._raw.previousHistory}</p>
                    </div>
                  )}

                  {activeRx?._raw?.previousCalls && (
                    <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Previous Consultation Summary</p>
                      <p className="text-slate-800 text-sm">{activeRx._raw.previousCalls}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Vitals Summary Card */}
              {activeRx?._raw?.vitals && (
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                  <h2 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
                    <Activity className="w-4.5 h-4.5 text-indigo-500" />
                    Recorded Vitals & Measurements
                  </h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                    <div className="p-4 bg-blue-50/50 border border-blue-100/50 rounded-xl flex flex-col items-center justify-center text-center">
                      <span className="text-[10px] font-bold text-blue-600/70 uppercase tracking-wider">Blood Pressure</span>
                      <span className="text-base font-bold text-blue-900 mt-1">
                        {activeRx._raw?.vitals?.bpSys || activeRx._raw?.vitals?.bpDia ? (
                          <>
                            {activeRx._raw.vitals.bpSys || "—"}/{activeRx._raw.vitals.bpDia || "—"}
                            <span className="text-xs font-medium text-blue-600/70 ml-0.5">mmHg</span>
                          </>
                        ) : "—"}
                      </span>
                    </div>

                    <div className="p-4 bg-rose-50/50 border border-rose-100/50 rounded-xl flex flex-col items-center justify-center text-center">
                      <span className="text-[10px] font-bold text-rose-600/70 uppercase tracking-wider">Pulse</span>
                      <span className="text-base font-bold text-rose-900 mt-1">
                        {activeRx._raw.vitals.pulse || "—"}
                        {activeRx._raw.vitals.pulse && <span className="text-xs font-medium text-rose-600/70 ml-0.5">bpm</span>}
                      </span>
                    </div>

                    <div className="p-4 bg-amber-50/50 border border-amber-100/50 rounded-xl flex flex-col items-center justify-center text-center">
                      <span className="text-[10px] font-bold text-amber-600/70 uppercase tracking-wider">Temperature</span>
                      <span className="text-base font-bold text-amber-900 mt-1">
                        {activeRx._raw.vitals.temp || "—"}
                        {activeRx._raw.vitals.temp && <span className="text-xs font-medium text-amber-600/70 ml-0.5">°F</span>}
                      </span>
                    </div>

                    <div className="p-4 bg-indigo-50/50 border border-indigo-100/50 rounded-xl flex flex-col items-center justify-center text-center">
                      <span className="text-[10px] font-bold text-indigo-600/70 uppercase tracking-wider">SpO₂</span>
                      <span className="text-base font-bold text-indigo-900 mt-1">
                        {activeRx._raw.vitals.spo2 || "—"}
                        {activeRx._raw.vitals.spo2 && <span className="text-xs font-medium text-indigo-600/70 ml-0.5">%</span>}
                      </span>
                    </div>

                    <div className="p-4 bg-emerald-50/50 border border-emerald-100/50 rounded-xl flex flex-col items-center justify-center text-center">
                      <span className="text-[10px] font-bold text-emerald-600/70 uppercase tracking-wider">Weight</span>
                      <span className="text-base font-bold text-emerald-900 mt-1">
                        {activeRx._raw.vitals.weight || "—"}
                        {activeRx._raw.vitals.weight && <span className="text-xs font-medium text-emerald-600/70 ml-0.5">kg</span>}
                      </span>
                    </div>

                    <div className="p-4 bg-purple-50/50 border border-purple-100/50 rounded-xl flex flex-col items-center justify-center text-center">
                      <span className="text-[10px] font-bold text-purple-600/70 uppercase tracking-wider">BMI</span>
                      <span className="text-base font-bold text-purple-900 mt-1">
                        {activeRx._raw.vitals.bmi || "—"}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Prescriptions Formulations Card */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                <h2 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <Pill className="w-4.5 h-4.5 text-indigo-500" />
                  Prescribed Formulations
                </h2>
                {activeRx?.items && activeRx.items.length > 0 ? (
                  <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                    <table className="w-full text-left border-collapse text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                          <th className="p-4">Medicine Name</th>
                          <th className="p-4">Form & Dose</th>
                          <th className="p-4">Timing & Intake</th>
                          <th className="p-4">Duration</th>
                          <th className="p-4">Special Instructions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-150">
                        {activeRx.items.map((item: any, idx: number) => (
                          <tr key={idx} className="hover:bg-slate-50/30 transition-colors">
                            <td className="p-4 font-semibold text-slate-900">{item.name}</td>
                            <td className="p-4 text-slate-700">{item.form} ({item.dose || "—"})</td>
                            <td className="p-4 text-slate-700">
                              <div className="font-semibold text-slate-900">{item.frequency || "—"}</div>
                              {item.timing && <div className="text-xs text-slate-400 mt-0.5">Timing: {item.timing}</div>}
                              {item.anupana && <div className="text-xs text-slate-400 mt-0.5">Vehicle: {item.anupana}</div>}
                            </td>
                            <td className="p-4 text-slate-700">{item.durationDays ? `${item.durationDays} Days` : "—"}</td>
                            <td className="p-4 text-slate-500 italic">{item.instructions || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-slate-400 italic">No medicines prescribed.</p>
                )}
              </div>

              {/* Additional instructions notes */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                <h2 className="text-base font-bold text-slate-900 mb-3 flex items-center gap-2">
                  <FileText className="w-4.5 h-4.5 text-indigo-500" />
                  Dietary & Lifestyle Advice
                </h2>
                {activeRx?.dietaryAdvice ? (
                  <div
                    className="prose prose-sm max-w-none text-slate-700 bg-amber-50/20 p-5 rounded-xl border border-amber-100/50
                      [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mb-1 [&_p]:mb-3 last:[&_p]:mb-0 text-sm leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: activeRx.dietaryAdvice }}
                  />
                ) : (
                  <p className="text-sm text-slate-400 italic">No dietary or lifestyle advice recorded.</p>
                )}
              </div>

              {/* Uploaded Attachments */}
              {activeRx?._raw?.attachments && activeRx._raw.attachments.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                  <h2 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
                    <FileUp className="w-4.5 h-4.5 text-indigo-500" />
                    Uploaded Consultation Reports
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {activeRx._raw.attachments.map((file: any) => (
                      <div key={file.id} className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-250/50 rounded-xl hover:border-slate-300 transition-colors">
                        <div className="flex items-center gap-2.5 truncate">
                          <FileText className="w-4.5 h-4.5 text-indigo-500 flex-shrink-0" />
                          <span className="text-xs text-slate-700 font-semibold truncate" title={file.file_name}>{file.file_name}</span>
                        </div>
                        <a
                          href={file.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-bold text-indigo-600 hover:text-indigo-800 ml-3 flex-shrink-0 transition-colors"
                        >
                          View File
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Followup Dates */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                <h2 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <Clock className="w-4.5 h-4.5 text-indigo-500" />
                  Follow-up & Care Plan
                </h2>
                <div className="p-5 bg-slate-50 border border-slate-250/50 rounded-xl mb-4">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Follow-up Instructions</p>
                  <p className="text-sm text-slate-700 font-medium leading-relaxed whitespace-pre-line">
                    {activeRx?.lifestyleAdvice?.replace(/\[Upcoming Session Fixed: .*?\]/g, '').trim() || "No specific follow-up instructions provided."}
                  </p>
                </div>

                {activeRx?.lifestyleAdvice?.match(/\[Upcoming Session Fixed: (.*?)\]/) && (
                  <div className="bg-[#f0fdf4] border border-[#bbf7d0] rounded-xl p-4 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider mb-1">Upcoming Session Booked</p>
                      <p className="text-sm font-bold text-emerald-800">
                        {(() => {
                          const match = activeRx.lifestyleAdvice.match(/\[Upcoming Session Fixed: (.*?) at (.*?)\]/);
                          if (match) {
                            const date = match[1];
                            const time = match[2];
                            let displayTime = time;
                            try {
                              if (!time.includes("AM") && !time.includes("PM")) {
                                const [h, m] = time.split(":");
                                const hours = parseInt(h, 10);
                                const period = hours >= 12 ? "PM" : "AM";
                                const h12 = hours % 12 || 12;
                                displayTime = `${h12}:${m} ${period}`;
                              }
                            } catch (e) { }

                            let displayDate = date;
                            try {
                              displayDate = new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
                            } catch (e) { }

                            return `${displayDate} at ${displayTime}`;
                          }
                          return null;
                        })()}
                      </p>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-emerald-100/50 flex items-center justify-center">
                      <Clock className="w-4 h-4 text-emerald-500" />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PrescriptionsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-slate-50/50"><RefreshCw className="w-8 h-8 text-indigo-500 animate-spin" /></div>}>
      <PrescriptionsContent />
    </Suspense>
  );
}