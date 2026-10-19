"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Practitioner } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";
import { ShieldCheck, MapPin, Video, Heart, Award, Languages, ChevronRight, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ENABLE_VIDEO_CONSULTATION } from "@/lib/feature-flags";
import { setNavContext } from "@/lib/nav-context-client";

interface PractitionerCardProps {
  doctor: Practitioner;
  compact?: boolean;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
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

export function PractitionerCard({ doctor, compact = false, isFavorite: isFavoriteProp, onToggleFavorite }: PractitionerCardProps) {
  const router = useRouter();
  const [localFavorite, setLocalFavorite] = useState(false);
  const isFavorite = isFavoriteProp ?? localFavorite;
  const handleToggleFavorite = onToggleFavorite ?? (() => setLocalFavorite((v) => !v));

  async function goToDoctor() {
    await setNavContext("doctor", { doctorId: doctor.id });
    router.push("/doctor");
  }

  const style = disciplineStyles[doctor.discipline] || {
    bg: "bg-neutral-50 text-neutral-850 border-neutral-200",
    text: "text-neutral-700",
    border: "border-neutral-200",
    gradient: "from-neutral-500 to-neutral-600",
  };

  const consultModes = (doctor.consultModes ?? []).filter(
    (mode) => mode === "clinic" || (mode === "video" && ENABLE_VIDEO_CONSULTATION)
  );

  const focusAreas =doctor.specialties?.length ? doctor.specialties : (doctor.specialty ? [doctor.specialty] : []);

  // Practice location, straight from the practitioner's saved profile. Long
  // values are truncated in place (with the full text on hover) so the card
  // keeps its fixed dimensions.
  const clinicName = doctor.clinicName?.trim() ?? "";
  const fullAddress = [doctor.clinicAddress, doctor.city, doctor.state]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(", ");

  // Compact Layout (for Home page Dashboard sidebar)
  if (compact) {
    return (
      <div className="relative group bg-white rounded-2xl p-4 border border-neutral-100 shadow-xs hover:shadow-md hover:border-herb-green/30 transition-all duration-300">
        <div className="flex gap-3.5">
          {/* Left: Avatar with Live Status */}
          <div className="relative flex-shrink-0">
            <div className={cn(
              "w-12 h-12 rounded-xl bg-gradient-to-br flex items-center justify-center shadow-xs font-display tracking-wider text-white font-extrabold text-sm",
              style.gradient
            )}>
              {doctor.avatar}
            </div>
            {/* Live Indicator */}
            <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-white flex items-center justify-center shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping opacity-75" />
            </span>
          </div>

          {/* Center: Details */}
          <div className="flex-1 min-w-0">
            <h3 className="font-display font-bold text-foreground text-sm truncate group-hover:text-herb-green transition-colors leading-snug">
              {doctor.name}
            </h3>

            <p className="text-[11px] font-medium text-muted-foreground truncate mt-0.5">
              {doctor.specialties?.length ? doctor.specialties.join(", ") : doctor.specialty}
            </p>

            <div className="flex gap-1.5 items-center mt-2.5">
              <span className={cn("text-[9px] font-bold tracking-wide uppercase px-2 py-0.5 rounded-md border", style.bg, style.border)}>
                {doctor.discipline}
              </span>
              {doctor.isVerified && (
                <span className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wider bg-emerald-500/5 text-emerald-700 px-2 py-0.5 rounded-md border border-emerald-500/10">
                  Verified
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Footer info row */}
        <div className="mt-3.5 pt-3 border-t border-neutral-100 flex items-center justify-between text-xs">
          <div>
            <span className="text-muted-foreground text-[10px] uppercase font-bold tracking-wider block">Starts at</span>
            <span className="font-extrabold text-foreground font-mono text-sm">{formatCurrency(doctor.fee)}</span>
          </div>
          
          <button onClick={goToDoctor} className="inline-flex items-center gap-1 text-[11px] font-bold text-herb-green bg-herb-green/5 hover:bg-herb-green/10 px-3 py-1.5 rounded-xl border border-herb-green/15 transition-all">
            <span>Book Now</span>
            <ChevronRight size={10} />
          </button>
        </div>
      </div>
    );
  }

  // Vertical Card Layout (Discover Page) — matches Appointments card style
  return (
    <div className="group bg-white rounded-2xl border border-neutral-150/70 p-5 shadow-sm hover:shadow-md hover:border-herb-green/20 transition-all duration-300 relative overflow-hidden flex flex-col h-full">
      {/* Decorative aura on card hover */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-herb-green/5 rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 -mr-16 -mt-16 pointer-events-none" />

      {/* Wishlist toggle */}
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          handleToggleFavorite();
        }}
        className={cn(
          "absolute top-3.5 right-3.5 z-20 p-2 rounded-xl border transition-all duration-200 cursor-pointer active:scale-90",
          isFavorite
            ? "border-red-200 bg-red-50 text-red-500"
            : "border-neutral-200 bg-white hover:border-red-200 hover:text-red-500 hover:bg-red-50 text-neutral-500"
        )}
        title={isFavorite ? "Remove from Favorites" : "Add to Favorites"}
      >
        <Heart
          size={13}
          className={cn("pointer-events-none transition-colors duration-200", isFavorite ? "fill-red-500 text-red-500" : "text-neutral-500")}
        />
      </button>

      {/* Identity block */}
      <div className="flex flex-col items-center text-center relative z-10">
        <div className="relative flex-shrink-0">
          <div className={cn(
            "w-16 h-16 rounded-2xl bg-gradient-to-br flex items-center justify-center shadow-md font-display tracking-wider text-white font-extrabold text-xl transition-transform duration-300 group-hover:scale-103",
            style.gradient
          )}>
            {doctor.avatar}
          </div>
          <span className="absolute -bottom-1 -right-1 w-4.5 h-4.5 rounded-full bg-emerald-500 border-2 border-white flex items-center justify-center shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping opacity-75" />
          </span>
        </div>

        <h3 className="font-display font-extrabold text-foreground text-base leading-tight mt-3 truncate w-full group-hover:text-herb-green transition-colors">
          {doctor.name}
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5 truncate w-full font-semibold">
          {doctor.qualifications.join(", ")}
        </p>

        <div className="flex items-center gap-1.5 mt-2 flex-wrap justify-center">
          <span className={cn("text-[9px] font-extrabold tracking-widest uppercase px-2.5 py-1 rounded-full border leading-none shadow-3xs", style.bg, style.border)}>
            {doctor.discipline}
          </span>
          {doctor.isVerified && (
            <span className="inline-flex items-center gap-1 text-[9px] font-extrabold uppercase tracking-widest bg-emerald-500/8 text-emerald-700 px-2.5 py-1 rounded-full border border-emerald-500/15 shadow-2xs">
              <ShieldCheck size={10} className="stroke-[2.5]" />
              Verified
            </span>
          )}
        </div>
      </div>

      {/* Focus Area Tags — the doctor's own saved specialties */}
      <div className="flex flex-wrap gap-1.5 mt-3.5 justify-center relative z-10">
        {focusAreas.map((tag) => (
          <span
            key={tag}
            className="text-[9px] font-semibold text-neutral-600 bg-neutral-50 border border-neutral-200/50 px-2 py-0.5 rounded-lg"
          >
            {tag}
          </span>
        ))}
      </div>

      {/* Soft inner detail panel */}
      <div className="mt-4 bg-neutral-50 rounded-xl p-3.5 space-y-2.5 text-[13px] relative z-10">
        <div className="flex items-center gap-2">
          <Award size={13} className="text-muted-foreground/60 flex-shrink-0" />
          <span className="font-semibold text-foreground">{doctor.experience} yrs experience</span>
        </div>
        <div className="flex items-center gap-2">
          <Languages size={13} className="text-muted-foreground/60 flex-shrink-0" />
          <span className="font-semibold text-foreground truncate">{doctor.languages.join(", ")}</span>
        </div>
        <div className="flex items-center gap-2">
          <Building2 size={13} className="text-muted-foreground/60 flex-shrink-0" />
          {clinicName ? (
            <span className="font-semibold text-foreground truncate cursor-help" title={clinicName}>
              {clinicName}
            </span>
          ) : (
            <span className="font-semibold text-muted-foreground/70">—</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <MapPin size={13} className="text-muted-foreground/60 flex-shrink-0" />
          {fullAddress ? (
            <span className="font-semibold text-foreground truncate cursor-help" title={fullAddress}>
              {fullAddress}
            </span>
          ) : (
            <span className="font-semibold text-muted-foreground/70">—</span>
          )}
        </div>
        <div className="flex items-center justify-between pt-2 border-t border-neutral-200">
          <span className="text-[10px] uppercase text-muted-foreground font-bold tracking-wide">Fee</span>
          <span className="font-bold text-foreground font-mono">{formatCurrency(doctor.fee)}</span>
        </div>
      </div>

      {/* Consultation Modes — what the practitioner actually offers */}
      {consultModes.length > 0 && (
        <div className="flex gap-2 mt-3.5 flex-wrap justify-center relative z-10">
          {consultModes.includes("video") && (
            <span className="text-[10px] font-bold text-herb-green bg-herb-green/5 border border-herb-green/10 px-2.5 py-1 rounded-lg flex items-center gap-1.5 leading-none shadow-3xs">
              <Video size={12} />
              <span>Video Consult</span>
            </span>
          )}
          {consultModes.includes("clinic") && (
            <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2.5 py-1 rounded-lg flex items-center gap-1.5 leading-none shadow-3xs">
              <Building2 size={12} />
              <span>In-Clinic Visit</span>
            </span>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="mt-auto pt-3.5 flex flex-col gap-2 items-stretch relative z-10">
        <button onClick={goToDoctor} className="w-full py-2 rounded-full bg-herb-green hover:bg-herb-green-light active:scale-[0.98] font-bold text-xs text-white shadow-xs hover:shadow-md transition-all cursor-pointer">
          Book Appointment
        </button>
      </div>
    </div>
  );
}