"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Video, Calendar } from "lucide-react";
import { ENABLE_VIDEO_CONSULTATION } from "@/lib/feature-flags";

export function UpcomingCarousel({ appointments }: { appointments: any[] }) {
  const [currentPage, setCurrentPage] = useState(0);
  const itemsPerPage = 3;
  const totalPages = Math.ceil(appointments.length / itemsPerPage);

  if (appointments.length === 0) return null;

  // Reset to first page if appointments change and current page is out of bounds
  if (currentPage >= totalPages && totalPages > 0) {
    setCurrentPage(0);
  }

  const currentItems = appointments.slice(currentPage * itemsPerPage, (currentPage + 1) * itemsPerPage);

  return (
    <div className="mt-8 space-y-4">
      {/* Header & Controls */}
      <div className="flex items-center justify-between">
        <h3 className="text-[13px] font-bold text-slate-500 uppercase tracking-wider">More Upcoming</h3>
        {totalPages > 1 && (
          <div className="flex items-center gap-4">
            <button
              disabled={currentPage === 0}
              onClick={() => setCurrentPage(c => c - 1)}
              className="w-7 h-7 rounded-full bg-white border border-border flex items-center justify-center text-muted-foreground disabled:opacity-40 disabled:cursor-not-allowed hover:bg-neutral-50 transition-all shadow-sm"
            >
              <ChevronLeft size={16} />
            </button>

            <div className="flex items-center gap-1.5">
              {Array.from({ length: totalPages }).map((_, i) => (
                <div
                  key={i}
                  onClick={() => setCurrentPage(i)}
                  className={cn(
                    "h-1.5 rounded-full transition-all cursor-pointer",
                    currentPage === i ? "bg-herb-green w-4" : "bg-neutral-200 w-1.5 hover:bg-neutral-300"
                  )}
                />
              ))}
            </div>

            <button
              disabled={currentPage === totalPages - 1}
              onClick={() => setCurrentPage(c => c + 1)}
              className="w-7 h-7 rounded-full bg-white border border-border flex items-center justify-center text-muted-foreground disabled:opacity-40 disabled:cursor-not-allowed hover:bg-neutral-50 transition-all shadow-sm"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>

      {/* Grid Track */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 pb-2 pt-1">
        {currentItems.map((appt) => (
          <div
            key={appt.id}
            className="bg-white rounded-2xl border border-border/80 p-4.5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all group duration-300"
          >
            <div className="flex items-start gap-3 mb-4">
              <div className="w-11 h-11 rounded-xl bg-herb-gradient flex items-center justify-center text-white font-black text-sm shadow-inner shrink-0 tracking-wider">
                {appt.initials}
              </div>
              <div className="min-w-0 pt-0.5">
                <h4 className="font-display font-extrabold text-foreground text-[14px] leading-tight truncate group-hover:text-herb-green transition-colors">{appt.doctor}</h4>
                <p className="text-[11px] text-muted-foreground font-medium truncate mt-0.5">{appt.specialty?.split("·")[0] || appt.specialty}</p>
              </div>
            </div>

            <div className="space-y-2 mb-5">
              <div className="text-[11px] text-slate-700 font-bold flex items-center gap-2 bg-slate-50/80 px-2.5 py-1.5 rounded-lg border border-slate-100">
                <span className="text-slate-400">📅</span>
                {appt.date?.split(/ · |, /)[0]}
              </div>
              <div className="text-[11px] text-slate-700 font-bold flex items-center gap-2 bg-slate-50/80 px-2.5 py-1.5 rounded-lg border border-slate-100">
                <span className="text-slate-400">🕒</span>
                {appt.date?.split(/ · |, /)[1] || "10:00 AM"}
              </div>
            </div>

            <Link href={ENABLE_VIDEO_CONSULTATION && appt.mode === "video" ? `/consult?id=${appt.consultationId || appt.id}` : "/appointments"} className="block">
              <button className="w-full py-2.5 bg-white text-herb-green text-[11px] font-extrabold rounded-xl border border-herb-green/30 hover:bg-herb-green/5 transition-all flex items-center justify-center gap-1.5 group-hover:bg-herb-green group-hover:text-white group-hover:border-herb-green shadow-sm active:scale-95 tracking-wide uppercase">
                {ENABLE_VIDEO_CONSULTATION && appt.mode === "video" ? <Video size={13} /> : <Calendar size={13} />}
                <span>{ENABLE_VIDEO_CONSULTATION && appt.mode === "video" ? "Join Session" : "View Details"}</span>
              </button>
            </Link>
          </div>
        ))}
      </div>

    </div>
  );
}