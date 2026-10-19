

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useRef, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { useQuery } from "@/hooks/useQuery";
import { apiClient } from "@/shared/api/api-client";
import { toast } from "react-hot-toast";
import { useAuth } from "@/contexts/auth-context";
import { getNavContext, setNavContext } from "@/lib/nav-context-client";
import { createClient } from "@/lib/supabase/client";
import { usePractitioner } from "@/hooks/use-discover";
import { usePractitionerSlots, usePractitionerAvailableDates } from "@/hooks/use-availability";

function useMyPractitionerId(userId: string | undefined) {
  return useQuery<string | undefined>(
    async () => {
      if (!userId) return undefined;
      const res = await apiClient<{ data: { user?: { practitionerId?: string } } }>("/api/auth/me");
      return res.data?.user?.practitionerId;
    },
    [userId]
  );
}

function usePatientIntakeDetails(patientId: string, appointmentId?: string) {
  return useQuery<any>(
    () => {
      if (!patientId) return Promise.resolve(null);
      const query = appointmentId ? `?appointmentId=${encodeURIComponent(appointmentId)}` : "";
      return apiClient<{ data: any }>(`/api/registry/${patientId}/intake${query}`).then((r) => r.data);
    },
    [patientId, appointmentId]
  );
}

function useNewDoctorSlots(doctorId: string | undefined, date: string) {
  return useQuery<any[]>(
    () =>
      doctorId && date
        ? apiClient<{ data: any[] }>("/api/discover/new-doctor-slots", { params: { doctorId, date } }).then((r) => r.data)
        : Promise.resolve([]),
    [doctorId, date]
  );
}

function useNewDoctorAvailableDates(doctorId: string | undefined) {
  return useQuery<string[]>(
    () =>
      doctorId
        ? apiClient<{ data: string[] }>("/api/discover/new-doctor-dates", { params: { doctorId } }).then((r) => r.data)
        : Promise.resolve([]),
    [doctorId]
  );
}

/** Parses "HH:MM" (24h) or "h:mm AM/PM" into minutes since midnight, or -1 if unparseable. */
/** BMI = weight (kg) / height (m)², one decimal. Blank unless both are positive numbers. */
function computeBmi(weightKg: unknown, heightCm: unknown): string {
  const w = Number(weightKg);
  const h = Number(heightCm);
  if (!weightKg || !heightCm || !Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return "";
  return (w / Math.pow(h / 100, 2)).toFixed(1);
}

function timeStringToMinutes(t: string | undefined | null): number {
  if (!t) return -1;
  const ampmMatch = t.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (ampmMatch) {
    let h = parseInt(ampmMatch[1], 10) % 12;
    if (ampmMatch[3].toUpperCase() === "PM") h += 12;
    return h * 60 + parseInt(ampmMatch[2], 10);
  }
  const hmMatch = t.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (hmMatch) {
    return parseInt(hmMatch[1], 10) * 60 + parseInt(hmMatch[2], 10);
  }
  return -1;
}

async function saveCompleteConsultation(payload: Record<string, unknown>): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch("/api/consultations/complete", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok || !result.success) {
      return { success: false, error: result.error || "Failed to save consultation" };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to save consultation" };
  }
}
import {
  User, Activity, Syringe, Heart, Fingerprint, Calendar, Phone,
  MapPin, Stethoscope, Droplets, Thermometer, Weight, Flame,
  FileText, ArrowUpCircle, Plus, Trash2, FileUp, Save, History, Clock,
  ChevronRight, Banknote, Wallet
} from "lucide-react";

type MedicineSuggestion = {
  id: string;
  name: string;
  generic_name?: string | null;
  standard_dose?: string | null;
  standard_dose_min?: number | null;
  standard_dose_max?: number | null;
  dose_unit?: string | null;
  discipline?: string | null;
};

function formatDoseSuggestion(m: MedicineSuggestion): string {
  if (m.standard_dose) return m.standard_dose;
  if (m.standard_dose_min != null && m.standard_dose_max != null) {
    return `${m.standard_dose_min}-${m.standard_dose_max}${m.dose_unit ? ` ${m.dose_unit}` : ""}`;
  }
  if (m.standard_dose_min != null) return `${m.standard_dose_min}${m.dose_unit ? ` ${m.dose_unit}` : ""}`;
  return "";
}

