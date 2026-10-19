"use client";

import { SITE_NAME } from "@/shared/config/site";
import { useState, useRef, useEffect } from "react";
import { PractitionerCard } from "@/components/PractitionerCard";
import { DISCIPLINES } from "@/lib/data";
import { usePractitioners, useDiscoverMetadata } from "@/hooks/use-discover";
import { useQuery } from "@/hooks/useQuery";
import { useFavorites } from "@/hooks/use-favorites";
import { apiClient } from "@/shared/api/api-client";
import type { AYUSHDiscipline } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ENABLE_VIDEO_CONSULTATION } from "@/lib/feature-flags";
import { useAuth } from "@/contexts/auth-context";

function useNewDiscoverDoctors(filters?: {
  specialty?: string;
  language?: string;
  mode?: "video" | "clinic";
  city?: string;
  ratingMin?: number;
  feeMax?: number;
  search?: string;
}) {
  return useQuery<any[]>(
    () => {
      const params: Record<string, string> = {};
      if (filters?.specialty) params.specialty = filters.specialty;
      if (filters?.language) params.language = filters.language;
      if (filters?.mode) params.mode = filters.mode;
      if (filters?.city) params.city = filters.city;
      if (filters?.ratingMin) params.ratingMin = String(filters.ratingMin);
      if (filters?.feeMax) params.feeMax = String(filters.feeMax);
      if (filters?.search) params.search = filters.search;
      return apiClient<{ data: any[] }>("/api/discover/new-doctors", { params }).then((r) => r.data);
    },
    [JSON.stringify(filters)]
  );
}
import {
  Search,
  ChevronUp,
  X,
  Sparkles,
  Filter,
  ChevronDown,
  Check,
  Calendar,
  Video,
  Award,
  ShieldCheck,
  Activity,
  MapPin,
  Heart,
  Clock
} from "lucide-react";

const PAGE_SIZE = 4;
const SHOW_EXPLORE_SPECIALTIES = false;
const RECENT_SEARCHES_KEY = "mv_recent_doctor_searches";
const MAX_RECENT_SEARCHES = 6;

function loadRecentSearches(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_SEARCHES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((s) => typeof s === "string") : [];
  } catch {
    return [];
  }
}

