"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/auth-context";
import { usePatientPrescriptions } from "@/hooks/use-prescriptions";
import { cn } from "@/lib/utils";
import { Clock } from "lucide-react";

const getMedicineIcon = (name: string) => {
  const n = name.toLowerCase();
  if (n.includes("churna") || n.includes("powder")) return "🫙";
  if (n.includes("ghrita") || n.includes("ghee") || n.includes("oil") || n.includes("taila")) return "💛";
  if (n.includes("vati") || n.includes("tablet") || n.includes("pill") || n.includes("30c") || n.includes("200c")) return "💊";
  if (n.includes("arishta") || n.includes("liquid") || n.includes("syrup") || n.includes("q")) return "🧪";
  return "🌿";
};

export default function PrescriptionPage() {
  const { user } = useAuth();
  const patientName = user?.name ?? "Patient";
  const patientInitials = patientName.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();
  const abhaId = user?.abhaLinked ? `${user.phone?.slice(-4) ?? ""}@abha` : null;

  const { data: rawPrescriptions, loading } = usePatientPrescriptions(user?.id);
  const prescriptions = rawPrescriptions ?? [];

  // Derived state
  const [selectedDoctorId, setSelectedDoctorId] = useState<string | null>(null);
  const [expandedRx, setExpandedRx] = useState<string | null>(null);

  // Grouping and compiling statistics
  const careTeamMap: Record<string, {
    id: string;
    name: string;
    initials: string;
    specialty: string;
    lastVisit: string;
    nextFollowUp: string;
    totalRx: number;
  }> = {};

  const prescriptionsGrouped: Record<string, typeof prescriptions> = {};

  (prescriptions || []).forEach((rx) => {
    const docId = rx.doctorName;
    if (!careTeamMap[docId]) {
      careTeamMap[docId] = {
        id: docId,
        name: rx.doctorName,
        initials: rx.doctorInitials,
        specialty: rx.specialty,
        lastVisit: rx.date,
        nextFollowUp: rx.followUpDate ? new Date(rx.followUpDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—",
        totalRx: 1,
      };
      prescriptionsGrouped[docId] = [];
    } else {
      careTeamMap[docId].totalRx += 1;
    }
    prescriptionsGrouped[docId].push(rx);
  });

  const careTeam = Object.values(careTeamMap);

  // Automatically select the first doctor when data loads
  useEffect(() => {
    if (careTeam.length > 0 && !selectedDoctorId) {
      setSelectedDoctorId(careTeam[0].id);
      const rxList = prescriptionsGrouped[careTeam[0].id] || [];
      if (rxList.length > 0) {
        setExpandedRx(rxList[0].id);
      }
    }
  }, [prescriptions, careTeam.length, selectedDoctorId]);

  const selectedDoctor = careTeam.find((d) => d.id === selectedDoctorId);
  const rxList = selectedDoctorId ? (prescriptionsGrouped[selectedDoctorId] || []) : [];

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-semibold text-foreground">My Prescriptions</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {loading ? "Loading prescriptions..." : `${careTeam.length} doctor${careTeam.length !== 1 ? "s" : ""} · ${prescriptions.length} total prescription${prescriptions.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <div className="flex gap-2">
          <button className="flex items-center gap-2 text-xs font-medium border border-border px-3 py-2 rounded-xl hover:bg-muted transition-colors">
            📥 Download All
          </button>
          <Link href="/apothecary">
            <button className="flex items-center gap-2 text-xs font-semibold bg-herb-green text-white px-4 py-2 rounded-xl hover:bg-herb-green/90 transition-colors">
              🛒 Order Medicines
            </button>
          </Link>
        </div>
      </div>

      {/* Patient card */}
      <div className="bg-white rounded-2xl border border-border p-4 mb-6 flex items-center gap-4">
        <div className="w-11 h-11 rounded-xl bg-sage/20 flex items-center justify-center flex-shrink-0">
          <span className="text-sage font-bold">{patientInitials}</span>
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">{patientName}</p>
          <p className="text-xs text-muted-foreground">+91 {user?.phone ?? "—"}</p>
        </div>
        {abhaId ? (
          <span className="text-[10px] bg-herb-green/10 text-herb-green font-semibold px-2.5 py-1 rounded-full border border-herb-green/20">ABHA Linked ✓</span>
        ) : (
          <span className="text-[10px] bg-amber-50 text-amber-700 font-semibold px-2.5 py-1 rounded-full border border-amber-100">ABHA not linked</span>
        )}
      </div>

      {loading ? (
        <div className="py-20 text-center text-sm text-muted-foreground">Loading your care team and prescriptions...</div>
      ) : prescriptions.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-border p-12 text-center">
          <span className="text-4xl">📋</span>
          <p className="font-semibold text-foreground mt-3">No prescriptions found</p>
          <p className="text-xs text-muted-foreground mt-1 mb-4">When a practitioner prescribes medicines, they will appear here</p>
          <Link href="/discover">
            <button className="px-5 py-2.5 bg-herb-green text-white text-sm font-semibold rounded-xl hover:bg-herb-green/90">
              Book a Consultation
            </button>
          </Link>
        </div>
      ) : (
        <>
          {/* Doctor selector */}
          <div className="mb-6">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Care Team — Select a doctor to view prescriptions</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {careTeam.map((doc) => (
                <button
                  key={doc.id}
                  onClick={() => {
                    setSelectedDoctorId(doc.id);
                    setExpandedRx(prescriptionsGrouped[doc.id]?.[0]?.id ?? null);
                  }}
                  className={cn(
                    "p-4 rounded-2xl border text-left transition-all",
                    selectedDoctorId === doc.id
                      ? "border-herb-green ring-1 ring-herb-green/20 bg-herb-green/5"
                      : "border-border bg-white hover:border-herb-green/30"
                  )}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 font-bold text-sm",
                      selectedDoctorId === doc.id ? "bg-herb-gradient text-white" : "bg-muted text-foreground"
                    )}>
                      {doc.initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{doc.name}</p>
                      <p className="text-xs text-muted-foreground">{doc.specialty}</p>
                    </div>
                    {selectedDoctorId === doc.id && (
                      <div className="w-2 h-2 rounded-full bg-herb-green flex-shrink-0" />
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div>
                      <p className="text-muted-foreground">Last visit</p>
                      <p className="font-medium text-foreground">{doc.lastVisit}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Follow-up</p>
                      <p className="font-medium text-herb-green">{doc.nextFollowUp}</p>
                    </div>
                  </div>
                  <div className="mt-2 pt-2 border-t border-border">
                    <span className="text-[10px] text-muted-foreground">{doc.totalRx} prescription{doc.totalRx !== 1 ? "s" : ""}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Prescriptions for selected doctor */}
          {selectedDoctor && (
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded-xl bg-herb-gradient flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-xs font-bold">{selectedDoctor.initials}</span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{selectedDoctor.name}</p>
                    <p className="text-xs text-muted-foreground">{selectedDoctor.specialty}</p>
                  </div>
                </div>

                <div className="space-y-3">
                  {rxList.map((rx, idx) => {
                    const isOpen = expandedRx === rx.id;
                    const isLatest = idx === 0;

                    // Build dynamic lifestyle advice from DB
                    const lifestyle = [];
                    if (rx.dietaryAdvice) {
                      lifestyle.push({ icon: "🥗", title: "Dietary Advice", desc: rx.dietaryAdvice });
                    }
                    let upcomingCall = null;
                    let cleanLifestyle = rx.lifestyleAdvice;

                    if (rx.lifestyleAdvice) {
                      const match = rx.lifestyleAdvice.match(/\[Upcoming Session Fixed: (.*?) at (.*?)\]/);
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
                        } catch (e) {}

                        let displayDate = date;
                        try {
                          displayDate = new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
                        } catch (e) {}

                        upcomingCall = `${displayDate} at ${displayTime}`;
                        cleanLifestyle = rx.lifestyleAdvice.replace(match[0], '').trim();
                      }
                      if (cleanLifestyle) {
                        lifestyle.push({ icon: "🌅", title: "Lifestyle Advice", desc: cleanLifestyle });
                      }
                    }
                    if (rx.physicalActivity) {
                      lifestyle.push({ icon: "🧘", title: "Physical Activity", desc: rx.physicalActivity });
                    }

                    return (
                      <div key={rx.id} className={cn("bg-white rounded-2xl border transition-all overflow-hidden", isOpen ? "border-herb-green/30 shadow-sm" : "border-border")}>
                        {/* Prescription header — always visible */}
                        <button
                          className="w-full p-5 flex items-start justify-between gap-3 text-left"
                          onClick={() => setExpandedRx(isOpen ? null : rx.id)}
                        >
                          <div className="flex items-start gap-3">
                            <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0", isLatest ? "bg-herb-green text-white" : "bg-muted text-muted-foreground")}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-semibold text-foreground">{rx.date}</p>
                                {isLatest && <span className="text-[10px] bg-herb-green text-white font-semibold px-2 py-0.5 rounded-full">Latest</span>}
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{rx.chiefComplaint ? `Complaint: ${rx.chiefComplaint}` : rx.assessment || "Routine Checkup"}</p>
                              <p className="text-[10px] text-muted-foreground mt-1">
                                {rx.items.length} formulation{rx.items.length !== 1 ? "s" : ""}
                                {rx.followUpDate ? ` · Follow-up: ${new Date(rx.followUpDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}` : ""}
                              </p>
                            </div>
                          </div>
                          <svg
                            width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                            className={cn("flex-shrink-0 text-muted-foreground transition-transform mt-0.5", isOpen ? "rotate-180" : "")}
                          >
                            <polyline points="6 9 12 15 18 9" />
                          </svg>
                        </button>

                        {/* Expanded content */}
                        {isOpen && (
                          <div className="px-5 pb-5 space-y-5 border-t border-border pt-4">
                            {/* Assessment */}
                            {rx.assessment && (
                              <div>
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Clinical Assessment</p>
                                <div className="bg-background rounded-xl p-3 border border-border">
                                  <p className="text-xs text-foreground leading-relaxed">{rx.assessment}</p>
                                </div>
                              </div>
                            )}

                            {/* Formulations */}
                            <div>
                              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Prescribed Formulations</p>
                              <div className="space-y-2.5">
                                {rx.items.map((f, i) => (
                                  <div key={i} className="flex items-start gap-3 p-3.5 bg-herb-green/4 rounded-xl border border-herb-green/15">
                                    <span className="text-xl flex-shrink-0">{getMedicineIcon(f.name)}</span>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-semibold text-foreground">{f.name}</p>
                                      <div className="flex flex-wrap gap-2 mt-1 text-xs text-muted-foreground">
                                        {f.dose && <span>💊 {f.dose}</span>}
                                        {f.frequency && <span>⏰ {f.frequency}</span>}
                                        {f.anupana && <span>🫖 {f.anupana}</span>}
                                        {f.durationDays > 0 && <span>📅 {f.durationDays} days</span>}
                                      </div>
                                      {f.instructions && (
                                        <p className="text-[10px] text-muted-foreground mt-1 italic">Note: {f.instructions}</p>
                                      )}
                                    </div>
                                    <span className="text-[10px] bg-herb-green/10 text-herb-green font-semibold px-2 py-0.5 rounded-full flex-shrink-0">Rx</span>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Lifestyle */}
                            {lifestyle.length > 0 && (
                              <div>
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Lifestyle Guidance</p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  {lifestyle.map((l) => (
                                    <div key={l.title} className="flex items-start gap-2.5 p-3 bg-background border border-border rounded-xl">
                                      <span className="text-base flex-shrink-0">{l.icon}</span>
                                      <div>
                                        <p className="text-xs font-semibold text-foreground">{l.title}</p>
                                        <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed whitespace-pre-line">{l.desc}</p>
                                      </div>
                                    </div>
                                  ))}
                                  {upcomingCall && (
                                    <div className="flex items-center justify-between p-3 bg-[#f0fdf4] border border-[#bbf7d0] rounded-xl sm:col-span-2">
                                      <div>
                                        <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider mb-1">Upcoming Session Booked</p>
                                        <p className="text-xs font-bold text-emerald-800">{upcomingCall}</p>
                                      </div>
                                      <div className="w-8 h-8 rounded-full bg-emerald-100/50 flex items-center justify-center">
                                        <Clock className="w-4 h-4 text-emerald-500" />
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Actions */}
                            <div className="flex gap-2 pt-1">
                              <button className="flex-1 py-2 text-xs border border-border rounded-xl font-medium text-muted-foreground hover:bg-muted transition-colors">📥 Download PDF</button>
                              <Link href="/apothecary" className="flex-1">
                                <button className="w-full py-2 text-xs bg-herb-green text-white rounded-xl font-semibold hover:bg-herb-green/90 transition-all">🛒 Order Medicines</button>
                              </Link>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Sidebar */}
              <div className="space-y-4">
                <div className="bg-white rounded-2xl border border-border p-5">
                  <h3 className="font-semibold text-foreground text-sm mb-3">Next Follow-ups</h3>
                  <div className="space-y-2.5">
                    {careTeam.map((doc) => (
                      <div key={doc.id} className="flex items-center gap-3 p-3 bg-herb-green/5 border border-herb-green/20 rounded-xl">
                        <div className="w-8 h-8 rounded-lg bg-herb-gradient flex items-center justify-center flex-shrink-0">
                          <span className="text-white text-[10px] font-bold">{doc.initials}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-foreground truncate">{doc.name}</p>
                          <p className="text-[10px] text-herb-green font-medium">{doc.nextFollowUp}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-border p-5">
                  <h3 className="font-semibold text-foreground text-sm mb-3">Active Medicines</h3>
                  <div className="space-y-1.5">
                    {prescriptions.flatMap((rx) =>
                      rx.items.map((item) => ({ ...item, specialty: rx.specialty }))
                    ).slice(0, 5).map((f, i) => (
                      <div key={i} className="flex items-center gap-2.5 py-1.5 border-b border-border last:border-0">
                        <span className="text-sm">{getMedicineIcon(f.name)}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-foreground truncate">{f.name}</p>
                          <p className="text-[10px] text-muted-foreground">{f.frequency} · {f.specialty}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <Link href="/apothecary" className="block mt-3">
                    <button className="w-full py-2 text-xs font-semibold bg-herb-green text-white rounded-xl hover:bg-herb-green/90 transition-all">
                      🛒 Order All Active Medicines
                    </button>
                  </Link>
                </div>

                <div className="bg-ivory-deep rounded-2xl border border-border p-4">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Disclaimer</h4>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Do not mix Ayurvedic and Homeopathic remedies within 30 minutes of each other. Avoid strong aromatic substances near homeopathic medicines.
                  </p>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