function MedicineNameCell({
  name,
  onSelect,
}: {
  name: string;
  onSelect: (medicine: { name: string; dose: string }) => void;
}) {
  const [inputValue, setInputValue] = useState(name);
  const [suggestions, setSuggestions] = useState<MedicineSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setMounted(true), []);
  useEffect(() => setInputValue(name), [name]);

  useEffect(() => {
    if (!inputValue.trim()) {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(() => {
      apiClient<{ data: MedicineSuggestion[] }>("/api/medicines", { params: { search: inputValue } })
        .then((r) => setSuggestions(r.data ?? []))
        .catch(() => setSuggestions([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [inputValue]);

  const updateRect = () => {
    if (inputRef.current) {
      const r = inputRef.current.getBoundingClientRect();
      setRect({ top: r.bottom + 4, left: r.left, width: r.width });
    }
  };

  useEffect(() => {
    if (!open) return;
    updateRect();
    window.addEventListener("scroll", updateRect, true);
    window.addEventListener("resize", updateRect);
    return () => {
      window.removeEventListener("scroll", updateRect, true);
      window.removeEventListener("resize", updateRect);
    };
  }, [open]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      const target = e.target as Node;
      if (wrapperRef.current && !wrapperRef.current.contains(target) && !document.getElementById("medicine-suggestion-portal")?.contains(target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const dropdown = open && suggestions.length > 0 && rect && (
    <div
      id="medicine-suggestion-portal"
      style={{ position: "fixed", top: rect.top, left: rect.left, width: rect.width }}
      className="bg-white border border-gray-200 rounded-xl shadow-lg z-[100] overflow-hidden max-h-56 overflow-y-auto"
    >
      {suggestions.map((m) => {
        const doseSuggestion = formatDoseSuggestion(m);
        return (
          <button
            key={m.id}
            type="button"
            onMouseDown={() => {
              setInputValue(m.name);
              onSelect({ name: m.name, dose: doseSuggestion });
              setOpen(false);
            }}
            className="w-full flex items-center justify-between gap-3 px-3 py-2 text-xs hover:bg-gray-50 transition-colors text-left"
          >
            <span className="font-medium text-gray-900">
              {m.name}
              {m.generic_name ? <span className="text-gray-400 font-normal"> · {m.generic_name}</span> : null}
            </span>
            {doseSuggestion && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 flex-shrink-0">
                {doseSuggestion}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );

  return (
    <div ref={wrapperRef} className="relative">
      <input
        ref={inputRef}
        type="text"
        title={inputValue}
        placeholder="Search medicine..."
        value={inputValue}
        onChange={(e) => { setInputValue(e.target.value); onSelect({ name: e.target.value, dose: "" }); setOpen(true); }}
        onFocus={() => { setOpen(true); setShowTooltip(true); }}
        onBlur={() => setShowTooltip(false)}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className="w-full truncate bg-white border border-gray-200 rounded-[8px] px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 outline-none shadow-sm transition-all"
      />
      {showTooltip && inputValue && (
        <div className="absolute z-50 bottom-full left-0 mb-1.5 max-w-[240px] px-2.5 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-medium shadow-lg whitespace-normal break-words pointer-events-none">
          {inputValue}
          <div className="absolute top-full left-4 w-2 h-2 bg-gray-900 rotate-45 -mt-1" />
        </div>
      )}
      {mounted && dropdown ? createPortal(dropdown, document.body) : null}
    </div>
  );
}

const SectionCard = ({ title, icon: Icon, children }: { title: string, icon: any, children: React.ReactNode }) => (
  <div className="bg-white rounded-[16px] border border-[#E5E7EB] shadow-[0_2px_8px_rgba(0,0,0,0.04)] p-8 mb-8">
    <div className="flex items-center gap-3 mb-8">
      <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-sm">
        <Icon className="w-5 h-5" />
      </div>
      <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
    </div>
    {children}
  </div>
);

type PatientNavContext = { patientId: string; appointmentId?: string };

export default function PatientIntakeClient() {
  const router = useRouter();
  const { user } = useAuth();

  const [navContext, setNavContextState] = useState<PatientNavContext | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    getNavContext<PatientNavContext>("patient").then((result) => {
      if (!cancelled) setNavContextState(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (navContext === null) {
      router.replace("/pro/patients");
    }
  }, [navContext, router]);

  const id = navContext?.patientId ?? "";
  const appointmentId = navContext?.appointmentId;

  const { data: intakeData, loading: isLoading, error } = usePatientIntakeDetails(id, appointmentId);
  const patient = intakeData?.patient;
  const vitalsHistory = intakeData?.vitalsHistory || [];

  const latestVitals = vitalsHistory[0] ?? {
    date: "No record", doctor: "N/A", doctorInitials: "N/A",
    bpSys: 120, bpDia: 80, pulse: 72, temp: 98.6, spo2: 98, rr: 16, weight: 70, height: 170
  };
  // State for editable patient details header card
  const [height, setHeight] = useState<number | "">("");
  const [weight, setWeight] = useState<number | "">("");
  const [bloodGroup, setBloodGroup] = useState("");
  const [address, setAddress] = useState("");

  // State for Section 2 - Consultation Details
  const [visitReason, setVisitReason] = useState("");
  const [chiefComplaints, setChiefComplaints] = useState<string[]>([]);
  const [complaintInput, setComplaintInput] = useState("");
  const [presentIllness, setPresentIllness] = useState("");
  const [previousHistory, setPreviousHistory] = useState("");
  const [previousCalls, setPreviousCalls] = useState("");

  // State for Section 3 - Recorded Vitals
  const [vitals, setVitals] = useState({
    bpSys: "",
    bpDia: "",
    pulse: "",
    temp: "",
    spo2: "",
    weight: "",
    bmi: "",
  });

  // State for Section 5 - Prescription
  const [medicines, setMedicines] = useState([
    { id: 1, name: "", form: "Tablet", dose: "", frequency: "Morning", timing: "After Food", duration: "", instructions: "" }
  ]);
  const [prescriptionNotes, setPrescriptionNotes] = useState("");
  // Advice/notes-only consultation — completes without any medicines.
  const [noPrescription, setNoPrescription] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // State for Section 6 - Upload Reports
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setUploadedFiles(prev => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  const handleRemoveFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleFormat = (command: string) => {
    document.execCommand(command, false);
    if (editorRef.current) {
      editorRef.current.focus();
    }
  };

  // State for Section 7 & 8
  const [followUpInstructions, setFollowUpInstructions] = useState("");
  const [upcomingCallDate, setUpcomingCallDate] = useState("");
  const [upcomingCallTime, setUpcomingCallTime] = useState("");
  const [upcomingCallSlotId, setUpcomingCallSlotId] = useState("");
  const [followUpAppointmentId, setFollowUpAppointmentId] = useState("");
  const [isBookingFollowUp, setIsBookingFollowUp] = useState(false);
  const [isCallFixed, setIsCallFixed] = useState(false);
  const [isUpcomingVisible, setIsUpcomingVisible] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "online">("cash");

  // Calendar booking states
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth());
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());
  const [selectedCalendarDate, setSelectedCalendarDate] = useState("");
  const [showCalendarPanel, setShowCalendarPanel] = useState(false);
  const [upcomingCallMode, setUpcomingCallMode] = useState<"video" | "clinic">("video");

  const { data: myPractitionerIdRaw } = useMyPractitionerId(user?.id);
  const myPractitionerId = myPractitionerIdRaw ?? undefined;

  const { data: legacyDoc } = usePractitioner(myPractitionerId);
  const isLegacyPractitioner = !!legacyDoc;

  const { data: legacyDates, loading: legacyDatesLoading } = usePractitionerAvailableDates(myPractitionerId);
  const { data: newDates, loading: newDatesLoading } = useNewDoctorAvailableDates(myPractitionerId);

  const rawAvailableDates = isLegacyPractitioner ? legacyDates : newDates;
  const datesLoading = isLegacyPractitioner ? legacyDatesLoading : newDatesLoading;

  const selectedDate = selectedCalendarDate || rawAvailableDates?.[0] || "";

  const legacySlotsQuery = usePractitionerSlots(myPractitionerId, selectedDate);
  const newSlotsQuery = useNewDoctorSlots(myPractitionerId, selectedDate);

  const rawSlots = isLegacyPractitioner ? (legacySlotsQuery.data ?? []) : (newSlotsQuery.data ?? []);
  const slotsLoading = isLegacyPractitioner ? legacySlotsQuery.loading : newSlotsQuery.loading;

  // Deduplicate slots
  const slotMap = new Map<string, any>();
  for (const s of rawSlots) {
    const key = s.timeValue || s.startTime;
    if (slotMap.has(key)) {
      const ex = slotMap.get(key);
      const mode = s.mode || s.consultMode;
      if (mode && !ex.modes.includes(mode)) ex.modes.push(mode);
    } else {
      const mode = s.mode || s.consultMode;
      slotMap.set(key, { ...s, modes: s.modes || (mode ? [mode] : []) });
    }
  }
  // On the current day, don't offer slots that have already passed.
  const todayDateStr = new Date().toISOString().split("T")[0];
  const slots = Array.from(slotMap.values()).filter((s) => {
    if (selectedDate !== todayDateStr) return true;
    const slotMinutes = timeStringToMinutes(s.timeValue || s.startTime);
    if (slotMinutes < 0) return true;
    const now = new Date();
    return slotMinutes > now.getHours() * 60 + now.getMinutes();
  });

  const calendarDays = useMemo(() => {
    const firstDay = new Date(calendarYear, calendarMonth, 1);
    let startDayOfWeek = firstDay.getDay();
    startDayOfWeek = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;

    const totalDays = new Date(calendarYear, calendarMonth + 1, 0).getDate();

    const days = [];
    for (let i = 0; i < startDayOfWeek; i++) {
      days.push(null);
    }

    for (let day = 1; day <= totalDays; day++) {
      const yearStr = calendarYear;
      const monthStr = String(calendarMonth + 1).padStart(2, "0");
      const dayStr = String(day).padStart(2, "0");
      const dateStr = `${yearStr}-${monthStr}-${dayStr}`;

      days.push({
        day,
        dateStr,
      });
    }

    return days;
  }, [calendarMonth, calendarYear]);

  const monthName = new Date(calendarYear, calendarMonth).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric"
  });

  const nextMonth = () => {
    if (calendarMonth === 11) {
      setCalendarMonth(0);
      setCalendarYear(calendarYear + 1);
    } else {
      setCalendarMonth(calendarMonth + 1);
    }
  };

  const prevMonth = () => {
    const today = new Date();
    if (calendarYear > today.getFullYear() || (calendarYear === today.getFullYear() && calendarMonth > today.getMonth())) {
      if (calendarMonth === 0) {
        setCalendarMonth(11);
        setCalendarYear(calendarYear - 1);
      } else {
        setCalendarMonth(calendarMonth - 1);
      }
    }
  };

  const [isSaved, setIsSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Sync vitals.weight with header weight input; BMI follows weight and height
  // (and clears when either is removed).
  useEffect(() => {
    setVitals(v => ({
      ...v,
      weight: weight !== "" ? String(weight) : v.weight,
      bmi: computeBmi(weight !== "" ? weight : v.weight, height),
    }));
  }, [weight, height]);

  // Sync vitals weight change back to header weight
  const handleVitalsWeightChange = (val: string) => {
    setVitals(v => ({ ...v, weight: val, bmi: computeBmi(val, height) }));
    if (val !== "") {
      setWeight(Number(val));
    } else {
      setWeight("");
    }
  };

  // Run once data is loaded to populate values from latest checked record
  const [hasInitialized, setHasInitialized] = useState(false);

  useEffect(() => {
    if (intakeData && !hasInitialized) {
      const pat = intakeData.patient;
      const latestVisit = intakeData.visits?.[0] as any;

      if (pat) {
        setHeight(pat.height || "");
        setWeight(pat.weight || "");
        // DB values sometimes use a Unicode minus sign (e.g. "B−") instead of
        // a hyphen, which wouldn't match the select's "B-" option value.
        setBloodGroup(
          pat.bloodGroup
            ? String(pat.bloodGroup).replace(/[‐-―−]/g, "-").trim()
            : "",
        );
        setAddress(pat.address || "");
      }

      if (latestVisit) {
        setVisitReason(latestVisit.visitReason || "");
        setChiefComplaints(latestVisit.chiefComplaints || []);
        setPresentIllness(latestVisit.soap?.S || "");
        setPreviousHistory(latestVisit.previousHistory || "");
        setPreviousCalls(latestVisit.previousCalls || "");

        const v = (latestVisit.vitals as any) || {};
        setVitals({
          bpSys: v.bpSys || "",
          bpDia: v.bpDia || "",
          pulse: v.pulse || "",
          temp: v.temp || "",
          spo2: v.spo2 || "",
          weight: v.weight || pat?.weight || "",
          bmi: computeBmi(v.weight || pat?.weight, v.height || pat?.height),
        });

        if (latestVisit.medications && latestVisit.medications.length > 0) {
          setMedicines(latestVisit.medications.map((m: any, idx: number) => ({
            id: m.id || idx,
            name: m.name || "",
            form: m.form || "Tablet",
            dose: m.dose || "",
            frequency: m.frequency || "Morning",
            timing: m.timing || "After Food",
            duration: m.duration || "",
            instructions: m.instructions || ""
          })));
        }

        const rawInstructions = latestVisit.followUpInstructions || "";
        const match = rawInstructions.match(/\[Upcoming Session Fixed: (.*?) at (.*?)\]/);

        if (match) {
          setUpcomingCallDate(match[1]);
          setUpcomingCallTime(match[2]);
          setIsUpcomingVisible(true);
          const cleanInstructions = rawInstructions.replace(/\[Upcoming Session Fixed: .*?\]/g, "").trim();
          setPrescriptionNotes(cleanInstructions);
          setFollowUpInstructions(cleanInstructions);
          if (editorRef.current) {
            editorRef.current.innerHTML = cleanInstructions;
          }
        } else {
          setPrescriptionNotes(rawInstructions);
          setFollowUpInstructions(rawInstructions);
          if (editorRef.current) {
            editorRef.current.innerHTML = rawInstructions || "<ul><li>Continue medicines regularly.</li><li>Take with warm water.</li><li>Follow prescribed diet.</li><li>Return after 15 days.</li></ul>";
          }
        }
      }
      setHasInitialized(true);
    }
  }, [intakeData, hasInitialized]);

  const handleAddMedicine = () => {
    setMedicines([...medicines, { id: Date.now(), name: "", form: "Tablet", dose: "", frequency: "Morning", timing: "After Food", duration: "", instructions: "" }]);
  };

  const handleRemoveMedicine = (id: number) => {
    setMedicines(medicines.filter(m => m.id !== id));
  };

  const handleMedicineSelect = (id: number, medicine: { name: string; dose: string }) => {
    setMedicines(medicines.map(m => m.id === id ? { ...m, name: medicine.name, dose: medicine.dose || m.dose } : m));
  };

  const handleMedicineChange = (id: number, field: string, value: string) => {
    setMedicines(medicines.map(m => m.id === id ? { ...m, [field]: value } : m));
  };

  const handleSaveConsultation = async () => {
    const hasMedicine = medicines.some((m) => m.name.trim());
    if (!noPrescription && !hasMedicine) {
      alert('Add at least one medicine, or tick "No prescription needed" to complete this consultation with notes only.');
      return;
    }

    setIsSaving(true);
    try {
      const reportUrls: string[] = [];
      const reportNames: string[] = [];

      const supabaseClient = createClient();
      for (const file of uploadedFiles) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${id}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        const { data, error } = await supabaseClient.storage.from('patient-reports').upload(fileName, file);
        if (error) {
          console.error("Error uploading file:", error);
        } else if (data) {
          const { data: { publicUrl } } = supabaseClient.storage.from('patient-reports').getPublicUrl(data.path);
          reportUrls.push(publicUrl);
          reportNames.push(file.name);
        }
      }

      const consultationData = {
        practitionerId: user?.id || "",
        patientId: id,
        appointmentId,
        visitReason,
        chiefComplaints,
        presentIllness,
        previousHistory,
        previousCalls,
        vitals: {
          ...vitals,
          height,
          weight
        },
        bloodGroup,
        address,
        medicines: noPrescription ? [] : medicines,
        noPrescription,
        prescriptionNotes,
        paymentMethod,
        followUpInstructions: upcomingCallDate && upcomingCallTime
          ? `[Upcoming Session Fixed: ${upcomingCallDate} at ${upcomingCallTime}]\n\n${followUpInstructions}`
          : followUpInstructions,
        upcomingCallDate: upcomingCallDate || undefined,
        upcomingCallTime: upcomingCallTime || undefined,
        upcomingCallMode: upcomingCallDate && upcomingCallTime ? upcomingCallMode : undefined,
        reportUrls,
        reportNames
      };

      const result = await saveCompleteConsultation(consultationData);

      if (result.success) {
        setIsSaved(true);
        setTimeout(async () => {
          await setNavContext("prescriptions", { patientId: patient?.id || id });
          router.push("/pro/prescriptions");
        }, 1200);
      } else {
        alert("Failed to save consultation: " + result.error);
      }
    } catch (err: any) {
      alert("Failed to save consultation: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };
  const addComplaint = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && complaintInput.trim() !== '') {
      e.preventDefault();
      if (!chiefComplaints.includes(complaintInput.trim())) {
        setChiefComplaints([...chiefComplaints, complaintInput.trim()]);
      }
      setComplaintInput("");
    }
  };

  const removeComplaint = (complaint: string) => {
    setChiefComplaints(chiefComplaints.filter(c => c !== complaint));
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center p-8 bg-white rounded-2xl border border-rose-100 shadow-sm max-w-lg mx-auto mt-20">
        <div className="text-rose-500 font-bold text-lg mb-2">Error Loading Patient Data</div>
        <p className="text-slate-500 text-sm mb-4">{error}</p>
        <div className="text-xs text-slate-400 bg-slate-50 p-4 rounded-lg text-left font-mono mb-4 leading-relaxed">
          Please verify that you have run the database migration script in your Supabase SQL Editor.
          The script is located at: supabase/migrations/20260706000000_add_patient_vitals_columns.sql
        </div>
        <button onClick={() => window.location.reload()} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold transition-colors">
          Retry
        </button>
      </div>
    );
  }
  if (isLoading || !patient) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-24">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-gray-200 px-6 py-4 flex items-center justify-between mb-10 shadow-sm">
        <div className="flex items-center gap-2 text-sm text-gray-500 font-medium">
          <Link href="/pro/patients" className="hover:text-indigo-600 transition-colors">Patients</Link>
          <span className="text-gray-300">/</span>
          <span className="text-gray-900">Consultation: {patient.name}</span>
        </div>
      </div>

      <div className="max-w-[1200px] mx-auto px-6">

        {/* Section 1: Patient Details (Read Only) */}
        <div className="bg-white rounded-[16px] border border-[#E5E7EB] shadow-[0_2px_8px_rgba(0,0,0,0.04)] p-8 mb-8 flex flex-col lg:flex-row gap-8">
          {/* Left Side: Identity Card */}
          <div className="flex flex-col items-center justify-center bg-[#F8FAFC] rounded-2xl p-6 border border-gray-100 lg:w-1/3 min-w-[280px]">
            <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-indigo-100 to-purple-100 flex items-center justify-center text-indigo-700 font-display font-bold text-4xl shadow-sm mb-4 border-4 border-white">
              {patient.name[0]}
            </div>
            <h2 className="text-2xl font-bold text-gray-900 text-center mb-1">{patient.name}</h2>
            {patient.relationship && (
              <span className="text-[11px] font-bold text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded-full capitalize mb-2">
                Family Member &middot; {patient.relationship}
              </span>
            )}
            <p className="text-sm font-mono text-gray-400 bg-white px-3 py-1 rounded-full border border-gray-100 mb-4 shadow-sm">ID: {id.substring(0, 8).toUpperCase()}</p>
            <div className="flex gap-4 text-sm font-medium text-gray-600 bg-white px-6 py-2.5 rounded-xl border border-gray-100 shadow-sm">
              <span className="flex items-center gap-1.5"><Calendar className="w-4 h-4 text-indigo-400" /> {patient.age}y</span>
              <div className="w-px h-4 bg-gray-200"></div>
              <span className="flex items-center gap-1.5"><User className="w-4 h-4 text-purple-400" /> {patient.gender}</span>
            </div>
          </div>

          {/* Right Side: Elegant Info Cards with Editable Fields */}
          <div className="flex-1 grid grid-cols-2 md:grid-cols-3 gap-4">
            {/* Height Card */}
            <div className="flex items-center gap-4 bg-white border border-gray-100 p-4 rounded-[14px] shadow-sm hover:shadow-md transition-shadow">
              <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 bg-blue-50 text-blue-500">
                <Activity className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <p className="text-[11px] uppercase tracking-wider font-semibold text-gray-400">Height</p>
                <div className="flex items-center gap-1 mt-0.5">
                  <input
                    type="number"
                    value={height}
                    onChange={e => setHeight(e.target.value === "" ? "" : Number(e.target.value))}
                    className="w-16 bg-transparent font-bold text-gray-800 text-[15px] focus:outline-none focus:border-indigo-500 border-b border-transparent focus:ring-0 p-0"
                    placeholder="—"
                  />
                  <span className="text-[13px] font-semibold text-gray-500">cm</span>
                </div>
              </div>
            </div>

            {/* Weight Card */}
            <div className="flex items-center gap-4 bg-white border border-gray-100 p-4 rounded-[14px] shadow-sm hover:shadow-md transition-shadow">
              <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 bg-emerald-50 text-emerald-500">
                <Weight className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <p className="text-[11px] uppercase tracking-wider font-semibold text-gray-400">Weight</p>
                <div className="flex items-center gap-1 mt-0.5">
                  <input
                    type="number"
                    value={weight}
                    onChange={e => setWeight(e.target.value === "" ? "" : Number(e.target.value))}
                    className="w-16 bg-transparent font-bold text-gray-800 text-[15px] focus:outline-none focus:border-indigo-500 border-b border-transparent focus:ring-0 p-0"
                    placeholder="—"
                  />
                  <span className="text-[13px] font-semibold text-gray-500">kg</span>
                </div>
              </div>
            </div>

            {/* Blood Group Card */}
            <div className="flex items-center gap-4 bg-white border border-gray-100 p-4 rounded-[14px] shadow-sm hover:shadow-md transition-shadow">
              <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 bg-red-50 text-red-500">
                <Droplets className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <p className="text-[11px] uppercase tracking-wider font-semibold text-gray-400">Blood Group</p>
                <select
                  value={bloodGroup}
                  onChange={e => setBloodGroup(e.target.value)}
                  className="w-full bg-transparent font-bold text-gray-800 text-[15px] focus:outline-none focus:border-indigo-500 border-b border-transparent focus:ring-0 p-0"
                >
                  <option value="">—</option>
                  <option value="A+">A+</option>
                  <option value="A-">A-</option>
                  <option value="B+">B+</option>
                  <option value="B-">B-</option>
                  <option value="AB+">AB+</option>
                  <option value="AB-">AB-</option>
                  <option value="O+">O+</option>
                  <option value="O-">O-</option>
                </select>
              </div>
            </div>

            {/* Contact Card */}
            <div className="flex items-center gap-4 bg-white border border-gray-100 p-4 rounded-[14px] shadow-sm hover:shadow-md transition-shadow">
              <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 bg-indigo-50 text-indigo-500">
                <Phone className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider font-semibold text-gray-400">Contact</p>
                <p className="text-[15px] font-bold text-gray-800 mt-0.5">{patient.phone || "—"}</p>
              </div>
            </div>

            {/* Address Card */}
            <div className="flex items-center gap-4 bg-white border border-gray-100 p-4 rounded-[14px] shadow-sm hover:shadow-md transition-shadow col-span-2 md:col-span-1">
              <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 bg-orange-50 text-orange-500">
                <MapPin className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <p className="text-[11px] uppercase tracking-wider font-semibold text-gray-400">Address</p>
                <input
                  type="text"
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  className="w-full bg-transparent font-bold text-gray-800 text-[15px] focus:outline-none focus:border-indigo-500 border-b border-transparent focus:ring-0 p-0"
                  placeholder="Enter address"
                />
              </div>
            </div>
          </div>
        </div>
        <SectionCard title="Consultation Details" icon={Stethoscope}>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-6 mb-8">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Visit Reason</label>
              <input
                type="text"
                placeholder="e.g. Follow up"
                value={visitReason} onChange={e => setVisitReason(e.target.value)}
                className="w-full bg-[#F8FAFC] border border-gray-200 rounded-[12px] px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 outline-none transition-all shadow-sm"
              />
            </div>

            <div className="lg:col-span-2">
              <label className="block text-sm font-semibold text-gray-700 mb-2">Detailed Reasons <span className="text-gray-400 font-normal text-xs ml-1">(Press Enter to add)</span></label>
              <div className="flex flex-wrap gap-2 items-center bg-[#F8FAFC] border border-gray-200 rounded-[12px] px-3 py-2 min-h-[48px] focus-within:ring-2 focus-within:ring-indigo-100 focus-within:border-indigo-400 transition-all shadow-sm">
                {chiefComplaints.map(c => (
                  <span key={c} className="flex items-center gap-1.5 bg-white border border-gray-200 text-gray-700 px-3 py-1.5 rounded-lg text-xs font-semibold shadow-sm">
                    {c}
                    <button onClick={() => removeComplaint(c)} className="text-gray-400 hover:text-red-500 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                  </span>
                ))}
                <input
                  type="text"
                  value={complaintInput}
                  onChange={e => setComplaintInput(e.target.value)}
                  onKeyDown={addComplaint}
                  className="flex-1 min-w-[150px] outline-none text-sm bg-transparent px-2"
                  placeholder="e.g. Joint pain, Headaches..."
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Previous History</label>
              <input
                type="text"
                placeholder="e.g. Hypertension"
                value={previousHistory} onChange={e => setPreviousHistory(e.target.value)}
                className="w-full bg-[#F8FAFC] border border-gray-200 rounded-[12px] px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 outline-none transition-all shadow-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Previous Calls</label>
              <input
                type="text"
                placeholder="e.g. 12 June 2026"
                value={previousCalls} onChange={e => setPreviousCalls(e.target.value)}
                className="w-full bg-[#F8FAFC] border border-gray-200 rounded-[12px] px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 outline-none transition-all shadow-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">History of Present Illness</label>
            <textarea
              value={presentIllness} onChange={e => setPresentIllness(e.target.value)}
              rows={4}
              placeholder="Detail the progression of symptoms..."
              className="w-full bg-[#F8FAFC] border border-gray-200 rounded-[12px] px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 outline-none transition-all resize-none shadow-sm"
            />
          </div>
        </SectionCard>
        {/* Section 3: Recorded Vitals */}
        <SectionCard title="Recorded Vitals" icon={Activity}>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-6 mb-6">
            {[
              { label: "Systolic BP", key: "bpSys", suffix: "mmHg", val: vitals.bpSys },
              { label: "Diastolic BP", key: "bpDia", suffix: "mmHg", val: vitals.bpDia },
              { label: "Pulse", key: "pulse", suffix: "bpm", val: vitals.pulse },
              { label: "Temp", key: "temp", suffix: "°F", val: vitals.temp },
              { label: "SpO₂", key: "spo2", suffix: "%", val: vitals.spo2 },
              { label: "Weight", key: "weight", suffix: "kg", val: vitals.weight },
              { label: "BMI", key: "bmi", suffix: "", val: vitals.bmi, readOnly: true },
            ].map(v => (
              <div key={v.key}>
                <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">{v.label}</label>
                <div className="relative">
                  <input
                    type="number"
                    readOnly={v.readOnly}
                    value={v.val}
                    onChange={e => {
                      if (v.key === "weight") {
                        handleVitalsWeightChange(e.target.value);
                      } else {
                        setVitals({ ...vitals, [v.key]: e.target.value });
                      }
                    }}
                    className={cn(
                      "w-full bg-[#F8FAFC] border border-gray-200 rounded-[12px] pl-4 pr-12 py-3 text-sm font-semibold outline-none transition-all focus:border-indigo-400 shadow-sm",
                      v.readOnly ? "bg-gray-50 text-gray-500 cursor-not-allowed" : "focus:ring-2 focus:ring-indigo-100 text-gray-900"
                    )}
                  />
                  {v.suffix && <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-medium">{v.suffix}</span>}
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between border-t border-gray-100 pt-5">
            <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 px-4 py-2 rounded-lg border border-gray-100 shadow-sm">
              <History className="w-4 h-4 text-gray-400" />
              <span>Last Recorded: <span className="font-semibold text-gray-700">{latestVitals.date}</span></span>
            </div>
          </div>
        </SectionCard>

        {/* Section 5: Unified Prescription Card */}
        <SectionCard title="Prescription & Notes" icon={Syringe}>
          <label className="mb-4 flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200 bg-[#F8FAFC] px-4 py-3">
            <input
              type="checkbox"
              checked={noPrescription}
              onChange={(e) => setNoPrescription(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-indigo-600"
            />
            <span>
              <span className="block text-sm font-semibold text-gray-800">No prescription needed</span>
              <span className="block text-xs text-gray-500">Complete this consultation with advice and notes only — no medicines.</span>
            </span>
          </label>

          {!noPrescription && (
          <div className="bg-white border border-gray-200 rounded-[16px] overflow-hidden shadow-sm mb-6">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50/80 border-b border-gray-200 text-[11px] text-gray-500 uppercase tracking-wider font-bold">
                    <th className="px-4 py-3 min-w-[220px] w-1/4">Medicine Name</th>
                    <th className="px-2 py-3 min-w-[110px]">Form</th>
                    <th className="px-2 py-3 min-w-[100px]">Dose</th>
                    <th className="px-2 py-3 min-w-[160px]">Frequency</th>
                    <th className="px-2 py-3 min-w-[140px]">Timing</th>
                    <th className="px-2 py-3 min-w-[100px]">Duration</th>
                    <th className="px-4 py-3 min-w-[200px] w-1/5">Instructions</th>
                    <th className="px-4 py-3 text-center w-12"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-[#F8FAFC]">
                  {medicines.map((med) => (
                    <tr key={med.id} className="group hover:bg-white transition-colors">
                      <td className="px-4 py-3">
                        <MedicineNameCell name={med.name} onSelect={(medicine) => handleMedicineSelect(med.id, medicine)} />
                      </td>
                      <td className="px-2 py-3">
                        <select
                          value={med.form} onChange={e => handleMedicineChange(med.id, 'form', e.target.value)}
                          className="w-full bg-white border border-gray-200 rounded-[8px] px-2 py-2 text-sm focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 outline-none shadow-sm transition-all"
                        >
                          <option>Tablet</option><option>Churna</option><option>Kashayam</option><option>Taila</option><option>Capsule</option><option>Syrup</option><option>Others</option>
                        </select>
                      </td>
                      <td className="px-2 py-3">
                        <input
                          type="text" placeholder="e.g. 10ml" value={med.dose} onChange={e => handleMedicineChange(med.id, 'dose', e.target.value)}
                          className="w-full bg-white border border-gray-200 rounded-[8px] px-2 py-2 text-sm focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 outline-none shadow-sm transition-all"
                        />
                      </td>

                      <td className="px-2 py-3">
                        <select
                          value={med.frequency || "Morning"} onChange={e => handleMedicineChange(med.id, 'frequency', e.target.value)}
                          className="w-full bg-white border border-gray-200 rounded-[8px] px-2 py-2 text-sm focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 outline-none shadow-sm transition-all"
                        >
                          <option>Morning</option>
                          <option>Afternoon</option>
                          <option>Evening</option>
                          <option>Night</option>
                          <option>Morning & Night</option>
                          <option>Morning, Aft, Night</option>
                        </select>
                      </td>

                      <td className="px-2 py-3">
                        <select
                          value={med.timing} onChange={e => handleMedicineChange(med.id, 'timing', e.target.value)}
                          className="w-full bg-white border border-gray-200 rounded-[8px] px-2 py-2 text-sm focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 outline-none shadow-sm transition-all"
                        >
                          <option>Before Food</option><option>After Food</option><option>Empty Stomach</option>
                        </select>
                      </td>
                      <td className="px-2 py-3">
                        <input
                          type="text" placeholder="15 Days" value={med.duration} onChange={e => handleMedicineChange(med.id, 'duration', e.target.value)}
                          className="w-full bg-white border border-gray-200 rounded-[8px] px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 outline-none shadow-sm transition-all"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="text" placeholder="With warm water" value={med.instructions} onChange={e => handleMedicineChange(med.id, 'instructions', e.target.value)}
                          className="w-full bg-white border border-gray-200 rounded-[8px] px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 outline-none shadow-sm transition-all"
                        />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button onClick={() => handleRemoveMedicine(med.id)} className="p-2 text-gray-400 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 rounded-lg hover:bg-red-50">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="bg-white border-t border-gray-200 px-4 py-4 flex items-center justify-between">
              <button onClick={handleAddMedicine} className="flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:text-indigo-800 transition-colors bg-indigo-50/50 hover:bg-indigo-50 px-5 py-2.5 rounded-xl border border-indigo-100">
                <Plus className="w-4 h-4" /> Add Medicine
              </button>
            </div>
          </div>
          )}

          {/* Unified Prescription Notes Area inside the same card */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2"><FileText className="w-4 h-4 text-gray-400" /> Additional Instructions & Notes</label>
            <div className="border border-gray-200 rounded-[16px] overflow-hidden bg-white focus-within:ring-2 focus-within:ring-indigo-100 focus-within:border-indigo-400 transition-all shadow-sm">
              <div className="bg-[#F8FAFC] border-b border-gray-200 px-5 py-3 flex items-center gap-2">
                <button type="button" onClick={() => handleFormat('bold')} className="p-1.5 text-gray-600 hover:bg-white hover:text-gray-900 rounded-[8px] hover:shadow-sm font-serif font-bold w-8 h-8 flex items-center justify-center text-sm border border-transparent hover:border-gray-200 transition-all">B</button>
                <button type="button" onClick={() => handleFormat('italic')} className="p-1.5 text-gray-600 hover:bg-white hover:text-gray-900 rounded-[8px] hover:shadow-sm font-serif italic w-8 h-8 flex items-center justify-center text-sm border border-transparent hover:border-gray-200 transition-all">I</button>
                <button type="button" onClick={() => handleFormat('underline')} className="p-1.5 text-gray-600 hover:bg-white hover:text-gray-900 rounded-[8px] hover:shadow-sm font-serif underline w-8 h-8 flex items-center justify-center text-sm border border-transparent hover:border-gray-200 transition-all">U</button>
                <div className="w-px h-5 bg-gray-300 mx-2"></div>
                <button type="button" onClick={() => handleFormat('insertUnorderedList')} className="p-1.5 text-gray-600 hover:bg-white hover:text-gray-900 rounded-[8px] hover:shadow-sm font-serif w-8 h-8 flex items-center justify-center text-sm border border-transparent hover:border-gray-200 transition-all">≡</button>
                <button type="button" onClick={() => handleFormat('insertOrderedList')} className="p-1.5 text-gray-600 hover:bg-white hover:text-gray-900 rounded-[8px] hover:shadow-sm font-serif w-8 h-8 flex items-center justify-center text-sm border border-transparent hover:border-gray-200 transition-all">1.</button>
              </div>
              <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                onBlur={(e) => setPrescriptionNotes(e.currentTarget.innerHTML)}
                className="w-full px-6 py-5 text-sm outline-none resize-none leading-relaxed text-gray-700 min-h-[150px] [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mb-1"
              >
                <ul>
                  <li>Continue medicines regularly.</li>
                  <li>Take with warm water.</li>
                  <li>Follow prescribed diet.</li>
                  <li>Return after 15 days.</li>
                </ul>
              </div>
            </div>
          </div>
        </SectionCard>

        {/* Section 6: Upload Reports */}
        <SectionCard title="Upload Reports" icon={FileUp}>
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-indigo-200 bg-indigo-50/30 hover:bg-indigo-50/80 hover:border-indigo-300 transition-all rounded-[16px] p-10 flex flex-col items-center justify-center text-center cursor-pointer group"
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="hidden"
              multiple
              accept=".pdf,.jpg,.jpeg,.png"
            />
            <div className="w-14 h-14 bg-white rounded-full flex items-center justify-center shadow-sm border border-indigo-100 mb-4 group-hover:-translate-y-1 transition-transform">
              <FileUp className="w-6 h-6 text-indigo-500" />
            </div>
            <p className="text-base font-semibold text-indigo-900 mb-1">Click to upload or drag and drop</p>
            <p className="text-sm text-indigo-400 mb-5 font-medium">PDF, JPG, PNG (Max 5MB)</p>
            <button type="button" className="bg-white border border-gray-200 shadow-sm text-gray-700 text-sm font-bold px-6 py-2.5 rounded-[12px] hover:border-gray-300 hover:bg-gray-50 transition-all pointer-events-none">
              Browse Files
            </button>
          </div>

          {/* List of files to be uploaded */}
          {uploadedFiles.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Files to Upload:</p>
              {uploadedFiles.map((file, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 bg-indigo-50/50 border border-indigo-100 rounded-xl">
                  <span className="text-xs text-indigo-700 font-semibold">{file.name} ({(file.size / (1024 * 1024)).toFixed(2)} MB)</span>
                  <button type="button" onClick={(e) => { e.stopPropagation(); handleRemoveFile(idx); }} className="text-rose-500 hover:text-rose-700 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Previously Uploaded Reports */}
          {(intakeData?.visits?.[0] as any)?.attachments && (intakeData.visits[0] as any).attachments.length > 0 && (
            <div className="mt-6 space-y-2 border-t border-gray-100 pt-4">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Previously Uploaded Reports:</p>
              {(intakeData.visits[0] as any).attachments.map((file: any) => (
                <div key={file.id} className="flex items-center justify-between p-3 bg-gray-50 border border-gray-100 rounded-xl">
                  <span className="text-xs text-gray-700 font-semibold">{file.file_name}</span>
                  <a href={file.file_url} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:text-indigo-800 text-xs font-semibold">
                    View File
                  </a>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {/* Section 7: Follow-up & Notes */}
        <SectionCard title="Follow-up & Notes" icon={Clock}>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Follow-up Instructions</label>
            <input
              type="text"
              placeholder="e.g. Return after 15 days, empty stomach"
              value={followUpInstructions} onChange={e => setFollowUpInstructions(e.target.value)}
              className="w-full bg-[#F8FAFC] border border-gray-200 rounded-[12px] px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 outline-none transition-all shadow-sm"
            />
          </div>

          <div className="mt-5 border-t border-gray-100 pt-5">
            <button
              onClick={() => setIsUpcomingVisible(!isUpcomingVisible)}
              className="flex items-center gap-2 bg-indigo-50/50 hover:bg-indigo-50 text-indigo-600 border border-indigo-100 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all mb-4"
            >
              <Calendar className="w-3.5 h-3.5" />
              {isUpcomingVisible ? "Hide Upcoming Call" : "Show Upcoming Call"}
            </button>

            {isUpcomingVisible && (
              <div className="bg-gray-50/50 p-5 rounded-xl border border-gray-100 space-y-4">
                <h4 className="text-sm font-bold text-gray-800">Patient Availability & Slot Booking</h4>

                {/* Selected Slot Information */}
                {upcomingCallDate && upcomingCallTime ? (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-emerald-50 border border-emerald-100 rounded-xl">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-600">
                        <Calendar className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-emerald-800">Selected Scheduled Slot</p>
                        <p className="text-xs text-emerald-700 font-semibold mt-0.5">
                          {new Date(upcomingCallDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} at {upcomingCallTime} ({upcomingCallMode === 'video' ? '📹 Video' : '🏥 Clinic'})
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {followUpAppointmentId ? (
                        <span className="px-4 py-1.5 bg-emerald-100 text-emerald-700 rounded-lg text-xs font-bold flex items-center gap-1.5">
                          ✓ Scheduled
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={isBookingFollowUp || !upcomingCallSlotId}
                          onClick={async () => {
                            if (!upcomingCallSlotId || !id) return;

                            setIsBookingFollowUp(true);

                            try {
                              const response = await apiClient<{ data: { id: string } }>(
                                "/api/appointments?action=book-follow-up",
                                {
                                  method: "POST",
                                  body: JSON.stringify({
                                    patientId: id,
                                    slotId: upcomingCallSlotId,
                                    mode: upcomingCallMode,
                                    reasonForVisit: followUpInstructions || undefined,
                                  }),
                                },
                              );

                              setFollowUpAppointmentId(response.data.id);
                              toast.success("Follow-up appointment scheduled");
                            } catch (bookingError) {
                              toast.error(
                                bookingError instanceof Error
                                  ? bookingError.message
                                  : "Unable to schedule the follow-up appointment",
                              );
                            } finally {
                              setIsBookingFollowUp(false);
                            }
                          }}
                          className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
                        >
                          <Calendar className="w-3.5 h-3.5" />
                          {isBookingFollowUp ? "Scheduling…" : "Schedule Follow-up"}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setUpcomingCallDate("");
                          setUpcomingCallTime("");
                          setUpcomingCallSlotId("");
                          setFollowUpAppointmentId("");
                          setShowCalendarPanel(false);
                        }}
                        className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 rounded-lg text-xs font-bold transition-all shadow-sm cursor-pointer flex items-center gap-1.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Clear
                      </button>
                      {!followUpAppointmentId && (
                        <button
                          type="button"
                          onClick={() => setShowCalendarPanel(!showCalendarPanel)}
                          className="px-3 py-1.5 bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 rounded-lg text-xs font-bold transition-all shadow-sm cursor-pointer"
                        >
                          {showCalendarPanel ? "Close Calendar" : "Change Date/Slot"}
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowCalendarPanel(!showCalendarPanel)}
                    className="w-full flex items-center justify-center gap-2 py-3 bg-white hover:bg-gray-50 border border-gray-200 border-dashed rounded-xl text-xs font-bold text-gray-600 transition-all cursor-pointer shadow-sm"
                  >
                    <Calendar className="w-4 h-4 text-indigo-500" />
                    <span>{showCalendarPanel ? "Close Calendar" : "Select Date & Slot"}</span>
                  </button>
                )}

                {/* Calendar Panel Drawout Card */}
                {showCalendarPanel && (
                  <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm space-y-4">
                    <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                      <span className="text-xs font-bold text-gray-700">Select Date & Time Slot</span>
                      <button
                        type="button"
                        onClick={() => setShowCalendarPanel(false)}
                        className="text-xs font-bold text-gray-400 hover:text-gray-600 transition-colors"
                      >
                        Close
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-4">
                      {/* Left: Custom Monthly Calendar */}
                      <div className="border border-gray-100 rounded-xl p-3.5 space-y-3 bg-gray-50/50">
                        <div className="flex items-center justify-between gap-2 select-none">
                          <span className="text-xs font-bold text-gray-700 font-display">{monthName}</span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={prevMonth}
                              className="p-1 rounded-md border border-gray-200 bg-white hover:bg-gray-50 transition-all disabled:opacity-40"
                              disabled={calendarYear === new Date().getFullYear() && calendarMonth === new Date().getMonth()}
                            >
                              <ChevronRight size={14} className="rotate-180 text-gray-600" />
                            </button>
                            <button
                              type="button"
                              onClick={nextMonth}
                              className="p-1 rounded-md border border-gray-200 bg-white hover:bg-gray-50 transition-all"
                            >
                              <ChevronRight size={14} className="text-gray-600" />
                            </button>
                          </div>
                        </div>

                        {/* Calendar Header */}
                        <div className="grid grid-cols-7 gap-1 text-center text-[9px] font-extrabold text-gray-400 uppercase tracking-widest">
                          <span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span><span>S</span>
                        </div>

                        {/* Days Grid */}
                        <div className="grid grid-cols-7 gap-1 text-center">
                          {calendarDays.map((d, index) => {
                            if (d === null) return <div key={`empty-${index}`} className="aspect-square" />;
                            const isAvailable = rawAvailableDates?.includes(d.dateStr);
                            const isSelected = selectedDate === d.dateStr;
                            const isToday = d.dateStr === new Date().toISOString().split("T")[0];

                            return (
                              <button
                                key={d.dateStr}
                                type="button"
                                disabled={!isAvailable}
                                onClick={() => {
                                  setSelectedCalendarDate(d.dateStr);
                                }}
                                className={cn(
                                  "aspect-square flex flex-col items-center justify-center text-xs rounded-lg font-bold transition-all relative cursor-pointer",
                                  isSelected
                                    ? "bg-indigo-600 text-white shadow-sm scale-103"
                                    : isAvailable
                                      ? "hover:bg-indigo-50 border border-gray-200 hover:border-indigo-200 text-gray-800 bg-white"
                                      : "text-gray-300 cursor-not-allowed opacity-30",
                                  isToday && !isSelected && "border-indigo-300 text-indigo-600 bg-indigo-50"
                                )}
                              >
                                <span>{d.day}</span>
                                {isAvailable && !isSelected && (
                                  <span className="absolute bottom-1 w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Right: Available Slots List */}
                      <div className="flex flex-col justify-start">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Available Slots for {selectedDate}</span>
                        {slotsLoading ? (
                          <div className="text-center text-xs text-gray-500 py-8">
                            <div className="w-5 h-5 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin mx-auto mb-2" />
                            Loading slots...
                          </div>
                        ) : slots.length === 0 ? (
                          <div className="text-center text-xs text-amber-600 bg-amber-50 rounded-xl p-4 border border-amber-100 font-semibold leading-relaxed">
                            ⚠️ No available slots found on this date.
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-[220px] overflow-y-auto pr-1">
                            {slots.map((slot) => {
                              const slotModes: ("video" | "clinic")[] = slot.modes || (slot.mode ? [slot.mode] : []);
                              const hasVideo = slotModes.includes("video");
                              const hasClinic = slotModes.includes("clinic");
                              const isBoth = hasVideo && hasClinic;

                              const isSelected = upcomingCallDate === selectedDate && upcomingCallTime === slot.startTime;

                              return (
                                <button
                                  key={slot.id}
                                  type="button"
                                  onClick={() => {
                                    setUpcomingCallDate(selectedDate);
                                    setUpcomingCallTime(slot.startTime);
                                    setUpcomingCallSlotId(slot.id);
                                    setUpcomingCallMode(slotModes[0]);
                                    setFollowUpAppointmentId("");
                                    setShowCalendarPanel(false);
                                  }}
                                  className={cn(
                                    "text-xs px-3 py-2.5 rounded-xl border transition-all duration-200 cursor-pointer active:scale-95 text-center flex flex-col items-center justify-center gap-1",
                                    isSelected
                                      ? "bg-indigo-600 text-white border-indigo-600 font-bold shadow-sm"
                                      : isBoth
                                        ? "bg-purple-50 hover:bg-purple-100 border-purple-200 text-purple-850 font-bold"
                                        : hasVideo
                                          ? "bg-emerald-50 hover:bg-emerald-100 border-emerald-100 text-emerald-800 font-bold"
                                          : "bg-amber-50 hover:bg-amber-100 border-amber-200 text-amber-800 font-bold"
                                  )}
                                >
                                  <span className="font-mono text-center">{slot.startTime}</span>
                                  <span className="text-[8px] opacity-75 font-semibold">
                                    {isBoth ? "Video/Clinic" : hasVideo ? "Video" : "Clinic"}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>

                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </SectionCard>

        {/* Payment Method */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
          <h4 className="text-sm font-bold text-gray-800 mb-4">Payment Method</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-xl border-2 cursor-pointer transition-all",
                paymentMethod === "cash"
                  ? "border-indigo-500 bg-indigo-50"
                  : "border-gray-200 hover:border-gray-300"
              )}
            >
              <input
                type="radio"
                name="paymentMethod"
                value="cash"
                checked={paymentMethod === "cash"}
                onChange={() => setPaymentMethod("cash")}
                className="w-4 h-4 accent-indigo-600"
              />
              <Banknote className={cn("w-4 h-4", paymentMethod === "cash" ? "text-indigo-600" : "text-gray-400")} />
              <span className={cn("text-sm font-semibold", paymentMethod === "cash" ? "text-indigo-700" : "text-gray-700")}>
                Payment via Cash
              </span>
            </label>

            <label
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-xl border-2 cursor-pointer transition-all",
                paymentMethod === "online"
                  ? "border-indigo-500 bg-indigo-50"
                  : "border-gray-200 hover:border-gray-300"
              )}
            >
              <input
                type="radio"
                name="paymentMethod"
                value="online"
                checked={paymentMethod === "online"}
                onChange={() => setPaymentMethod("online")}
                className="w-4 h-4 accent-indigo-600"
              />
              <Wallet className={cn("w-4 h-4", paymentMethod === "online" ? "text-indigo-600" : "text-gray-400")} />
              <span className={cn("text-sm font-semibold", paymentMethod === "online" ? "text-indigo-700" : "text-gray-700")}>
                Payment via Online
              </span>
            </label>
          </div>
        </div>

        {/* Final Section: Save Consultation (Bottom scrolling position, not sticky) */}
        <div className="flex justify-end gap-3 pt-4 pb-12">
          <button className="flex items-center justify-center gap-2 bg-white hover:bg-gray-50 text-gray-700 font-semibold text-sm px-5 py-2.5 rounded-xl border border-gray-200 shadow-sm transition-all min-w-[120px]">
            Save Draft
          </button>

          {!isSaved ? (
            <button
              onClick={handleSaveConsultation}
              disabled={isSaving}
              className="flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-semibold text-sm px-6 py-2.5 rounded-xl shadow-[0_4px_12px_rgb(79,70,229,0.25)] hover:shadow-[0_6px_16px_rgb(79,70,229,0.35)] hover:-translate-y-0.5 transition-all min-w-[180px]"
            >
              <Save className="w-4 h-4" />
              {isSaving ? "Saving..." : "Save Consultation"}
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold text-emerald-600 flex items-center gap-1.5 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-100 shadow-sm">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                Saved Successfully
              </span>
              <button
                onClick={async () => {
                  await setNavContext("prescriptions", { patientId: patient?.id || id });
                  router.push("/pro/prescriptions");
                }}
                className="flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-semibold text-sm px-6 py-2.5 rounded-xl shadow-[0_4px_12px_rgb(16,185,129,0.25)] hover:shadow-[0_6px_16px_rgb(16,185,129,0.35)] hover:-translate-y-0.5 transition-all min-w-[180px]"
              >
                <FileText className="w-4 h-4" />
                View Details
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}