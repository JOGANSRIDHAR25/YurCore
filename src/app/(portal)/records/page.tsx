"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useHealthRecords } from "@/hooks/use-emr";
import { getNavContext } from "@/lib/nav-context-client";
import { usePatientProfile } from "@/hooks/use-profile";
import { fetchDetailedConsultations } from "@/hooks/use-consultations";
import { useFamilyMembers } from "@/hooks/use-family";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/auth-context";
import type { HealthRecord } from "@/lib/types";
import { Search, ArrowRight, User, Users, Activity, FileText, Pill, Stethoscope, FileUp, Clock, ArrowLeft, Download, Calendar, X, Check, ChevronDown } from "lucide-react";
import Link from "next/link";
import { InvoiceDialog } from "@/components/consultation-report/InvoiceDialog";

type FilterTab = "All" | "Pariksha" | "Aushadhi" | "Lab" | "Trackers";

const TABS: FilterTab[] = ["All", "Pariksha", "Aushadhi", "Lab", "Trackers"];

const filterMap: Record<FilterTab, HealthRecord["type"] | null> = {
  All: null,
  Pariksha: "consultation",
  Aushadhi: "prescription",
  Lab: "lab",
  Trackers: "tracker",
};

// Avatar generator helper for patient initials
const getPatientInitials = (name: string) => {
  if (!name || name === "Medical Practitioner" || name.trim() === "") return "PT";
  const parts = name.trim().split(" ");
  if (parts.length > 1) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
};

export default function RecordsPage() {
  return (
    <Suspense fallback={null}>
      <RecordsPageContent />
    </Suspense>
  );
}