export default function DiscoverPage() {
  const [selected, setSelected] = useState<AYUSHDiscipline | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSymptoms, setShowSymptoms] = useState(false);
  const [openFilter, setOpenFilter] = useState<string | null>(null);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  useEffect(() => {
    setRecentSearches(loadRecentSearches());
  }, []);

  function saveRecentSearches(next: string[]) {
    setRecentSearches(next);
    try {
      window.localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
    } catch {
      // localStorage unavailable (private browsing, quota) — recent list just won't persist
    }
  }

  function addRecentSearch(term: string) {
    const trimmed = term.trim();
    if (trimmed.length < 2) return;
    const deduped = [trimmed, ...recentSearches.filter((s) => s.toLowerCase() !== trimmed.toLowerCase())];
    saveRecentSearches(deduped.slice(0, MAX_RECENT_SEARCHES));
  }

  function removeRecentSearch(term: string) {
    saveRecentSearches(recentSearches.filter((s) => s !== term));
  }

  // Remember a search once the user pauses typing, so next time they don't
  // have to type the doctor's name again — just pick it from the list.
  useEffect(() => {
    if (searchQuery.trim().length < 2) return;
    const handle = setTimeout(() => addRecentSearch(searchQuery), 900);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  // Custom filter states
  const [videoConsult, setVideoConsult] = useState<boolean | null>(null); // null = any, true = video, false = clinic
  const [feeMax, setFeeMax] = useState<number | null>(null); // null = any, 500 = <500, 1000 = <1000
  const [availableToday, setAvailableToday] = useState<boolean>(false);
  const [language, setLanguage] = useState<string | null>(null); // null = any, English, Hindi, Tamil
  const [experienceMin, setExperienceMin] = useState<number | null>(null); // null = any, 5, 10
  const [gender, setGender] = useState<string | null>(null); // null = any, Male, Female
  const [stateFilter, setStateFilter] = useState<string | null>(null); // null = any state
  const [cityFilter, setCityFilter] = useState<string | null>(null); // null = any city in the state
  const [locationQuery, setLocationQuery] = useState(""); // search box inside the combined Location dropdown
  const [favoritesOnly, setFavoritesOnly] = useState<boolean>(false);

  const { user } = useAuth();
  const { favoriteIds, toggleFavorite } = useFavorites(user?.id);

  const [sortBy, setSortBy] = useState("relevance");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Specialty slider ref
  const specialtyScrollRef = useRef<HTMLDivElement>(null);

  // Map state to query filters for usePractitioners
  const practitionersQueryFilters = {
    discipline: selected ?? undefined,
    search: searchQuery || undefined,
    videoAvailable: videoConsult === true ? true : undefined,
    under500: feeMax === 500 ? true : undefined,
    today: availableToday ? true : undefined,
    languages: language ? [language] : undefined,
    sortBy: sortBy,
  };

  // Query database dynamically via hooks
  const { data: practitioners, loading } = usePractitioners(practitionersQueryFilters);

  // Map state to query filters for useNewDiscoverDoctors
  const newDocsQueryFilters = {
    specialty: selected ?? undefined,
    language: language ?? undefined,
    mode: videoConsult === true ? ("video" as const) : videoConsult === false ? ("clinic" as const) : undefined,
    feeMax: feeMax ?? undefined,
    search: searchQuery || undefined,
  };

  const { data: newDoctors, loading: newDocsLoading } = useNewDiscoverDoctors(newDocsQueryFilters);

  const { data: metadata } = useDiscoverMetadata();
  const dynamicSymptoms = metadata?.symptoms?.length ? metadata.symptoms : [];

  // Map new doctor profiles to standard Practitioner interface shape
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mappedNewDocs = (newDoctors || []).map((doc: any) => {
    const specs: string[] = doc.specializations || [];
    const spec = specs[0] || "Ayurveda";
    const initials = doc.full_name?.split(" ").filter(Boolean).map((n: string) => n[0]).join("").slice(0, 2).toUpperCase() || "DR";
    return {
      id: doc.id,
      name: doc.full_name,
      specialty: spec,
      specialties: specs,
      rating: Number(doc.rating_avg ?? 0),
      reviews: doc.rating_count ?? 0,
      discipline: "Ayurveda" as const,
      experience: doc.experience_years ?? 0,
      location: "Online",
      isVerified: true,
      fee: Math.round((doc.consultation_fee ?? 0) / 100),
      nextAvailable: "Today",
      consultModes: (doc.consult_modes?.length ? doc.consult_modes : ["clinic"]) as ("video" | "clinic")[],
      avatar: initials,
      hprId: doc.verifications?.[0]?.hpr_id || "HPR-PENDING",
      languages: doc.languages || ["English"],
      qualifications: doc.qualifications?.length ? doc.qualifications : ["BAMS"],
      about: `${doc.full_name} is a verified specialist doctor on ${SITE_NAME}.`,
      gender: doc.gender || "",
      state: doc.state || "",
      city: doc.city || "",
      clinicName: doc.clinic_name || "",
      clinicAddress: doc.clinic_address || "",
    };
  });

  const baseList = [
    ...(practitioners ?? []),
    ...mappedNewDocs,
  ];

  // Apply client-side filters for maximum accuracy & matching user filters
  let filtered = [...baseList];

  // Remove duplicates between the two sources
  const seenIds = new Set<string>();
  filtered = filtered.filter(doc => {
    if (seenIds.has(doc.id)) return false;
    seenIds.add(doc.id);
    return true;
  });

  // Location filter options come from the practitioners actually on the platform,
  // so every option yields results and the city list follows the chosen state.
  const stateOptions = Array.from(
    new Set(filtered.map((doc) => (doc.state || "").trim()).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));

  const cityOptions = Array.from(
    new Set(
      filtered
        .filter((doc) => !stateFilter || (doc.state || "").trim() === stateFilter)
        .map((doc) => (doc.city || "").trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));

  // Narrowed by whatever's typed into the Location dropdown's search box
  const locationQueryLower = locationQuery.trim().toLowerCase();
  const matchedStateOptions = stateOptions.filter((s) => s.toLowerCase().includes(locationQueryLower));
  const matchedCityOptions = cityOptions.filter((c) => c.toLowerCase().includes(locationQueryLower));

  // Client-side State / City Filtering — uses each doctor's saved practice location
  if (stateFilter !== null) {
    filtered = filtered.filter(doc => (doc.state || "").trim() === stateFilter);
  }

  if (cityFilter !== null) {
    filtered = filtered.filter(doc => (doc.city || "").trim() === cityFilter);
  }

  // Client-side Fee Filtering
  if (feeMax !== null) {
    filtered = filtered.filter(doc => doc.fee <= feeMax);
  }

  // Client-side Mode Filtering
  if (videoConsult !== null) {
    filtered = filtered.filter(doc => {
      const hasVideo = doc.consultModes.includes("video");
      const hasClinic = doc.consultModes.includes("clinic");
      return videoConsult ? hasVideo : hasClinic;
    });
  }

  // Client-side Availability Filtering
  if (availableToday) {
    filtered = filtered.filter(doc => doc.nextAvailable.toLowerCase() === "today");
  }

  // Client-side Language Filtering
  if (language !== null) {
    filtered = filtered.filter(doc =>
      doc.languages.some((l: string) => l.toLowerCase() === language.toLowerCase())
    );
  }

  // Client-side Experience Filtering
  if (experienceMin !== null) {
    filtered = filtered.filter(doc => doc.experience >= experienceMin);
  }

  // Client-side Gender Filtering — uses the doctor's actual saved gender
  if (gender !== null) {
    filtered = filtered.filter(doc => (doc.gender || "").toLowerCase() === gender.toLowerCase());
  }

  // Client-side Favorites Filtering — only the current patient's favorited doctors
  if (favoritesOnly) {
    filtered = filtered.filter(doc => favoriteIds.has(doc.id));
  }

  // Sorting
  if (sortBy === "rating") {
    filtered.sort((a, b) => b.rating - a.rating);
  } else if (sortBy === "fee-low-high") {
    filtered.sort((a, b) => a.fee - b.fee);
  } else if (sortBy === "experience") {
    filtered.sort((a, b) => b.experience - a.experience);
  } else {
    // Relevance: verified first, then sort by rating
    filtered.sort((a, b) => {
      if (a.isVerified && !b.isVerified) return -1;
      if (!a.isVerified && b.isVerified) return 1;
      return b.rating - a.rating;
    });
  }

  // Reset pagination whenever a filter, search, discipline, or sort changes.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [selected, searchQuery, videoConsult, feeMax, availableToday, language, experienceMin, gender, stateFilter, cityFilter, favoritesOnly, sortBy]);

  const visibleList = filtered.slice(0, visibleCount);
  const hasMore = filtered.length > visibleCount;

  const isAnyLoading = loading || newDocsLoading;

  // Clear all filter values
  const clearAllFilters = () => {
    setVideoConsult(null);
    setFeeMax(null);
    setAvailableToday(false);
    setLanguage(null);
    setExperienceMin(null);
    setGender(null);
    setStateFilter(null);
    setCityFilter(null);
    setFavoritesOnly(false);
    setSelected(null);
    setSearchQuery("");
  };


  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 max-w-[92rem] mx-auto space-y-8">

      {/* ─── HERO SECTION ─── */}
      <div className="relative overflow-hidden bg-gradient-to-br from-indigo-50/40 via-white to-teal-50/20 border border-neutral-150/70 rounded-[2.5rem] p-8 md:p-12 shadow-xs">
        {/* Glow vector backdrops */}
        <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-herb-green/5 rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-copper/5 rounded-full blur-2xl -ml-20 -mb-20 pointer-events-none" />

        <div className="grid md:grid-cols-12 gap-8 items-center relative z-10">
          {/* Hero text copy */}
          <div className="md:col-span-8 lg:col-span-7 space-y-5">
            <span className="inline-flex items-center gap-1.5 text-[10px] bg-herb-green/10 text-herb-green font-extrabold tracking-wider uppercase px-3.5 py-1.5 rounded-full border border-herb-green/15">
              <ShieldCheck size={11} className="stroke-[2.5]" />
              ABDM Certified · AYUSH Digital Health
            </span>
            <h1 className="font-display text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-foreground leading-tight">
              Connect with India&apos;s <br />
              <span className="text-herb-green">Top Specialists</span>
            </h1>
            <p className="text-sm md:text-base text-muted-foreground leading-relaxed max-w-lg font-medium">
              Consult with verified Ayurveda, Yoga, Naturopathy, Unani, Siddha, and Homeopathy practitioners.{ENABLE_VIDEO_CONSULTATION ? " In-clinic visits or video calls." : " In-clinic visits."}
            </p>
          </div>

          {/* Hero illustration (Right) */}
          <div className="hidden md:block md:col-span-4 lg:col-span-5 relative w-full h-56 lg:h-64">
            <svg className="w-full h-full text-herb-green/12" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="100" cy="100" r="75" fill="currentColor" fillOpacity="0.4" />
              <circle cx="125" cy="75" r="45" fill="oklch(0.54 0.17 196 / 0.15)" />
              <path d="M30 100H55L68 70L80 130L92 90L98 110L105 100H170" stroke="oklch(0.44 0.22 268)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M125 60C125 60 145 60 155 80C155 100 135 110 125 110C125 110 115 90 115 80C115 70 125 60 125 60Z" fill="oklch(0.54 0.17 196)" fillOpacity="0.45" />
              <path d="M115 80C115 80 130 95 155 80" stroke="oklch(0.54 0.17 196)" strokeWidth="2.5" strokeLinecap="round" />
              <circle cx="125" cy="115" r="16" stroke="oklch(0.44 0.22 268)" strokeWidth="3.5" />
              <circle cx="125" cy="115" r="6" fill="oklch(0.44 0.22 268)" />
            </svg>
          </div>
        </div>
      </div>

      {/* ─── EXPLORE SPECIALTIES (CAROUSEL) ─── */}
      {SHOW_EXPLORE_SPECIALTIES && (
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-[10px] font-extrabold text-muted-foreground/80 uppercase tracking-widest flex items-center gap-1.5">
              <Activity size={12} className="text-herb-green" />
              Explore Specialties
            </h2>
          </div>

          {/* Scroll list wrapper */}
          <div
            ref={specialtyScrollRef}
            className="flex overflow-x-auto gap-4 py-2 px-1 scrollbar-none snap-x snap-mandatory"
            style={{ scrollbarWidth: "none" }}
          >
            {/* 'All' Specialty Card */}
            <button
              onClick={() => setSelected(null)}
              className={cn(
                "flex flex-col items-center gap-2.5 p-4 rounded-2.5xl border text-center transition-all duration-300 snap-start flex-shrink-0 w-32 cursor-pointer",
                selected === null
                  ? "bg-herb-green text-white border-0 shadow-[0_6px_20px_-4px_rgba(59,44,147,0.35)] scale-[1.03]"
                  : "border-neutral-200/70 bg-white hover:border-herb-green/35 hover:-translate-y-0.5 hover:shadow-xs"
              )}
            >
              <div className={cn(
                "w-12 h-12 rounded-xl flex items-center justify-center text-xl transition-all shadow-2xs font-display",
                selected === null ? "bg-white/20 text-white" : "bg-neutral-50"
              )}>
                🌐
              </div>
              <div>
                <p className="text-xs font-bold leading-tight">All Specialties</p>
                <p className={cn("text-[9px] mt-0.5 font-medium leading-none", selected === null ? "text-white/80" : "text-muted-foreground")}>
                  View all
                </p>
              </div>
            </button>

            {/* Individual Specialties */}
            {DISCIPLINES.map((disc) => {
              const isActive = selected === disc.id;
              const count = (metadata?.disciplineCounts?.[disc.id] || 0) + (disc.id === "Ayurveda" ? mappedNewDocs.length : 0);

              return (
                <button
                  key={disc.id}
                  onClick={() => setSelected(disc.id as AYUSHDiscipline)}
                  className={cn(
                    "flex flex-col items-center gap-2.5 p-4 rounded-2.5xl border text-center transition-all duration-300 snap-start flex-shrink-0 w-32 cursor-pointer",
                    isActive
                      ? "bg-herb-green text-white border-0 shadow-[0_6px_20px_-4px_rgba(59,44,147,0.35)] scale-[1.03]"
                      : "border-neutral-200/70 bg-white hover:border-herb-green/35 hover:-translate-y-0.5 hover:shadow-xs"
                  )}
                >
                  <div className={cn(
                    "w-12 h-12 rounded-xl flex items-center justify-center text-xl transition-all shadow-2xs",
                    isActive ? "bg-white/20 text-white" : "bg-neutral-50"
                  )}>
                    {disc.icon}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold leading-tight truncate w-full">{disc.label}</p>
                    <p className={cn("text-[9px] mt-0.5 font-medium leading-none", isActive ? "text-white/80" : "text-muted-foreground")}>
                      {count} Doctors
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── DROPDOWN FILTERS BAR ─── */}
      <div className={cn("space-y-4", SHOW_EXPLORE_SPECIALTIES ? "border-t border-neutral-150/75 pt-7" : "")}>
        <div className="flex items-center justify-between px-1">
          <h2 className="text-[10px] font-extrabold text-muted-foreground/80 uppercase tracking-widest flex items-center gap-1.5">
            <Filter size={12} className="text-herb-green" />
            Filters & Sorting
          </h2>
          {(videoConsult !== null || feeMax !== null || availableToday || language !== null || experienceMin !== null || gender !== null || stateFilter !== null || cityFilter !== null || favoritesOnly) && (
            <button
              onClick={clearAllFilters}
              className="text-[10px] font-extrabold text-red-500 hover:text-red-600 transition-colors flex items-center gap-1 bg-red-50 hover:bg-red-100/60 px-3 py-1 rounded-full border border-red-100"
            >
              <X size={10} className="stroke-[2.5]" />
              Clear All Filters
            </button>
          )}
        </div>

        {/* Search Bar */}
        <div className="relative group px-1 max-w-md">
          <div className="w-full pl-4 pr-4 py-1 bg-white hover:bg-neutral-50 border border-neutral-200/90 focus-within:bg-white focus-within:border-herb-green/50 focus-within:ring-4 focus-within:ring-herb-green/8 rounded-xl shadow-2xs transition-all duration-300 flex items-center gap-2.5">
            <Search size={15} className="text-muted-foreground/60 group-focus-within:text-herb-green transition-colors flex-shrink-0" />
            <input
              type="text"
              placeholder="Search symptoms, doctors, specialties..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setShowSymptoms(e.target.value.length > 0);
              }}
              onFocus={() => setShowSymptoms(true)}
              onBlur={() => setTimeout(() => setShowSymptoms(false), 200)}
              className="w-full py-2.5 bg-transparent text-xs placeholder:text-muted-foreground/75 focus:outline-none text-foreground font-semibold"
            />

            {searchQuery && (
              <button
                onClick={() => { setSearchQuery(""); setShowSymptoms(false); }}
                className="p-1 rounded-full hover:bg-neutral-100 text-muted-foreground transition-all flex-shrink-0"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Autocomplete Symtoms Overlay */}
          {showSymptoms && (
            <div className="absolute left-0 right-0 top-[calc(100%+8px)] bg-white border border-neutral-200/80 rounded-2xl shadow-2xl z-30 overflow-hidden divide-y divide-neutral-100/70 animate-in fade-in slide-in-from-top-2 duration-200">
              {recentSearches.filter(
                (s) => !searchQuery || s.toLowerCase().includes(searchQuery.toLowerCase())
              ).length > 0 && (
                  <div className="p-2 max-h-48 overflow-y-auto">
                    <div className="flex items-center justify-between px-3.5 py-2">
                      <p className="text-[10px] text-muted-foreground/80 font-extrabold uppercase tracking-widest flex items-center gap-1">
                        <Clock size={10} className="text-herb-green" />
                        Recent Searches
                      </p>
                      <button
                        onMouseDown={() => saveRecentSearches([])}
                        className="text-[10px] font-bold text-muted-foreground/70 hover:text-red-500 transition-colors"
                      >
                        Clear
                      </button>
                    </div>
                    {recentSearches
                      .filter((s) => !searchQuery || s.toLowerCase().includes(searchQuery.toLowerCase()))
                      .map((term) => (
                        <div
                          key={term}
                          className="w-full flex items-center gap-2.5 px-3.5 py-2 rounded-xl hover:bg-herb-green/5 transition-all group/recent"
                        >
                          <button
                            onMouseDown={() => {
                              setSearchQuery(term);
                              setShowSymptoms(false);
                            }}
                            className="flex-1 text-left flex items-center gap-2.5 min-w-0"
                          >
                            <Clock size={12} className="text-muted-foreground/50 flex-shrink-0" />
                            <span className="text-xs font-semibold text-foreground truncate">{term}</span>
                          </button>
                          <button
                            onMouseDown={() => removeRecentSearch(term)}
                            aria-label={`Remove "${term}" from recent searches`}
                            className="p-1 rounded-full opacity-0 group-hover/recent:opacity-100 hover:bg-neutral-200/70 text-muted-foreground transition-all flex-shrink-0"
                          >
                            <X size={11} />
                          </button>
                        </div>
                      ))}
                  </div>
                )}

              <div className="p-2 max-h-64 overflow-y-auto">
                <p className="text-[10px] text-muted-foreground/80 px-3.5 py-2 font-extrabold uppercase tracking-widest flex items-center gap-1">
                  <Sparkles size={10} className="text-herb-green fill-herb-green" />
                  Common Symptoms & Treatment Focus
                </p>
                {dynamicSymptoms.filter(
                  (s) => !searchQuery || s.toLowerCase().includes(searchQuery.toLowerCase())
                ).length > 0 ? (
                  dynamicSymptoms
                    .filter((s) => !searchQuery || s.toLowerCase().includes(searchQuery.toLowerCase()))
                    .slice(0, 7)
                    .map((symptom) => (
                      <button
                        key={symptom}
                        onMouseDown={() => {
                          setSearchQuery(symptom);
                          setShowSymptoms(false);
                        }}
                        className="w-full text-left px-3.5 py-2 text-xs font-semibold rounded-xl hover:bg-herb-green/5 hover:text-herb-green transition-all flex items-center gap-2.5"
                      >
                        <Search size={12} className="text-muted-foreground/50" />
                        <span className="text-foreground">{symptom}</span>
                      </button>
                    ))
                ) : (
                  <p className="text-xs text-muted-foreground p-3 text-center">No symptom matches. Press Enter to search.</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Filters Scrollable Strip */}
        <div className="flex flex-wrap items-center gap-2 px-1">

          {/* 1. Consultation Mode Dropdown — hidden in Phase 1 (in-clinic only) */}
          {ENABLE_VIDEO_CONSULTATION && (
            <div className="relative">
              <button
                onClick={() => setOpenFilter(openFilter === "mode" ? null : "mode")}
                className={cn(
                  "px-3.5 py-2 rounded-xl border text-xs font-bold tracking-wide flex items-center gap-2 shadow-2xs transition-all duration-200 cursor-pointer",
                  videoConsult !== null
                    ? "bg-herb-green/5 border-herb-green text-herb-green ring-1 ring-herb-green/20"
                    : "bg-white hover:bg-neutral-50 hover:border-neutral-300 border-neutral-200 text-neutral-600"
                )}
              >
                <Video size={13} className="text-muted-foreground/80 group-hover:text-foreground" />
                <span>
                  {videoConsult === true ? "Video Consult" : videoConsult === false ? "In-Clinic Visit" : "Consult Mode"}
                </span>
                <ChevronDown size={12} className="opacity-70" />
              </button>

              {openFilter === "mode" && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setOpenFilter(null)} />
                  <div className="absolute left-0 top-[calc(100%+6px)] z-30 bg-white border border-neutral-200/80 rounded-2xl shadow-xl min-w-[180px] py-1.5 animate-in fade-in slide-in-from-top-1.5 duration-150">
                    {[
                      { label: "Any Mode", value: null },
                      { label: "Video Consultation", value: true },
                      { label: "In-Clinic Visit", value: false }
                    ].map((opt) => (
                      <button
                        key={opt.label}
                        onClick={() => {
                          setVideoConsult(opt.value);
                          setOpenFilter(null);
                        }}
                        className="w-full text-left px-4 py-2 text-xs font-semibold hover:bg-neutral-50 transition-colors flex items-center justify-between"
                      >
                        <span className={opt.value === videoConsult ? "text-herb-green" : "text-neutral-600"}>
                          {opt.label}
                        </span>
                        {videoConsult === opt.value && <Check size={12} className="text-herb-green" />}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* 2. Fee Dropdown */}
          <div className="relative">
            <button
              onClick={() => setOpenFilter(openFilter === "fee" ? null : "fee")}
              className={cn(
                "px-3.5 py-2 rounded-xl border text-xs font-bold tracking-wide flex items-center gap-2 shadow-2xs transition-all duration-200 cursor-pointer",
                feeMax !== null
                  ? "bg-herb-green/5 border-herb-green text-herb-green ring-1 ring-herb-green/20"
                  : "bg-white hover:bg-neutral-50 hover:border-neutral-300 border-neutral-200 text-neutral-600"
              )}
            >
              <span className="text-xs">₹</span>
              <span>
                {feeMax !== null ? `Under ₹${feeMax}` : "Consultation Fee"}
              </span>
              <ChevronDown size={12} className="opacity-70" />
            </button>

            {openFilter === "fee" && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setOpenFilter(null)} />
                <div className="absolute left-0 top-[calc(100%+6px)] z-30 bg-white border border-neutral-200/80 rounded-2xl shadow-xl min-w-[180px] py-1.5 animate-in fade-in slide-in-from-top-1.5 duration-150">
                  {[
                    { label: "Any Fee", value: null },
                    { label: "Under ₹500", value: 500 },
                    { label: "Under ₹1000", value: 1000 }
                  ].map((opt) => (
                    <button
                      key={opt.label}
                      onClick={() => {
                        setFeeMax(opt.value);
                        setOpenFilter(null);
                      }}
                      className="w-full text-left px-4 py-2 text-xs font-semibold hover:bg-neutral-50 transition-colors flex items-center justify-between"
                    >
                      <span className={opt.value === feeMax ? "text-herb-green" : "text-neutral-600"}>
                        {opt.label}
                      </span>
                      {feeMax === opt.value && <Check size={12} className="text-herb-green" />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* 3. Availability Today Switch */}
          <button
            onClick={() => setAvailableToday(!availableToday)}
            className={cn(
              "px-3.5 py-2 rounded-xl border text-xs font-bold tracking-wide flex items-center gap-2 shadow-2xs transition-all duration-200 cursor-pointer",
              availableToday
                ? "bg-herb-green/5 border-herb-green text-herb-green ring-1 ring-herb-green/20"
                : "bg-white hover:bg-neutral-50 hover:border-neutral-300 border-neutral-200 text-neutral-600"
            )}
          >
            <Calendar size={13} className="text-muted-foreground/80" />
            <span>Available Today</span>
            {availableToday && <Check size={12} className="text-herb-green" />}
          </button>

          {/* 5. Experience Dropdown */}
          <div className="relative">
            <button
              onClick={() => setOpenFilter(openFilter === "experience" ? null : "experience")}
              className={cn(
                "px-3.5 py-2 rounded-xl border text-xs font-bold tracking-wide flex items-center gap-2 shadow-2xs transition-all duration-200 cursor-pointer",
                experienceMin !== null
                  ? "bg-herb-green/5 border-herb-green text-herb-green ring-1 ring-herb-green/20"
                  : "bg-white hover:bg-neutral-50 hover:border-neutral-300 border-neutral-200 text-neutral-600"
              )}
            >
              <Award size={13} className="text-muted-foreground/80" />
              <span>
                {experienceMin !== null ? `${experienceMin}+ Years` : "Experience"}
              </span>
              <ChevronDown size={12} className="opacity-70" />
            </button>

            {openFilter === "experience" && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setOpenFilter(null)} />
                <div className="absolute left-0 top-[calc(100%+6px)] z-30 bg-white border border-neutral-200/80 rounded-2xl shadow-xl min-w-[180px] py-1.5 animate-in fade-in slide-in-from-top-1.5 duration-150">
                  {[
                    { label: "Any Experience", value: null },
                    { label: "5+ Years Experience", value: 5 },
                    { label: "10+ Years Experience", value: 10 }
                  ].map((opt) => (
                    <button
                      key={opt.label}
                      onClick={() => {
                        setExperienceMin(opt.value);
                        setOpenFilter(null);
                      }}
                      className="w-full text-left px-4 py-2 text-xs font-semibold hover:bg-neutral-50 transition-colors flex items-center justify-between"
                    >
                      <span className={opt.value === experienceMin ? "text-herb-green" : "text-neutral-600"}>
                        {opt.label}
                      </span>
                      {experienceMin === opt.value && <Check size={12} className="text-herb-green" />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* 6. Gender Dropdown */}
          <div className="relative">
            <button
              onClick={() => setOpenFilter(openFilter === "gender" ? null : "gender")}
              className={cn(
                "px-3.5 py-2 rounded-xl border text-xs font-bold tracking-wide flex items-center gap-2 shadow-2xs transition-all duration-200 cursor-pointer",
                gender !== null
                  ? "bg-herb-green/5 border-herb-green text-herb-green ring-1 ring-herb-green/20"
                  : "bg-white hover:bg-neutral-50 hover:border-neutral-300 border-neutral-200 text-neutral-600"
              )}
            >
              <span>{gender !== null ? `${gender} Doctors` : "Gender"}</span>
              <ChevronDown size={12} className="opacity-70" />
            </button>

            {openFilter === "gender" && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setOpenFilter(null)} />
                <div className="absolute left-0 top-[calc(100%+6px)] z-30 bg-white border border-neutral-200/80 rounded-2xl shadow-xl min-w-[180px] py-1.5 animate-in fade-in slide-in-from-top-1.5 duration-150">
                  {[
                    { label: "Any Gender", value: null },
                    { label: "Male Doctors Only", value: "Male" },
                    { label: "Female Doctors Only", value: "Female" }
                  ].map((opt) => (
                    <button
                      key={opt.label}
                      onClick={() => {
                        setGender(opt.value);
                        setOpenFilter(null);
                      }}
                      className="w-full text-left px-4 py-2 text-xs font-semibold hover:bg-neutral-50 transition-colors flex items-center justify-between"
                    >
                      <span className={opt.value === gender ? "text-herb-green" : "text-neutral-600"}>
                        {opt.label}
                      </span>
                      {gender === opt.value && <Check size={12} className="text-herb-green" />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* 7. Location Filter — one combined State + City picker with integrated search */}
          <div className="relative">
            <button
              onClick={() => {
                setOpenFilter(openFilter === "location" ? null : "location");
                setLocationQuery("");
              }}
              className={cn(
                "px-3.5 py-2 rounded-xl border text-xs font-bold tracking-wide flex items-center gap-2 shadow-2xs transition-all duration-200 cursor-pointer",
                (stateFilter !== null || cityFilter !== null)
                  ? "bg-herb-green/5 border-herb-green text-herb-green ring-1 ring-herb-green/20"
                  : "bg-white hover:bg-neutral-50 hover:border-neutral-300 border-neutral-200 text-neutral-600"
              )}
            >
              <MapPin size={13} className="text-muted-foreground/80" />
              <span className="max-w-[160px] truncate">
                {cityFilter && stateFilter
                  ? `${cityFilter}, ${stateFilter}`
                  : cityFilter ?? stateFilter ?? "Location"}
              </span>
              <ChevronDown size={12} className="opacity-70" />
            </button>

            {openFilter === "location" && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setOpenFilter(null)} />
                <div className="absolute left-0 top-[calc(100%+6px)] z-30 bg-white border border-neutral-200/80 rounded-2xl shadow-xl w-[260px] overflow-hidden animate-in fade-in slide-in-from-top-1.5 duration-150">
                  {/* Search — integrated directly into the dropdown */}
                  <div className="relative border-b border-neutral-100 p-2">
                    <Search size={13} className="absolute left-5 top-1/2 -translate-y-1/2 text-muted-foreground/60 pointer-events-none" />
                    <input
                      autoFocus
                      type="text"
                      value={locationQuery}
                      onChange={(e) => setLocationQuery(e.target.value)}
                      placeholder="Search location..."
                      className="w-full pl-7 pr-2 py-1.5 text-xs font-semibold rounded-lg bg-neutral-50 focus:outline-none focus:bg-white focus:ring-2 focus:ring-herb-green/15 transition-all"
                    />
                  </div>

                  {(stateFilter !== null || cityFilter !== null) && (
                    <button
                      onClick={() => {
                        setStateFilter(null);
                        setCityFilter(null);
                        setOpenFilter(null);
                      }}
                      className="w-full text-left px-4 py-2 text-xs font-semibold text-red-500 hover:bg-red-50 transition-colors flex items-center gap-1.5 border-b border-neutral-100"
                    >
                      <X size={10} className="stroke-[2.5]" />
                      Clear Location
                    </button>
                  )}

                  <div className="max-h-64 overflow-y-auto py-1.5">
                    {/* States */}
                    <p className="px-4 pt-1.5 pb-1 text-[9px] font-extrabold text-muted-foreground/70 uppercase tracking-widest">State</p>
                    {matchedStateOptions.length === 0 ? (
                      <p className="px-4 py-1.5 text-xs text-muted-foreground">No matching states</p>
                    ) : (
                      matchedStateOptions.map((opt) => (
                        <button
                          key={opt}
                          onClick={() => {
                            setStateFilter(opt);
                            setCityFilter(null); // reset city whenever the state changes
                          }}
                          className="w-full text-left px-4 py-2 text-xs font-semibold hover:bg-neutral-50 transition-colors flex items-center justify-between gap-2"
                        >
                          <span className={opt === stateFilter ? "text-herb-green" : "text-neutral-600"}>{opt}</span>
                          {stateFilter === opt && <Check size={12} className="text-herb-green flex-shrink-0" />}
                        </button>
                      ))
                    )}

                    {/* Cities — narrowed to the selected state, if any */}
                    <p className="px-4 pt-2.5 pb-1 text-[9px] font-extrabold text-muted-foreground/70 uppercase tracking-widest">City</p>
                    {matchedCityOptions.length === 0 ? (
                      <p className="px-4 py-1.5 text-xs text-muted-foreground">
                        {stateFilter ? "No cities in this state yet" : "No matching cities"}
                      </p>
                    ) : (
                      matchedCityOptions.map((opt) => (
                        <button
                          key={opt}
                          onClick={() => {
                            setCityFilter(opt);
                            setOpenFilter(null);
                          }}
                          className="w-full text-left px-4 py-2 text-xs font-semibold hover:bg-neutral-50 transition-colors flex items-center justify-between gap-2"
                        >
                          <span className={opt === cityFilter ? "text-herb-green" : "text-neutral-600"}>{opt}</span>
                          {cityFilter === opt && <Check size={12} className="text-herb-green flex-shrink-0" />}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* 8. Favorites Toggle */}
          <button
            type="button"
            onClick={() => setFavoritesOnly(!favoritesOnly)}
            className={cn(
              "px-3.5 py-2 rounded-xl border text-xs font-bold tracking-wide flex items-center gap-2 shadow-2xs transition-all duration-200 cursor-pointer",
              favoritesOnly
                ? "bg-red-50 border-red-200 text-red-600 ring-1 ring-red-200"
                : "bg-white hover:bg-neutral-50 hover:border-neutral-300 border-neutral-200 text-neutral-600"
            )}
          >
            <Heart size={13} className={cn("pointer-events-none", favoritesOnly ? "fill-red-500 text-red-500" : "text-muted-foreground/80")} />
            <span>Favorites</span>
            {favoritesOnly && <Check size={12} className="text-red-600" />}
          </button>

        </div>
      </div>

      {/* ─── MAIN DOCTORS LIST ─── */}
      <div className="space-y-6">
        {/* Result Count Row */}
        <div className="flex items-center justify-between px-1">
          <div className="text-xs text-muted-foreground font-semibold flex items-center gap-1.5 select-none">
            {isAnyLoading ? (
              <span className="animate-pulse flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-herb-green animate-ping" />
                Loading practitioners...
              </span>
            ) : (
              <>
                Found <span className="font-extrabold text-foreground font-mono bg-neutral-100 px-2 py-0.5 rounded-md">{filtered.length}</span> Verified Specialists
                {selected && <span className="font-bold text-herb-green"> in {selected}</span>}
              </>
            )}
          </div>
        </div>

        {/* Doctors Listings / Loading States / Empty States */}
        {isAnyLoading ? (
          <div className="flex flex-col items-center justify-center h-96 bg-white border border-neutral-150 rounded-[2rem] shadow-xs">
            <div className="w-12 h-12 rounded-full border-3 border-herb-green border-t-transparent animate-spin" />
            <p className="text-xs text-muted-foreground mt-4 font-bold">Matching certified specialists for you...</p>
          </div>
        ) : filtered.length > 0 ? (
          <div className="bg-white/60 border border-neutral-150/70 rounded-[2rem] shadow-xs p-4 sm:p-5">
            <div className="max-h-[calc(100vh-340px)] min-h-[420px] overflow-y-auto pr-1 space-y-5 scroll-smooth">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 items-stretch">
                {visibleList.map((doc) => (
                  <PractitionerCard
                    key={doc.id}
                    doctor={doc}
                    isFavorite={favoriteIds.has(doc.id)}
                    onToggleFavorite={() => toggleFavorite(doc.id)}
                  />
                ))}
              </div>

              {(hasMore || visibleCount > PAGE_SIZE) && (
                <div className="flex justify-center items-center gap-3 pt-2 pb-1">
                  {hasMore && (
                    <button
                      onClick={() => setVisibleCount((c) => Math.min(c + PAGE_SIZE, filtered.length))}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-herb-green hover:text-herb-green-light px-4 py-2 rounded-full hover:bg-herb-green/5 transition-all cursor-pointer active:scale-[0.98]"
                    >
                      Show More
                      <ChevronDown size={13} />
                    </button>
                  )}
                  {visibleCount > PAGE_SIZE && (
                    <button
                      onClick={() => setVisibleCount(PAGE_SIZE)}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-neutral-500 hover:text-foreground px-4 py-2 rounded-full hover:bg-neutral-100 transition-all cursor-pointer active:scale-[0.98]"
                    >
                      Show Less
                      <ChevronUp size={13} />
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center py-20 bg-white rounded-[2rem] border border-neutral-150/70 shadow-xs space-y-4">
            <span className="text-5xl inline-block animate-bounce">🌿</span>
            <h3 className="text-base font-black text-foreground">No Specialists Found</h3>
            <p className="text-xs text-muted-foreground max-w-xs mx-auto leading-relaxed font-medium">
              We couldn&apos;t find matches under these filters. Try clearing some filters or refining your search keywords.
            </p>
            <button
              onClick={clearAllFilters}
              className="mt-2 text-xs font-bold bg-herb-green hover:bg-herb-green-light active:scale-95 text-white py-2 px-4.5 rounded-xl shadow-xs transition-all cursor-pointer"
            >
              Clear All Filters
            </button>
          </div>
        )}
      </div>
    </div>
  );
}