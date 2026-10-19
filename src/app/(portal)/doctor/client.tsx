"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { HPRBadge } from "@/components/Badges";
import { getNavContext } from "@/lib/nav-context-client";
import { useQuery } from "@/hooks/useQuery";
import { apiClient } from "@/shared/api/api-client";
import { useNewDoctorProfile } from "@/hooks/use-new-doctor";
import { usePractitioner } from "@/hooks/use-discover";
import { usePractitionerSlots, usePractitionerAvailableDates } from "@/hooks/use-availability";
import { useAppointments } from "@/hooks/use-appointments";
import { useFavorites } from "@/hooks/use-favorites";
import { useAuth } from "@/contexts/auth-context";
import { formatCurrency, cn } from "@/lib/utils";
import { toast } from "react-hot-toast";

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
import {
  ShieldCheck,
  Award,
  Languages,
  MapPin,
  ChevronRight,
  ArrowLeft,
  Briefcase,
  Building,
  Calendar,
  Check,
  Heart,
  CloudSun,
  Sun,
  Moon
} from "lucide-react";

function getPeriod(timeStr: string): "Morning" | "Afternoon" | "Evening" {
  const isPM = timeStr.toLowerCase().includes("pm");
  const hour = parseInt(timeStr.split(":")[0]);
  if (!isPM) {
    return "Morning";
  } else {
    if (hour === 12 || hour < 4) {
      return "Afternoon";
    }
    return "Evening";
  }
}

/**
 * Reliably parses a backend-formatted time string like "9:50 AM" or "12:05 PM"
 * combined with a YYYY-MM-DD date string into a local Date object.
 * `new Date("YYYY-MM-DD H:MM AM")` is non-standard and returns NaN in many
 * environments, so we parse manually instead.
 */
function parseSlotDateTime(dateStr: string, timeStr: string): Date | null {
  const match = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return null;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const period = match[3].toUpperCase();
  if (period === "PM" && hours !== 12) hours += 12;
  if (period === "AM" && hours === 12) hours = 0;
  const [year, month, day] = dateStr.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day, hours, minutes, 0, 0);
}

const disciplineStyles: Record<string, { bg: string; text: string; border: string; gradient: string }> = {
  Ayurveda: {
    bg: "bg-emerald-50 text-emerald-800 border-emerald-100",
    text: "text-emerald-700",
    border: "border-emerald-150",
    gradient: "from-emerald-500 to-teal-600",
  },
  Yoga: {
    bg: "bg-teal-50 text-teal-800 border-teal-100",
    text: "text-teal-700",
    border: "border-teal-150",
    gradient: "from-teal-500 to-cyan-600",
  },
  Naturopathy: {
    bg: "bg-amber-50 text-amber-850 border-amber-100",
    text: "text-amber-800",
    border: "border-amber-150",
    gradient: "from-amber-500 to-orange-500",
  },
  Unani: {
    bg: "bg-orange-50 text-orange-850 border-orange-100",
    text: "text-orange-800",
    border: "border-orange-150",
    gradient: "from-orange-500 to-red-500",
  },
  Siddha: {
    bg: "bg-purple-50 text-purple-800 border-purple-100",
    text: "text-purple-700",
    border: "border-purple-150",
    gradient: "from-purple-500 to-indigo-600",
  },
  Homeopathy: {
    bg: "bg-blue-50 text-blue-800 border-blue-100",
    text: "text-blue-700",
    border: "border-blue-150",
    gradient: "from-blue-500 to-indigo-600",
  },
};