function RecordsPageContent() {
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<FilterTab>("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDoctorName, setSelectedDoctorName] = useState<string | null>(null);
  const [selectedConsultationId, setSelectedConsultationId] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const [dateFilterType, setDateFilterType] = useState<"all" | "today" | "yesterday" | "week" | "month" | "custom">("all");
  const [customDate, setCustomDate] = useState<string | null>(null);
  const [openDateDropdown, setOpenDateDropdown] = useState(false);

  const [selectedFamilyMemberId, setSelectedFamilyMemberId] = useState<string | null>(null);
  const [openMemberDropdown, setOpenMemberDropdown] = useState(false);

  useEffect(() => {
    getNavContext<{ familyMemberId: string }>("records-family").then((result) => {
      if (result?.familyMemberId) setSelectedFamilyMemberId(result.familyMemberId);
    });
  }, []);

  const isWithinDateFilter = useCallback((recordDateStr: string) => {
    if (dateFilterType === "all") return true;

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

  const { data: records } = useHealthRecords(user?.id);
  const { data: profile } = usePatientProfile(user?.id);
  const { data: familyMembers } = useFamilyMembers(user?.id);

  const ownerName = profile?.name || user?.name || "Patient";

  const selectedFamilyMember = (familyMembers || []).find(m => m.id === selectedFamilyMemberId) || null;
  const viewingRecordsForName = selectedFamilyMember ? selectedFamilyMember.name : "Myself";

  // The person whose records are on screen — the account owner, or the
  // selected family member (never the owner's details on a member's record).
  const patientName = selectedFamilyMember ? selectedFamilyMember.name : ownerName;
  const patientInitials = getPatientInitials(patientName);
  const patientSummary = selectedFamilyMember
    ? {
        age: selectedFamilyMember.age || null,
        gender: selectedFamilyMember.gender || null,
        phone: selectedFamilyMember.phone || null,
        address: null as string | null,
      }
    : {
        age: profile?.age || null,
        gender: profile?.gender || null,
        phone: profile?.phone || null,
        address: ((profile as any)?.address as string | undefined) || "Bangalore, India",
      };

  const [detailedRecords, setDetailedRecords] = useState<any[]>([]);
  const detailedRequestRef = useRef(0);

  const fetchDetailedRecords = useCallback(async () => {
    if (!user?.id) return;
    // Switching between Myself / family members quickly can resolve requests
    // out of order — only the latest selection may populate the list.
    const requestId = ++detailedRequestRef.current;
    setDetailedRecords([]);
    const data = await fetchDetailedConsultations(selectedFamilyMemberId);
    if (requestId !== detailedRequestRef.current) return;
    setDetailedRecords(data || []);
  }, [user?.id, selectedFamilyMemberId]);

  useEffect(() => {
    fetchDetailedRecords();
  }, [fetchDetailedRecords]);

  useEffect(() => {
    setSelectedConsultationId(null);
    setSelectedDoctorName(null);
    setIsExpanded(false);
  }, [selectedFamilyMemberId]);

  // Combine detailed records into a format the UI expects
  const mappedDetailedRecords = detailedRecords.map(r => {
    const emr = r.emr_notes ? (Array.isArray(r.emr_notes) ? r.emr_notes[0] : r.emr_notes) : null;
    let rawAssessment: any = {};
    let rawFindings: any = {};
    let parsedChiefComplaints: any[] = [];

    try {
      if (emr?.assessment) rawAssessment = JSON.parse(emr.assessment);
      if (emr?.objective_findings) rawFindings = JSON.parse(emr.objective_findings);
      if (emr?.chief_complaint) parsedChiefComplaints = JSON.parse(emr.chief_complaint);
    } catch (e) { }

    const pres = r.prescriptions?.[0];
    const meds = pres?.prescription_items?.map((item: any) => ({
      name: item.medicine_name,
      dose: item.dose,
      frequency: item.frequency,
      timing: item.time_of_intake || item.anupana || "After Food",
      duration: item.duration_days ? `${item.duration_days} days` : '',
      instructions: item.special_instructions,
      form: item.classical_type || "Tablet",
      anupana: item.anupana
    })) || [];

    return {
      id: r.id,
      type: "consultation" as const,
      title: rawAssessment?.visitReason ? `Consultation for ${rawAssessment.visitReason}` : "Consultation Report",
      doctor: r.practitioners?.full_name || "Medical Practitioner",
      date: r.created_at,
      summary: "Complete detailed consultation report.",
      discipline: "Ayurveda",
      isDetailed: true,
      _raw: {
        appointment_id: r.appointment_id,
        visitReason: rawAssessment?.visitReason,
        previousHistory: rawAssessment?.previousHistory,
        previousCalls: rawAssessment?.previousCalls,
        chiefComplaints: parsedChiefComplaints,
        history_present: emr?.history_present,
        diagnosis: rawAssessment?.diagnosis,
        vitals: rawFindings?.vitals,
        dosha: rawAssessment?.dosha,
        vikriti: rawAssessment?.vikriti,
        medicines: meds,
        prescriptionNotes: pres?.dietary_advice,
        followUpInstructions: pres?.lifestyle_advice || emr?.plan,
        attachments: emr?.emr_attachments || [],
        practitioner: r.practitioners,
      }
    };
  });

  const allRecordIds = new Set(mappedDetailedRecords.map(r => r.id));
  // health_records has no family-member linkage in the schema, so it can only
  // be safely attributed to the signed-in patient — hide it when viewing a family member.
  const otherRecords = selectedFamilyMemberId ? [] : (records || []).filter(r => !allRecordIds.has(r.id));

  const allRecords = [...mappedDetailedRecords, ...otherRecords];

  const filtered = allRecords.filter((r) => {
    // Tab filter
    const f = filterMap[activeTab];
    if (f && r.type !== f) return false;

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      if (!r.title.toLowerCase().includes(q) &&
        !(r.doctor || "").toLowerCase().includes(q) &&
        !(r.summary || "").toLowerCase().includes(q)) {
        return false;
      }
    }

    // Date filter
    if (!isWithinDateFilter(r.date)) {
      return false;
    }

    return true;
  });

  // Group consultations by Doctor
  const doctorGroups: Record<string, typeof filtered> = {};
  filtered.forEach((record) => {
    const doctorKey = record.doctor || "Medical Practitioner";
    if (!doctorGroups[doctorKey]) {
      doctorGroups[doctorKey] = [];
    }
    doctorGroups[doctorKey].push(record);
  });

  // Extract unique doctor list
  const uniqueDoctors = Object.entries(doctorGroups).map(([doctorName, list]) => {
    const latest = list[0] as any;
    return {
      name: doctorName,
      specializations: latest._raw?.practitioner?.specializations || [],
      qualifications: latest._raw?.practitioner?.qualifications || [],
      hpr_id: latest._raw?.practitioner?.hpr_id,
      consultationCount: list.length,
      list
    };
  });

  const activeDoctor = uniqueDoctors.find(d => d.name === selectedDoctorName) || uniqueDoctors[0];

  useEffect(() => {
    if (uniqueDoctors.length > 0) {
      const exists = uniqueDoctors.some(d => d.name === selectedDoctorName);
      if (!exists) {
        setSelectedDoctorName(uniqueDoctors[0].name);
      }
    } else {
      setSelectedDoctorName(null);
    }
  }, [uniqueDoctors, selectedDoctorName]);

  const activeRecord = activeDoctor?.list?.find((r: any) => r.id === selectedConsultationId) as any;

  return (
    <div className="h-[100dvh] overflow-hidden bg-slate-50/50 flex flex-col">
      {/* TOP HEADER */}
      <div className="bg-white border-b border-slate-200 flex-shrink-0">
        <div className="max-w-[1600px] mx-auto px-6 lg:px-8 py-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Health Records</h1>
              <p className="text-sm text-slate-500 mt-1 max-w-xl">
                Access all your consultations, prescriptions, laboratory reports, and health records from one place.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto mt-2 sm:mt-0">
              {/* Search Bar */}
              <div className="relative w-full sm:w-72 lg:w-80">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-slate-400" />
                </div>
                <input
                  type="text"
                  placeholder="Search records, doctors, or reports..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-full pl-10 pr-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-sm placeholder:text-slate-400 font-medium"
                />
              </div>

              {/* Family Member Dropdown */}
              <div className="relative w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setOpenMemberDropdown(!openMemberDropdown)}
                  className={cn(
                    "h-[42px] px-5 rounded-full border text-xs font-bold flex items-center justify-between sm:justify-start gap-2.5 transition-all cursor-pointer shadow-sm select-none w-full sm:w-auto",
                    selectedFamilyMemberId
                      ? "bg-indigo-50 border-indigo-200 text-indigo-700 ring-1 ring-indigo-200/30"
                      : "bg-white hover:bg-slate-50 border-slate-200 text-slate-600"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Users className={cn("h-4 w-4", selectedFamilyMemberId ? "text-indigo-600" : "text-slate-400")} />
                    <span className="truncate max-w-[120px]">{viewingRecordsForName}</span>
                  </div>
                  <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                </button>

                {openMemberDropdown && (
                  <>
                    <div className="fixed inset-0 z-20" onClick={() => setOpenMemberDropdown(false)} />
                    <div className="absolute right-0 top-[calc(100%+8px)] z-35 bg-white border border-slate-200/80 rounded-2xl shadow-xl min-w-[220px] p-1.5 animate-in fade-in slide-in-from-top-1 duration-150">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedFamilyMemberId(null);
                          setOpenMemberDropdown(false);
                        }}
                        className="w-full text-left px-3.5 py-2 text-xs font-semibold hover:bg-slate-50 rounded-xl transition-colors flex items-center justify-between text-slate-700"
                      >
                        <span className={!selectedFamilyMemberId ? "text-indigo-600 font-bold" : ""}>Myself</span>
                        {!selectedFamilyMemberId && <Check className="h-3.5 w-3.5 text-indigo-600" />}
                      </button>

                      {(familyMembers || []).length > 0 && <div className="border-t border-slate-100 my-1.5" />}

                      {(familyMembers || []).map((member) => (
                        <button
                          type="button"
                          key={member.id}
                          onClick={() => {
                            setSelectedFamilyMemberId(member.id);
                            setOpenMemberDropdown(false);
                          }}
                          className="w-full text-left px-3.5 py-2 text-xs font-semibold hover:bg-slate-50 rounded-xl transition-colors flex items-center justify-between text-slate-700"
                        >
                          <span className={cn("truncate", selectedFamilyMemberId === member.id ? "text-indigo-600 font-bold" : "")}>
                            {member.name} <span className="text-slate-400 font-medium">({member.relationship})</span>
                          </span>
                          {selectedFamilyMemberId === member.id && <Check className="h-3.5 w-3.5 text-indigo-600 flex-shrink-0 ml-2" />}
                        </button>
                      ))}

                      {(familyMembers || []).length === 0 && (
                        <div className="px-3.5 py-2 text-[11px] text-slate-400 font-medium">No family members added yet.</div>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Date Filter Dropdown */}
              <div className="relative w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setOpenDateDropdown(!openDateDropdown)}
                  className={cn(
                    "h-[42px] px-5 rounded-full border text-xs font-bold flex items-center justify-between sm:justify-start gap-2.5 transition-all cursor-pointer shadow-sm select-none w-full sm:w-auto",
                    dateFilterType !== "all"
                      ? "bg-indigo-50 border-indigo-200 text-indigo-700 ring-1 ring-indigo-200/30"
                      : "bg-white hover:bg-slate-50 border-slate-200 text-slate-600"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Calendar className={cn("h-4 w-4", dateFilterType !== "all" ? "text-indigo-600" : "text-slate-400")} />
                    <span className="truncate">
                      {dateFilterType === "all" && "Filter by Date"}
                      {dateFilterType === "today" && "Today"}
                      {dateFilterType === "yesterday" && "Yesterday"}
                      {dateFilterType === "week" && "Last 7 Days"}
                      {dateFilterType === "month" && "Last 30 Days"}
                      {dateFilterType === "custom" && customDate && new Date(customDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                    </span>
                  </div>
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
                      <X className="h-3.5 w-3.5 text-indigo-600" />
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
        </div>
      </div>

      {/* SPLIT WORKSPACE */}
      <div className="flex-1 overflow-hidden flex max-w-[1600px] mx-auto w-full border-x border-slate-200 bg-white shadow-sm my-0">
        {/* LEFT SIDEBAR: Doctor Directory */}
        <div className="w-[350px] lg:w-[380px] border-r border-slate-200 bg-white flex flex-col flex-shrink-0">
          <div className="p-6 border-b border-slate-100 bg-white">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Doctor Directory</h2>
            <p className="text-xs text-slate-500 mt-1">Select a doctor to view consultation histories</p>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 p-2 space-y-1">
            {uniqueDoctors.map((doc) => {
              const isSelected = selectedDoctorName === doc.name;
              const specs = Array.isArray(doc.specializations) ? doc.specializations.join(", ") : doc.specializations || "Ayurveda Specialist";
              const cleanName = doc.name.replace(/^Dr\.\s*/i, "");
              const docInitials = getPatientInitials(cleanName);

              return (
                <div
                  key={doc.name}
                  onClick={() => {
                    setSelectedDoctorName(doc.name);
                    setSelectedConsultationId(null);
                    setIsExpanded(false);
                  }}
                  className={cn(
                    "p-4 rounded-xl cursor-pointer transition-all flex items-start justify-between group",
                    isSelected
                      ? "bg-indigo-50/70 border border-indigo-100/50 shadow-sm"
                      : "hover:bg-slate-50 border border-transparent"
                  )}
                >
                  <div className="flex items-center gap-3.5">
                    <div className={cn(
                      "w-12 h-12 rounded-full flex items-center justify-center font-bold text-base shadow-sm flex-shrink-0 transition-transform",
                      isSelected
                        ? "bg-gradient-to-br from-indigo-600 to-purple-600 text-white shadow-indigo-500/20"
                        : "bg-slate-100 border border-slate-200 text-slate-500 group-hover:bg-indigo-50 group-hover:text-indigo-600 group-hover:border-indigo-100"
                    )}>
                      {docInitials}
                    </div>
                    <div className="min-w-0 flex flex-col justify-center">
                      <span className={cn("text-[9px] font-bold uppercase tracking-wider mb-0.5", isSelected ? "text-indigo-700" : "text-slate-400")}>
                        Ayurveda
                      </span>
                      <h4 className={cn("font-bold text-sm transition-colors truncate", isSelected ? "text-slate-900" : "text-slate-700 group-hover:text-slate-900")}>
                        {doc.name.startsWith("Dr.") ? doc.name : `Dr. ${doc.name}`}
                      </h4>
                      <p className={cn("text-[11px] font-medium mt-0.5 truncate max-w-[180px]", isSelected ? "text-slate-500" : "text-slate-400")}>{specs}</p>
                    </div>
                  </div>
                  <span className={cn(
                    "text-[10px] font-bold px-2 py-0.5 rounded-full tracking-wide transition-colors flex-shrink-0 mt-1",
                    isSelected
                      ? "text-indigo-700 bg-indigo-50"
                      : "text-slate-500 group-hover:text-indigo-600"
                  )}>
                    {doc.consultationCount} {doc.consultationCount === 1 ? 'Record' : 'Records'}
                  </span>
                </div>
              );
            })}

            {uniqueDoctors.length === 0 && (
              <div className="text-center py-12 px-4">
                <Stethoscope className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                <h4 className="text-sm font-semibold text-slate-700">No doctors found</h4>
                <p className="text-xs text-slate-400 mt-1 max-w-[200px] mx-auto leading-relaxed">Try adjusting your filter tabs or search query.</p>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT WORKSPACE: History List or Detailed Report View */}
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto bg-slate-50/30 p-8 flex flex-col">
          {!selectedConsultationId && !activeDoctor ? (
            /* Empty Workspace State */
            <div className="flex-1 flex flex-col items-center justify-center max-w-2xl mx-auto text-center py-20">
              <div className="w-20 h-20 bg-indigo-50 border border-indigo-100/50 rounded-2xl flex items-center justify-center shadow-sm mb-6">
                <FileText className="w-10 h-10 text-indigo-500" />
              </div>
              <h3 className="text-xl font-bold text-slate-900">No Records Found</h3>
              <p className="text-sm text-slate-500 mt-2 max-w-md">
                There are no consultation records available for your current filters.
              </p>
            </div>
          ) : !selectedConsultationId ? (
            /* Consultations Cards List for Selected Doctor */
            <div className="max-w-4xl mx-auto w-full">
              <div className="flex items-center justify-between mb-8 border-b border-slate-200 pb-6">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">
                    {activeDoctor.name.startsWith("Dr.") ? activeDoctor.name : `Dr. ${activeDoctor.name}`}'s Medical History
                  </h2>
                  <p className="text-sm text-slate-500 mt-1">
                    {Array.isArray(activeDoctor.specializations) ? activeDoctor.specializations.join(", ") : activeDoctor.specializations || "Ayurveda Specialist"}
                  </p>
                </div>
              </div>

              <div className="space-y-6 relative before:absolute before:left-[17px] before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                {[...(activeDoctor.list || [])]
                  .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                  .slice(0, isExpanded ? undefined : 5)
                  .map((record: any, idx: number) => {
                    const dateObj = new Date(record.date);

                    return (
                      <div
                        key={record.id}
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
                          onClick={() => setSelectedConsultationId(record.id)}
                          className="flex-1 bg-white border border-slate-200 hover:border-slate-300 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all cursor-pointer flex items-center justify-between gap-6"
                        >
                          <div className="space-y-2.5">
                            <div className="flex items-center gap-3">
                              <span className="font-semibold text-base text-slate-900">
                                {dateObj.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                              </span>
                              <span className="text-xs font-semibold px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-md border border-emerald-100 uppercase tracking-wide">
                                Completed
                              </span>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-y-1.5 gap-x-6 text-sm text-slate-600 font-medium">
                              <div className="flex items-center gap-1.5">
                                <span className="text-slate-500">Reason:</span>
                                <span className="text-slate-800">{record._raw?.visitReason || record._raw?.diagnosis || "Follow Up"}</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-slate-500">Prescribed:</span>
                                <span className="text-slate-800">{record._raw?.medicines?.length || 0} Formulations</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            <button className="flex items-center gap-1.5 py-2.5 px-4 bg-slate-50 hover:bg-slate-100 border border-slate-200 hover:border-slate-300 text-slate-700 text-sm font-semibold rounded-xl transition-all shadow-sm">
                              <span>Open Report</span>
                              <ArrowRight className="w-4 h-4 ml-0.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                {/* View More / View Less Navigation */}
                {activeDoctor.list && activeDoctor.list.length > 5 && (
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
            </div>
          ) : activeRecord ? (
            /* Detailed Report View of Selected Consultation */
            <div className="max-w-4xl mx-auto w-full">
              {/* Header / Actions */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8 border-b border-slate-200 pb-6">
                <div>
                  <button
                    onClick={() => setSelectedConsultationId(null)}
                    className="inline-flex items-center text-sm font-semibold text-slate-500 hover:text-indigo-600 transition-colors mb-3"
                  >
                    <ArrowLeft className="w-4 h-4 mr-1.5" />
                    Back to Consultations
                  </button>
                  <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
                    Consultation Record
                    <span className="px-2.5 py-0.5 text-xs font-semibold bg-emerald-50 text-emerald-700 rounded-md border border-emerald-100 uppercase tracking-wider">Completed</span>
                  </h1>
                  <p className="text-xs text-slate-500 mt-1">
                    Consulted with {activeRecord.doctor.startsWith("Dr.") ? activeRecord.doctor : `Dr. ${activeRecord.doctor}`} on {new Date(activeRecord.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Consultation Report</span>
                </div>
              </div>

              <div className="space-y-6">
                {/* Treating Doctor Card */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg shadow-sm flex-shrink-0">
                      {getPatientInitials(activeRecord.doctor.replace(/^Dr\.\s*/i, ""))}
                    </div>
                    <div>
                      <span className="text-[10px] bg-indigo-50 text-indigo-700 font-bold px-2 py-0.5 rounded uppercase tracking-wider mb-1 inline-block border border-indigo-100">Treating Doctor</span>
                      <h3 className="font-bold text-base text-slate-900 leading-tight">
                        {activeRecord.doctor.startsWith("Dr.") ? activeRecord.doctor : `Dr. ${activeRecord.doctor}`}
                      </h3>
                      <p className="text-xs text-slate-500 font-medium mt-0.5">
                        {Array.isArray(activeDoctor.specializations) ? activeDoctor.specializations.join(", ") : activeDoctor.specializations || "Ayurveda Specialist"}
                      </p>
                    </div>
                  </div>
                  <div className="relative z-10 flex-shrink-0 w-full sm:w-auto flex items-center gap-2">
                    <InvoiceDialog
                      consultationId={activeRecord.id}
                      patientName={patientName}
                      doctorName={activeRecord.doctor}
                      invoiceDate={new Date(activeRecord.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    />
                    <a href={`/api/consultations/${activeRecord.id}/pdf`} target="_blank" className="w-full sm:w-auto">
                      <button className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-sm font-semibold rounded-xl shadow-sm transition-all">
                        <Download className="w-4 h-4" />
                        Download PDF
                      </button>
                    </a>
                  </div>
                </div>

                {/* Patient Profile Summary - Column Layout */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-5">
                    <User className="w-4 h-4 text-indigo-600" />
                    Patient Profile Summary
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Full Name</span>
                      <span className="text-sm font-semibold text-slate-900">{patientName}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Age & Gender</span>
                      <span className="text-sm font-semibold text-slate-900 capitalize">{patientSummary.age ?? "—"} y / {patientSummary.gender || "—"}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Phone</span>
                      <span className="text-sm font-semibold text-slate-900">{patientSummary.phone || "—"}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                        {selectedFamilyMember ? "Relationship" : "Address"}
                      </span>
                      <span className="text-sm font-semibold text-slate-900 capitalize">
                        {selectedFamilyMember ? selectedFamilyMember.relationship || "—" : patientSummary.address}
                      </span>
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
                    {activeRecord._raw?.visitReason && (
                      <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Visit Reason</p>
                        <p className="text-slate-800 text-sm font-medium">{activeRecord._raw.visitReason}</p>
                      </div>
                    )}

                    {activeRecord._raw?.chiefComplaints && activeRecord._raw.chiefComplaints.length > 0 && (
                      <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Chief Complaints</p>
                        <div className="flex flex-wrap gap-2">
                          {activeRecord._raw.chiefComplaints.map((c: string, idx: number) => (
                            <span key={idx} className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 shadow-sm">{c}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {activeRecord._raw?.history_present && (
                      <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">History of Present Illness (Subjective)</p>
                        <p className="text-slate-800 text-sm font-medium whitespace-pre-line leading-relaxed">{activeRecord._raw.history_present}</p>
                      </div>
                    )}

                    {activeRecord._raw?.previousHistory && (
                      <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Past Medical History</p>
                        <p className="text-slate-800 text-sm font-medium leading-relaxed">{activeRecord._raw.previousHistory}</p>
                      </div>
                    )}

                    {activeRecord._raw?.previousCalls && (
                      <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Previous Consultation Summary</p>
                        <p className="text-slate-800 text-sm font-medium leading-relaxed">{activeRecord._raw.previousCalls}</p>
                      </div>
                    )}

                    {activeRecord._raw?.diagnosis && (
                      <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Diagnosis</p>
                        <p className="text-slate-800 text-sm font-bold">{activeRecord._raw.diagnosis}</p>
                      </div>
                    )}

                    {!activeRecord._raw?.visitReason &&
                      (!activeRecord._raw?.chiefComplaints || activeRecord._raw.chiefComplaints.length === 0) &&
                      !activeRecord._raw?.history_present &&
                      !activeRecord._raw?.previousHistory &&
                      !activeRecord._raw?.previousCalls &&
                      !activeRecord._raw?.diagnosis && (
                        <div className="text-center py-6">
                          <p className="text-xs text-slate-400 italic">No clinical SOAP notes recorded for this consultation.</p>
                        </div>
                      )}
                  </div>
                </div>

                {/* Vitals Summary Card */}
                {activeRecord._raw?.vitals && (
                  <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                    <h2 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
                      <Activity className="w-4.5 h-4.5 text-indigo-500" />
                      Recorded Vitals & Measurements
                    </h2>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                      <div className="p-4 bg-blue-50/50 border border-blue-100/50 rounded-xl flex flex-col items-center justify-center text-center">
                        <span className="text-[10px] font-bold text-blue-600/70 uppercase tracking-wider">Blood Pressure</span>
                        <span className="text-base font-bold text-blue-900 mt-1">
                          {activeRecord._raw.vitals.bpSys || activeRecord._raw.vitals.bpDia ? (
                            <>
                              {activeRecord._raw.vitals.bpSys || "—"}/{activeRecord._raw.vitals.bpDia || "—"}
                              <span className="text-xs font-medium text-blue-600/70 ml-0.5">mmHg</span>
                            </>
                          ) : "—"}
                        </span>
                      </div>
                      <div className="p-4 bg-rose-50/50 border border-rose-100/50 rounded-xl flex flex-col items-center justify-center text-center">
                        <span className="text-[10px] font-bold text-rose-600/70 uppercase tracking-wider">Pulse</span>
                        <span className="text-base font-bold text-rose-900 mt-1">
                          {activeRecord._raw.vitals.pulse || "—"}
                          {activeRecord._raw.vitals.pulse && <span className="text-xs font-medium text-rose-600/70 ml-0.5">bpm</span>}
                        </span>
                      </div>
                      <div className="p-4 bg-amber-50/50 border border-amber-100/50 rounded-xl flex flex-col items-center justify-center text-center">
                        <span className="text-[10px] font-bold text-amber-600/70 uppercase tracking-wider">Temperature</span>
                        <span className="text-base font-bold text-amber-900 mt-1">
                          {activeRecord._raw.vitals.temp || "—"}
                          {activeRecord._raw.vitals.temp && <span className="text-xs font-medium text-amber-600/70 ml-0.5">°F</span>}
                        </span>
                      </div>
                      <div className="p-4 bg-indigo-50/50 border border-indigo-100/50 rounded-xl flex flex-col items-center justify-center text-center">
                        <span className="text-[10px] font-bold text-indigo-600/70 uppercase tracking-wider">SpO₂</span>
                        <span className="text-base font-bold text-indigo-900 mt-1">
                          {activeRecord._raw.vitals.spo2 || "—"}
                          {activeRecord._raw.vitals.spo2 && <span className="text-xs font-medium text-indigo-600/70 ml-0.5">%</span>}
                        </span>
                      </div>
                      <div className="p-4 bg-emerald-50/50 border border-emerald-100/50 rounded-xl flex flex-col items-center justify-center text-center">
                        <span className="text-[10px] font-bold text-emerald-600/70 uppercase tracking-wider">Weight</span>
                        <span className="text-base font-bold text-emerald-900 mt-1">
                          {activeRecord._raw.vitals.weight || "—"}
                          {activeRecord._raw.vitals.weight && <span className="text-xs font-medium text-emerald-600/70 ml-0.5">kg</span>}
                        </span>
                      </div>
                      <div className="p-4 bg-purple-50/50 border border-purple-100/50 rounded-xl flex flex-col items-center justify-center text-center">
                        <span className="text-[10px] font-bold text-purple-600/70 uppercase tracking-wider">BMI</span>
                        <span className="text-base font-bold text-purple-900 mt-1">
                          {activeRecord._raw.vitals.bmi || "—"}
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
                  {activeRecord._raw?.medicines && activeRecord._raw.medicines.length > 0 ? (
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
                          {activeRecord._raw.medicines.map((m: any, idx: number) => (
                            <tr key={idx} className="hover:bg-slate-50/30 transition-colors">
                              <td className="p-4 font-semibold text-slate-900">{m.name}</td>
                              <td className="p-4 text-slate-700">{m.form} ({m.dose || "—"})</td>
                              <td className="p-4 text-slate-700">
                                <div className="font-semibold text-slate-900">{m.frequency || "—"}</div>
                                {m.timing && <div className="text-xs text-slate-400 mt-0.5">Timing: {m.timing}</div>}
                              </td>
                              <td className="p-4 text-slate-700 font-medium">{m.duration || "—"}</td>
                              <td className="p-4 text-slate-500 italic">{m.instructions || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="p-6 text-center bg-slate-50/50 border border-dashed border-slate-200 rounded-xl">
                      <p className="text-sm font-semibold text-slate-400">No medicines prescribed.</p>
                    </div>
                  )}
                </div>

                {/* Additional instructions notes */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                  <h2 className="text-base font-bold text-slate-900 mb-3 flex items-center gap-2">
                    <FileText className="w-4.5 h-4.5 text-indigo-500" />
                    Dietary & Lifestyle Advice
                  </h2>
                  {activeRecord._raw?.prescriptionNotes ? (
                    <div
                      className="prose prose-sm max-w-none text-slate-700 bg-amber-50/20 p-5 rounded-xl border border-amber-100/50
                        [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mb-1 [&_p]:mb-3 last:[&_p]:mb-0 font-medium leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: activeRecord._raw.prescriptionNotes }}
                    />
                  ) : (
                    <p className="text-sm text-slate-400 italic">No dietary or lifestyle advice recorded.</p>
                  )}
                </div>

                {/* Uploaded Attachments */}
                {activeRecord._raw?.attachments && activeRecord._raw.attachments.length > 0 && (
                  <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                    <h2 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
                      <FileUp className="w-4.5 h-4.5 text-indigo-500" />
                      Uploaded Consultation Reports
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {activeRecord._raw.attachments.map((file: any) => (
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
                      {activeRecord._raw?.followUpInstructions?.replace(/\[Upcoming Session Fixed: .*?\]/g, '').trim() || "No specific follow-up instructions provided."}
                    </p>
                  </div>

                  {activeRecord._raw?.followUpInstructions?.match(/\[Upcoming Session Fixed: (.*?)\]/) && (
                    <div className="bg-[#f0fdf4] border border-[#bbf7d0] rounded-xl p-4 flex items-center justify-between">
                      <div>
                        <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider mb-1">Upcoming Session Booked</p>
                        <p className="text-sm font-bold text-emerald-800">
                          {(() => {
                            const match = activeRecord._raw?.followUpInstructions?.match(/\[Upcoming Session Fixed: (.*?) at (.*?)\]/);
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
          ) : null}
        </div>
      </div>
    </div>
  );
}