export default function DoctorProfileClient() {
  const router = useRouter();
  const { user } = useAuth();
  const { favoriteIds, toggleFavorite } = useFavorites(user?.id);

  const [navContext, setNavContextState] = useState<{ doctorId: string } | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    getNavContext<{ doctorId: string }>("doctor").then((result) => {
      if (!cancelled) setNavContextState(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (navContext === null) {
      router.replace("/discover");
    }
  }, [navContext, router]);

  const id = navContext?.doctorId ?? "";

  // Persists the selected doctor/slot/date/mode server-side (short-lived
  // signed cookie) instead of carrying those identifiers in the URL, then
  // navigates to a clean /booking route.
  async function goToBooking(selection: {
    doctorId: string;
    slotId: string;
    slot: string;
    date: string;
    mode: "video" | "clinic";
    availableModes: ("video" | "clinic")[];
  }) {
    try {
      await apiClient("/api/booking/draft", {
        method: "POST",
        body: JSON.stringify(selection),
      });
      router.push("/booking");
    } catch (error) {
      console.error("Failed to start booking:", error);
      toast.error("Please sign in to book this slot");
    }
  }

  // Fetch current patient's appointments to detect their booked slots
  const { data: myAppointments } = useAppointments(user?.id);

  // Fetch legacy doctor
  const { data: legacyDoc, loading: legacyDocLoading } = usePractitioner(id);

  // Fetch new doctor profile
  const { data: newDoc, loading: newDocLoading } = useNewDoctorProfile(id);

  const isLegacy = !!legacyDoc;

  // Resolve Doctor summary
  const doctor = legacyDoc
    ? legacyDoc
    : newDoc
    ? {
        id: newDoc.id,
        name: newDoc.full_name,
        specialty: newDoc.specializations?.[0] || "Ayurveda",
        specialties: newDoc.specializations || [],
        rating: 4.9,
        reviews: 1284,
        experience: 15,
        location: "Online",
        isVerified: true,
        fee: Math.round((newDoc.consultation_fee ?? 0) / 100),
        nextAvailable: "Today",
        languages: newDoc.languages || ["English", "Hindi", "Kannada"],
        about: `${newDoc.full_name} is a dedicated AYUSH practitioner specializing in Classical Ayurveda.`,
        qualifications: ["BAMS", "MD Ayurveda", "PG Panchakarma"],
        hprId: newDoc.verifications?.[0]?.hpr_id || "HPR-4902-8822",
        avatar: newDoc.full_name?.split(" ").filter(Boolean).map((n: string) => n[0]).join("").slice(0, 2).toUpperCase() || "DA",
        isNewDoctor: true,
        discipline: "Ayurveda",
      }
    : null;

  const wishlisted = !!doctor?.id && favoriteIds.has(doctor.id);

  const style = doctor
    ? disciplineStyles[doctor.discipline] || {
        bg: "bg-neutral-50 text-neutral-850 border-neutral-200",
        text: "text-neutral-700",
        border: "border-neutral-200",
        gradient: "from-neutral-500 to-neutral-600",
      }
    : { bg: "", text: "", border: "", gradient: "" };

  const [selectedDateState, setSelectedDateState] = useState("");
  const [selectedSlot, setSelectedSlot] = useState<{ id: string; startTime: string; timeValue: string; modes: ("video" | "clinic")[]; } | null>(null);
  const [isStartingBooking, setIsStartingBooking] = useState(false);

  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());

  // Live clock — refreshes every 60 s so past slots auto-disappear
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  // Available dates queries — keyed by the resolved practitioner UUID, not
  // the route's public slug.
  const { data: legacyDates, loading: legacyDatesLoading } = usePractitionerAvailableDates(doctor?.id);
  const { data: newDates, loading: newDatesLoading } = useNewDoctorAvailableDates(doctor?.id);

  const rawAvailableDates = isLegacy ? legacyDates : newDates;
  const datesLoading = isLegacy ? legacyDatesLoading : newDatesLoading;

  const selectedDate = selectedDateState || rawAvailableDates?.[0] || "";

  const calendarDays = useMemo(() => {
    const firstDay = new Date(currentYear, currentMonth, 1);
    let startDayOfWeek = firstDay.getDay();
    // Monday = 0, ..., Sunday = 6
    startDayOfWeek = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;

    const totalDays = new Date(currentYear, currentMonth + 1, 0).getDate();

    const days = [];
    for (let i = 0; i < startDayOfWeek; i++) {
      days.push(null);
    }

    for (let day = 1; day <= totalDays; day++) {
      const yearStr = currentYear;
      const monthStr = String(currentMonth + 1).padStart(2, "0");
      const dayStr = String(day).padStart(2, "0");
      const dateStr = `${yearStr}-${monthStr}-${dayStr}`;

      days.push({
        day,
        dateStr,
      });
    }

    return days;
  }, [currentMonth, currentYear]);

  const monthName = new Date(currentYear, currentMonth).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric"
  });

  const nextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };

  const prevMonth = () => {
    const today = new Date();
    if (currentYear > today.getFullYear() || (currentYear === today.getFullYear() && currentMonth > today.getMonth())) {
      if (currentMonth === 0) {
        setCurrentMonth(11);
        setCurrentYear(currentYear - 1);
      } else {
        setCurrentMonth(currentMonth - 1);
      }
    }
  };

  // Fetch slots and reviews dynamically — keyed by the resolved
  // practitioner UUID, not the route's public slug.
  const legacySlotsQuery = usePractitionerSlots(doctor?.id, selectedDate);
  const newSlotsQuery = useNewDoctorSlots(doctor?.id, selectedDate);

  // Deduplicate legacy slots by startTime as well (safety)
  const rawSlots = isLegacy ? (legacySlotsQuery.data ?? []) : (newSlotsQuery.data ?? []);
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
  const slots = Array.from(slotMap.values());
  const slotsLoading = isLegacy ? legacySlotsQuery.loading : newSlotsQuery.loading;

  // Derive the current patient's booked slot for this doctor + selected date
  // Must be declared BEFORE any early returns to satisfy Rules of Hooks.
  const myBookedSlotForThisDate = useMemo(() => {
    if (!myAppointments || !selectedDate || !doctor?.id) return null;
    return myAppointments.find((appt) => {
      const isSameDoctor = appt.practitionerId === doctor.id;
      const isSameDate = appt.dateRaw === selectedDate;
      const isActive = appt.status === "upcoming";
      return isSameDoctor && isSameDate && isActive;
    }) ?? null;
  }, [myAppointments, selectedDate, doctor?.id]);

  if (legacyDocLoading && newDocLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="w-10 h-10 rounded-full border-3 border-herb-green border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!doctor) {
    return (
      <div className="text-center py-20 bg-white rounded-3xl border border-neutral-150 shadow-sm max-w-md mx-auto my-12 space-y-4">
        <span className="text-6xl inline-block animate-bounce">🌿</span>
        <h3 className="text-base font-black text-foreground">Practitioner Not Found</h3>
        <p className="text-xs text-muted-foreground leading-relaxed max-w-xs mx-auto">
          We couldn&apos;t find this healthcare practitioner in our registry database.
        </p>
        <Link href="/discover" className="inline-block mt-2">
          <button className="px-5 py-2.5 bg-herb-green hover:bg-herb-green-light active:scale-95 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer">
            Back to Discover
          </button>
        </Link>
      </div>
    );
  }

  // Filter out slots whose time has already passed (runs live every 60 s)
  const validSlots = slots.filter(slot => {
    const slotTimeStr = slot.timeValue || slot.startTime;
    const slotDateTime = parseSlotDateTime(selectedDate, slotTimeStr);
    if (slotDateTime) {
      return slotDateTime.getTime() > now.getTime();
    }
    // If we can't parse the time, keep the slot visible (safe default)
    return true;
  });


  // Group slots by Morning, Afternoon, Evening
  const groupedSlots: Record<"Morning" | "Afternoon" | "Evening", typeof validSlots> = {
    Morning: [],
    Afternoon: [],
    Evening: [],
  };

  validSlots.forEach((slot) => {
    const period = getPeriod(slot.startTime);
    groupedSlots[period].push(slot);
  });

  const totalSlotsCount = validSlots.length;
  const canBook = selectedSlot !== null;

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 max-w-7xl mx-auto space-y-8">
      
      {/* ─── BREADCRUMB & METADATA ACTIONS ─── */}
      <div className="flex items-center justify-between gap-4 text-xs font-semibold select-none flex-wrap">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/")}
            className="p-1.5 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 active:scale-95 transition-all cursor-pointer text-neutral-600 flex items-center justify-center shadow-sm"
            title="Go Home"
          >
            <ArrowLeft size={14} />
          </button>
          <div className="flex items-center gap-2 text-muted-foreground/80">
            <Link href="/discover" className="hover:text-foreground transition-colors">Discover</Link>
            <ChevronRight size={10} className="stroke-[2.5]" />
            <span className="text-foreground font-bold">{doctor.name}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => doctor?.id && toggleFavorite(doctor.id)}
            className={cn(
              "p-2.5 rounded-xl border transition-all cursor-pointer active:scale-95 flex items-center gap-1.5",
              wishlisted
                ? "border-red-200 bg-red-50 text-red-600"
                : "border-neutral-200 hover:border-red-200 hover:text-red-500 hover:bg-red-50 text-neutral-600"
            )}
            title={wishlisted ? "Remove from Favorites" : "Add to Favorites"}
          >
            <Heart size={14} className={cn("pointer-events-none transition-colors duration-200", wishlisted ? "fill-red-500 text-red-500" : "text-neutral-500")} />
            <span className="hidden sm:inline">Favorites</span>
          </button>
        </div>
      </div>

      {/* ─── PROFILE BODY LAYOUT ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-8 items-start">
        
        {/* LEFT COLUMN: HERO DETAILS & TABS */}
        <div className="space-y-6">
          
          {/* Overhauled Doctor Profile Hero Card */}
          <div className="bg-white rounded-3xl border border-neutral-150/70 p-6.5 shadow-2xs hover:shadow-xs transition-all relative overflow-hidden">
            {/* Glowing aura */}
            <div className="absolute top-0 right-0 w-36 h-36 bg-herb-green/5 rounded-full blur-3xl opacity-0 hover:opacity-100 transition-opacity duration-300 -mr-12 -mt-12 pointer-events-none" />

            <div className="flex flex-col sm:flex-row items-center sm:items-start text-center sm:text-left gap-5 mb-6">
              {/* Profile Image Avatar Grid */}
              <div className="relative flex-shrink-0">
                <div className={cn(
                  "w-22 h-22 rounded-2.5xl bg-gradient-to-br flex items-center justify-center text-white font-extrabold text-2xl font-display shadow-md tracking-wider relative transition-transform duration-300 hover:scale-103",
                  style.gradient
                )}>
                  {doctor.avatar}
                </div>
                
                {/* Live Online status dot indicator */}
                <span className="absolute -bottom-1.5 -right-1.5 w-5 h-5 rounded-full bg-emerald-500 border-3 border-white flex items-center justify-center shadow-md select-none">
                  <span className="w-2.5 h-2.5 rounded-full bg-white animate-ping opacity-75" />
                </span>
              </div>

              {/* Identity details */}
              <div className="flex-1 min-w-0 space-y-2">
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2.5">
                  <h1 className="font-display text-2xl font-black text-foreground tracking-tight leading-none">
                    {doctor.name}
                  </h1>
                  {doctor.isVerified && (
                    <span className="inline-flex items-center gap-0.5 text-[9px] font-extrabold uppercase tracking-widest bg-emerald-500/5 text-emerald-700 px-2.5 py-1 rounded-full border border-emerald-500/15 shadow-3xs leading-none select-none">
                      <ShieldCheck size={10} className="stroke-[2.5]" />
                      HPR Verified
                    </span>
                  )}
                </div>

                <p className="text-xs font-bold text-herb-green uppercase tracking-widest leading-none">
                  {(doctor.specialties && doctor.specialties.length > 0 ? doctor.specialties : [doctor.specialty]).join(" · ")}
                </p>

                <div className="flex items-center justify-center sm:justify-start gap-2 mt-2 flex-wrap select-none">
                  <HPRBadge hprId={doctor.hprId} showId className="shadow-3xs bg-herb-green text-white font-extrabold" />
                </div>

                <div className="flex items-center justify-center sm:justify-start gap-4 mt-2.5 text-xs text-muted-foreground font-semibold flex-wrap">
                  <span className="flex items-center gap-1">
                    <Briefcase size={12} className="text-neutral-400" />
                    <span>{doctor.experience} yrs exp</span>
                  </span>
                  <span className="opacity-40">·</span>
                  <span className="flex items-center gap-1">
                    <MapPin size={12} className="text-neutral-400" />
                    <span>{doctor.location || "Online"}</span>
                  </span>
                </div>
              </div>

              {/* Consultation Fee Callout */}
              <div className="hidden lg:flex flex-col items-end gap-1 flex-shrink-0 select-none bg-neutral-50/50 p-4 border border-neutral-150/70 rounded-2xl">
                <p className="text-[10px] text-muted-foreground uppercase font-extrabold tracking-widest">Consultation Fee</p>
                <p className="font-display text-2xl font-black text-foreground tracking-tight mt-1 leading-none font-mono">
                  {formatCurrency(doctor.fee)}
                </p>
              </div>
            </div>

            {/* Redesigned Info Widgets Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 mt-6 border-t border-neutral-100 pt-5 select-none">
              {/* Stat 1: Experience */}
              <div className="bg-neutral-50/60 border border-neutral-150/50 rounded-2xl p-3 flex items-center gap-3.5 transition-colors hover:bg-neutral-50">
                <div className="w-9 h-9 rounded-xl bg-white border border-neutral-200/60 flex items-center justify-center text-herb-green shadow-3xs flex-shrink-0">
                  <Award size={16} />
                </div>
                <div>
                  <h4 className="text-xs font-extrabold text-foreground">{doctor.experience} Years</h4>
                  <p className="text-[10px] text-muted-foreground leading-none mt-0.5 font-semibold">Clinical Practice</p>
                </div>
              </div>

              {/* Stat 2: Languages */}
              <div className="bg-neutral-50/60 border border-neutral-150/50 rounded-2xl p-3 flex items-center gap-3.5 transition-colors hover:bg-neutral-50">
                <div className="w-9 h-9 rounded-xl bg-white border border-neutral-200/60 flex items-center justify-center text-herb-green shadow-3xs flex-shrink-0">
                  <Languages size={16} />
                </div>
                <div className="min-w-0">
                  <h4 className="text-xs font-extrabold text-foreground truncate" title={doctor.languages.join(", ")}>{doctor.languages.join(", ")}</h4>
                  <p className="text-[10px] text-muted-foreground leading-none mt-0.5 font-semibold">Spoken Languages</p>
                </div>
              </div>
            </div>
          </div>

          {/* Doctor Profile Content */}
          <div className="space-y-4">
            <div className="bg-white rounded-3xl p-6.5 border border-neutral-150/70 shadow-2xs">
              <h3 className="text-[10px] font-extrabold text-muted-foreground/80 uppercase tracking-widest mb-4.5 flex items-center gap-1.5 select-none">
                <Award size={13} className="text-herb-green" />
                Credentials & Qualifications
              </h3>
              <div className="flex flex-wrap gap-2 select-none">
                {doctor.qualifications.map((q) => (
                  <span key={q} className="inline-flex items-center gap-1 text-xs bg-herb-green/5 text-herb-green border border-herb-green/12 px-3 py-2 rounded-xl font-bold shadow-3xs">
                    <Check size={11} className="stroke-[2.5]" />
                    {q}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: SLOT BOOKING SIDEBAR CARD */}
        <div>
          <div className="bg-white rounded-3xl border border-neutral-150 p-5.5 shadow-2xs top-24 sticky hover:shadow-xs transition-shadow duration-300 space-y-5 select-none">
            <h3 className="font-bold text-foreground text-xs uppercase tracking-wider flex items-center gap-1.5">
              <Calendar size={13} className="text-herb-green" />
              Select Date & Slot
            </h3>

            {/* Premium Monthly Calendar Component */}
            {datesLoading ? (
              <div className="text-center w-full py-4 text-xs text-muted-foreground">
                <div className="w-5 h-5 rounded-full border-2 border-herb-green border-t-transparent animate-spin mx-auto mb-2" />
                Loading calendar availability...
              </div>
            ) : !rawAvailableDates || rawAvailableDates.length === 0 ? (
              <div className="text-center w-full py-3 text-xs text-muted-foreground">No available booking dates.</div>
            ) : (
              <div className="bg-neutral-50/50 border border-neutral-150 rounded-2xl p-3.5 space-y-3">
                <div className="flex items-center justify-between gap-2 select-none">
                  <span className="text-xs font-bold text-foreground font-display">{monthName}</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={prevMonth}
                      className="p-1.5 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 active:scale-90 transition-all cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
                      disabled={currentYear === new Date().getFullYear() && currentMonth === new Date().getMonth()}
                    >
                      <ChevronRight size={12} className="rotate-180" />
                    </button>
                    <button
                      onClick={nextMonth}
                      className="p-1.5 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 active:scale-90 transition-all cursor-pointer"
                    >
                      <ChevronRight size={12} />
                    </button>
                  </div>
                </div>

                {/* Days Header */}
                <div className="grid grid-cols-7 gap-1 text-center text-[9px] font-extrabold text-muted-foreground uppercase tracking-widest">
                  <span>M</span>
                  <span>T</span>
                  <span>W</span>
                  <span>T</span>
                  <span>F</span>
                  <span>S</span>
                  <span>S</span>
                </div>

                {/* Days Grid */}
                <div className="grid grid-cols-7 gap-1 text-center">
                  {calendarDays.map((d, index) => {
                    if (d === null) {
                      return <div key={`empty-${index}`} className="aspect-square" />;
                    }

                    const dateAvailable = rawAvailableDates.includes(d.dateStr);
                    const isSelected = selectedDate === d.dateStr;
                    const isToday = d.dateStr === new Date().toISOString().split("T")[0];

                    return (
                      <button
                        key={d.dateStr}
                        disabled={!dateAvailable}
                        onClick={() => {
                          setSelectedDateState(d.dateStr);
                          setSelectedSlot(null);
                        }}
                        className={cn(
                          "aspect-square flex flex-col items-center justify-center text-xs rounded-xl font-bold transition-all relative cursor-pointer active:scale-90",
                          isSelected
                            ? "bg-herb-green text-white shadow-xs scale-103"
                            : dateAvailable
                            ? "hover:bg-herb-green/10 border border-neutral-200 hover:border-herb-green/30 text-foreground"
                            : "text-muted-foreground/45 cursor-not-allowed opacity-35",
                          isToday && !isSelected && "border-herb-green/30 text-herb-green bg-herb-green/5"
                        )}
                      >
                        <span>{d.day}</span>
                        {dateAvailable && !isSelected && (
                          <span className="absolute bottom-1 w-1 h-1 rounded-full bg-emerald-500" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Grouped slots block */}
            <div className="space-y-4">
              {/* My booked slot for this date — always shown at the top if exists */}
              {myBookedSlotForThisDate && (
                <div className="bg-amber-50 border border-amber-300 rounded-2xl p-3 flex items-center gap-2.5 shadow-sm">
                  <div className="w-7 h-7 rounded-lg bg-amber-400/20 flex items-center justify-center flex-shrink-0">
                    <Check size={14} className="text-amber-600" strokeWidth={3} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-extrabold text-amber-800 uppercase tracking-wider">Your Booking</p>
                    <p className="text-xs font-bold text-amber-900 mt-0.5">
                      {myBookedSlotForThisDate.date.split(/ · |, /)[1] || myBookedSlotForThisDate.date.split("T")[0]}
                    </p>
                  </div>
                  <span className="text-[10px] bg-amber-400/30 text-amber-800 font-bold px-2 py-1 rounded-lg border border-amber-300/60 flex-shrink-0">
                    ✓ Confirmed
                  </span>
                </div>
              )}

              {slotsLoading ? (
                <div className="text-center text-xs text-muted-foreground py-8">
                  <div className="w-5 h-5 rounded-full border-2 border-herb-green border-t-transparent animate-spin mx-auto mb-2" />
                  Loading available slots...
                </div>
              ) : totalSlotsCount === 0 && !myBookedSlotForThisDate ? (
                <div className="text-center text-xs text-amber-600 bg-amber-50 rounded-xl p-4 border border-amber-100 font-semibold leading-relaxed">
                  ⚠️ No open consultation slots found on this date.
                </div>
              ) : totalSlotsCount === 0 && myBookedSlotForThisDate ? (
                <div className="text-center text-xs text-muted-foreground bg-neutral-50 rounded-xl p-3 border border-neutral-200 font-medium">
                  All other slots are filled for this date.
                </div>
              ) : (
                Object.entries(groupedSlots).map(([period, periodSlots]) => {
                  // Extract my booked time string for this period comparison
                  const myBookedTimeStr = myBookedSlotForThisDate
                    ? (myBookedSlotForThisDate.date.split(/ · |, /)[1] || "").trim()
                    : null;
                  const myBookedPeriodForSlot = myBookedTimeStr ? getPeriod(myBookedTimeStr) : null;
                  const showMySlotInThisPeriod = myBookedPeriodForSlot === period && myBookedSlotForThisDate;

                  if (periodSlots.length === 0 && !showMySlotInThisPeriod) return null;
                  
                  const periodIcon = period === "Morning" ? <CloudSun size={15} className="text-blue-900" /> :
                                     period === "Afternoon" ? <Sun size={14} className="text-blue-900" /> :
                                     <Moon size={14} className="text-blue-900" />;

                  return (
                    <div key={period} className="space-y-2">
                      <p className="text-[11px] text-blue-900 font-extrabold uppercase tracking-widest flex items-center gap-1.5 border-b border-neutral-50 pb-1">
                        {periodIcon}
                        <span>{period}</span>
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {/* Render my booked slot in amber within its time period group */}
                        {showMySlotInThisPeriod && myBookedSlotForThisDate && (
                          <div
                            className="text-[11px] px-3 py-1.5 rounded-xl border border-amber-400 bg-amber-400/20 text-amber-800 font-bold shadow-sm flex items-center gap-1 cursor-default select-none"
                            title="You have booked this slot"
                          >
                            <Check size={11} className="text-amber-600" strokeWidth={3} />
                            <span>{myBookedSlotForThisDate.date.split(/ · |, /)[1] || "—"}</span>
                          </div>
                        )}

                        {periodSlots.map((slot) => {
                          const isActiveSlot = selectedSlot?.id === slot.id;
                          const slotModes: ("video" | "clinic")[] = slot.modes || (slot.mode ? [slot.mode] : []);

                          const baseClass = isActiveSlot
                            ? "bg-black text-white border-black font-bold shadow-3xs"
                            : "bg-white hover:bg-neutral-100 border-neutral-300 text-black font-bold";

                          return (
                            <button
                              key={slot.id}
                              onClick={() => setSelectedSlot({ ...slot, modes: slotModes })}
                              className={cn(
                                "text-[11px] px-3 py-1.5 rounded-xl border transition-all duration-200 cursor-pointer active:scale-95",
                                baseClass
                              )}
                            >
                              <span className="flex items-center justify-center font-bold">
                                {slot.startTime}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Booking action panel */}
            <div className="pt-4 border-t border-neutral-100 select-none">
              <button
                type="button"
                disabled={!canBook || isStartingBooking}
                onClick={async () => {
                  if (!selectedSlot || !doctor) return;
                  setIsStartingBooking(true);
                  await goToBooking({
                    doctorId: doctor.id,
                    slotId: selectedSlot.id,
                    slot: selectedSlot.startTime,
                    date: selectedDate,
                    mode: selectedSlot.modes[0],
                    availableModes: selectedSlot.modes,
                  });
                  setIsStartingBooking(false);
                }}
                className={cn(
                  "w-full py-3.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 border",
                  canBook
                    ? "bg-herb-green hover:bg-herb-green-light text-white border-herb-green shadow-xs hover:shadow-md active:scale-[0.99] cursor-pointer"
                    : "bg-neutral-100 text-neutral-400 border-neutral-200/60 cursor-not-allowed"
                )}
              >
                {canBook ? (
                  <>
                    <span>{isStartingBooking ? "Please wait…" : `Continue with ${selectedSlot?.startTime}`}</span>
                    {!isStartingBooking && <ChevronRight size={14} />}
                  </>
                ) : (
                  <span>Select a Time Slot</span>
                )}
              </button>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}