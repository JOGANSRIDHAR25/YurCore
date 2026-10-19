"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { setNavContext } from "@/lib/nav-context-client";

// ─── Types ────────────────────────────────────────────────────────────────────

type Mode    = "search" | "new" | "existing";
type NewStep = 1 | 2 | 3;
type ExStep  = 2 | 3;        // existing patient skips step 1

// ─── Registry (same source as /pro/patients) ──────────────────────────────────

type RegPatient = {
  id: string; name: string; age: number; gender: string;
  phone: string; abha: string | null; bloodGroup: string;
  prakriti: string; lastVisit: string; conditions: string;
  allergySummary: string; activeMeds: number;
};

const REGISTRY: RegPatient[] = [
  { id: "p1", name: "Rohit Kumar",     age: 32, gender: "Male",   phone: "98765 43210", abha: "rohit@abha",   bloodGroup: "B+",  prakriti: "Vata-Pitta",  lastVisit: "05 Jun 2026", conditions: "IBS (Vataja Grahani) · Anxiety",                   allergySummary: "Sulfonamides, Peanuts",    activeMeds: 6  },
  { id: "p2", name: "Meera Patel",     age: 45, gender: "Female", phone: "87654 32109", abha: "meera@abha",   bloodGroup: "A+",  prakriti: "Pitta-Kapha", lastVisit: "01 Jun 2026", conditions: "Sandhivata (Knee OA) · Hypertension",             allergySummary: "Penicillin (⚠ severe)",   activeMeds: 5  },
  { id: "p3", name: "Suresh Rao",      age: 58, gender: "Male",   phone: "76543 21098", abha: null,           bloodGroup: "O+",  prakriti: "Kapha",       lastVisit: "20 May 2026", conditions: "Psoriasis · DM2 · Hypertension",                  allergySummary: "NSAIDs (severe), Latex",  activeMeds: 6  },
  { id: "p4", name: "Kavitha Nair",    age: 29, gender: "Female", phone: "91234 56780", abha: "kavitha@abha", bloodGroup: "AB+", prakriti: "Vata-Kapha",  lastVisit: "03 Jun 2026", conditions: "PCOD · Stress / Burnout",                         allergySummary: "No known drug allergies", activeMeds: 3  },
  { id: "p5", name: "Arjun Menon",     age: 41, gender: "Male",   phone: "82345 67891", abha: "arjun@abha",   bloodGroup: "B−",  prakriti: "Pitta",       lastVisit: "28 Apr 2026", conditions: "Acid peptic disease · Migraine",                  allergySummary: "No known allergies",      activeMeds: 4  },
  { id: "p6", name: "Priya Sundaram",  age: 36, gender: "Female", phone: "73456 78902", abha: null,           bloodGroup: "O−",  prakriti: "Vata",        lastVisit: "12 May 2026", conditions: "Hypothyroidism · Hair loss",                      allergySummary: "Iodine contrast (mild)",  activeMeds: 5  },
  { id: "p7", name: "Vikram Desai",    age: 52, gender: "Male",   phone: "94567 89013", abha: "vikram@abha",  bloodGroup: "A−",  prakriti: "Kapha-Pitta", lastVisit: "18 Jan 2026", conditions: "Type 2 Diabetes · Dyslipidaemia",                 allergySummary: "No known allergies",      activeMeds: 5  },
  { id: "p8", name: "Lalitha Krishnan",age: 68, gender: "Female", phone: "65678 90124", abha: "lalitha@abha", bloodGroup: "B+",  prakriti: "Vata-Kapha",  lastVisit: "31 May 2026", conditions: "Osteoporosis · Chronic back pain",                allergySummary: "Aspirin (moderate)",      activeMeds: 6  },
];

// ─── Constants ────────────────────────────────────────────────────────────────

const GENDERS      = ["Male", "Female", "Other", "Prefer not to say"];
const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-", "Unknown"];
const AYUSH        = ["Ayurveda", "Homeopathy", "Unani", "Siddha", "Yoga & Naturopathy"];
const MODES        = [
  { value: "clinic", label: "In-Clinic", icon: "🏥", desc: "Patient is present in clinic" },
  { value: "video",  label: "Video Call", icon: "📹", desc: "Remote / telemedicine"        },
];
const PRIORITIES   = [
  { value: "normal", label: "Routine", icon: "🟢", desc: "Standard consultation"  },
  { value: "urgent", label: "Urgent",  icon: "🟡", desc: "Needs prompt attention" },
];

const EMPTY_PATIENT = { name: "", phone: "", dob: "", gender: "Male", bloodGroup: "Unknown", emergencyName: "", emergencyPhone: "" };
const EMPTY_VISIT   = { complaint: "", duration: "", mode: "clinic", system: "Ayurveda", priority: "normal", allergies: "", notes: "" };

// ─── Step config ──────────────────────────────────────────────────────────────

const NEW_STEPS      = ["Register Patient", "Visit Info", "Confirm"];
const EXISTING_STEPS = ["Patient Found",    "Visit Info", "Confirm"];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function WalkInPage() {
  const router = useRouter();

  const [mode, setMode]           = useState<Mode>("search");
  const [query, setQuery]         = useState("");
  const [selected, setSelected]   = useState<RegPatient | null>(null);
  const [step, setStep]           = useState<NewStep>(1);
  const [patient, setPatient]     = useState(EMPTY_PATIENT);
  const [visit, setVisit]         = useState(EMPTY_VISIT);
  const [starting, setStarting]   = useState(false);

  // Live search
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return REGISTRY;
    return REGISTRY.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.phone.replace(/\s/g, "").includes(q.replace(/\s/g, "")) ||
      (p.abha?.toLowerCase().includes(q) ?? false) ||
      p.conditions.toLowerCase().includes(q)
    );
  }, [query]);

  // Navigation
  function selectExisting(p: RegPatient) {
    setSelected(p);
    setVisit(v => ({ ...v, allergies: p.allergySummary === "No known drug allergies" || p.allergySummary === "No known allergies" ? "" : p.allergySummary }));
    setMode("existing");
    setStep(2);
  }

  function goNew() {
    setSelected(null);
    setMode("new");
    setStep(1);
  }

  function next() { setStep(s => Math.min(s + 1, 3) as NewStep); }
  function back() {
    if (step === 2 && mode === "existing") { setMode("search"); setStep(1); return; }
    if (step === 2 && mode === "new")      { setMode("search"); setStep(1); return; }
    setStep(s => Math.max(s - 1, 1) as NewStep);
  }

  async function startConsultation() {
    setStarting(true);

    const visitContext = {
      wc: visit.complaint, wd: visit.duration,
      wm: visit.mode, ws: visit.system, wpr: visit.priority, wa: visit.allergies,
    };

    if (mode === "existing" && selected) {
      // Existing patient: open their EMR with visit context appended
      await setNavContext("emr", { patient: selected.id, ...visitContext });
    } else {
      // New patient: full walk-in details — carried server-side instead of
      // the URL so the patient's name/phone/DOB never land in the browser
      // bar or history.
      await setNavContext("emr", {
        walkIn: "1",
        wn: patient.name, wp: patient.phone, wg: patient.gender,
        wdob: patient.dob, wbg: patient.bloodGroup,
        ...visitContext,
      });
    }

    router.push("/pro/emr");
  }

  const step1Valid  = patient.name.trim() && patient.phone.length >= 10;
  const step2Valid  = visit.complaint.trim();
  const stepLabels  = mode === "existing" ? EXISTING_STEPS : NEW_STEPS;
  const activeStep  = mode === "existing" ? step - 1 : step;   // existing: visual step 1 = data step 2

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-full bg-background px-4 sm:px-6 lg:px-8 py-8">
      <div className="max-w-xl mx-auto">

        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <Link href="/pro" className="w-8 h-8 rounded-xl border border-border flex items-center justify-center hover:bg-muted transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><polyline points="15 18 9 12 15 6"/></svg>
          </Link>
          <div>
            <h1 className="font-display text-xl font-bold text-foreground">Walk-in Patient</h1>
            <p className="text-xs text-muted-foreground">
              {mode === "search"   ? "Find an existing patient or register a new one"          :
               mode === "existing" ? `Returning patient · ${selected?.name}`                   :
                                     "New patient registration"}
            </p>
          </div>
        </div>

        {/* ── SEARCH SCREEN ────────────────────────────────────────────────── */}
        {mode === "search" && (
          <div className="space-y-4">
            {/* Search card */}
            <div className="bg-white rounded-2xl border border-border p-6">
              <h2 className="font-semibold text-foreground mb-1">Is the patient already registered?</h2>
              <p className="text-xs text-muted-foreground mb-4">Search by name, phone number, or ABHA ID</p>

              <div className="relative mb-4">
                <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
                  width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <input
                  autoFocus
                  type="text"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Rohit Kumar · 98765 43210 · rohit@abha"
                  className="w-full pl-10 pr-10 py-3 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-herb-green/20 focus:border-herb-green/50 bg-white placeholder:text-muted-foreground transition-all"
                />
                {query && (
                  <button onClick={() => setQuery("")}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                )}
              </div>

              {/* Results list */}
              <div className="space-y-2 max-h-72 overflow-y-auto -mx-1 px-1">
                {results.length === 0 ? (
                  <div className="text-center py-6">
                    <p className="text-sm font-semibold text-foreground">No match found</p>
                    <p className="text-xs text-muted-foreground mt-1">"{query}" is not in the registry</p>
                  </div>
                ) : results.map(p => (
                  <div key={p.id}
                    className="flex items-start gap-3 p-3.5 rounded-xl border border-border bg-background hover:border-herb-green/30 hover:bg-herb-green/3 transition-all group">
                    <div className="w-10 h-10 rounded-xl bg-sage/15 flex items-center justify-center flex-shrink-0">
                      <span className="font-bold text-sage">{p.name[0]}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-foreground">{p.name}</p>
                        <span className="text-xs text-muted-foreground">{p.age}y · {p.gender}</span>
                        <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{p.bloodGroup}</span>
                        {p.abha
                          ? <span className="text-[10px] text-herb-green font-semibold">ABHA ✓</span>
                          : <span className="text-[10px] text-amber-600">No ABHA</span>}
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5">+91 {p.phone}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{p.conditions}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] text-muted-foreground">Last visit: <span className="font-medium text-foreground">{p.lastVisit}</span></span>
                        {p.allergySummary !== "No known drug allergies" && p.allergySummary !== "No known allergies" && (
                          <span className="text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-full">⚠ Allergies on file</span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => selectExisting(p)}
                      className="px-3 py-1.5 text-xs font-semibold bg-herb-green/10 text-herb-green rounded-lg hover:bg-herb-green hover:text-white transition-all flex-shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 sm:opacity-100"
                    >
                      Select
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Not in system */}
            <div className="bg-white rounded-2xl border border-dashed border-border p-5 flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center flex-shrink-0">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="text-muted-foreground">
                  <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
                  <line x1="20" y1="4" x2="20" y2="10"/><line x1="17" y1="7" x2="23" y2="7"/>
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">Patient not in the system?</p>
                <p className="text-xs text-muted-foreground mt-0.5">Register them as a new patient and start consultation immediately</p>
              </div>
              <button onClick={goNew}
                className="px-4 py-2 border border-herb-green text-herb-green text-xs font-semibold rounded-xl hover:bg-herb-green hover:text-white transition-all flex-shrink-0">
                New Patient
              </button>
            </div>
          </div>
        )}

        {/* ── STEPS (new + existing) ───────────────────────────────────────── */}
        {mode !== "search" && (
          <>
            {/* Step indicator */}
            <div className="flex items-center gap-2 mb-8">
              {stepLabels.map((label, i) => {
                const stepNum  = (i + 1) as NewStep;
                const visual   = mode === "existing" ? stepNum + 1 : stepNum;   // existing: visual=2,3 = data step 2,3
                const isCurr   = visual === step;
                const isDone   = visual < step;
                const isSkip   = mode === "existing" && i === 0;                // "Patient Found" is always done

                return (
                  <div key={label} className="flex items-center gap-2 flex-1">
                    <div className={cn(
                      "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-all",
                      (isDone || isSkip) ? "bg-herb-green text-white"
                        : isCurr ? "bg-herb-green text-white ring-4 ring-herb-green/20"
                        : "bg-muted text-muted-foreground"
                    )}>
                      {(isDone || isSkip) ? (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={3}><polyline points="20 6 9 17 4 12"/></svg>
                      ) : stepNum}
                    </div>
                    <span className={cn("text-xs font-medium flex-1 hidden sm:block",
                      isCurr ? "text-foreground" : "text-muted-foreground"
                    )}>{label}</span>
                    {i < stepLabels.length - 1 && (
                      <div className={cn("h-px flex-1 sm:flex-none sm:w-4",
                        (isDone || isSkip) ? "bg-herb-green" : "bg-border"
                      )} />
                    )}
                  </div>
                );
              })}
            </div>

            {/* ── Existing patient banner ─────────────────────────────────── */}
            {mode === "existing" && selected && (
              <div className="bg-herb-green/5 border border-herb-green/20 rounded-2xl p-4 mb-5 flex items-start gap-3">
                <div className="w-11 h-11 rounded-xl bg-herb-gradient flex items-center justify-center flex-shrink-0">
                  <span className="text-white font-bold">{selected.name[0]}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-bold text-foreground">{selected.name}</p>
                    <span className="text-[10px] bg-herb-green text-white font-semibold px-2 py-0.5 rounded-full">Registered</span>
                    {selected.abha && <span className="text-[10px] text-herb-green font-semibold">ABHA ✓</span>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {selected.age}y · {selected.gender} · {selected.bloodGroup} · +91 {selected.phone}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{selected.conditions}</p>
                  {selected.allergySummary !== "No known drug allergies" && selected.allergySummary !== "No known allergies" && (
                    <p className="text-[10px] text-amber-700 mt-0.5">⚠ Allergies: {selected.allergySummary}</p>
                  )}
                </div>
                <button onClick={() => { setMode("search"); setStep(1); setSelected(null); }}
                  className="text-[11px] text-muted-foreground hover:text-foreground hover:underline flex-shrink-0 mt-0.5">
                  Change
                </button>
              </div>
            )}

            {/* ── Step 1: New patient registration ─────────────────────────── */}
            {mode === "new" && step === 1 && (
              <div className="bg-white rounded-2xl border border-border p-6 space-y-5">
                <div>
                  <h2 className="font-semibold text-foreground">Patient Information</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Enter details to create a new patient record</p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-foreground block mb-1.5">Full Name <span className="text-red-500">*</span></label>
                    <input type="text" value={patient.name} onChange={e => setPatient(p => ({ ...p, name: e.target.value }))}
                      placeholder="Patient's full name"
                      className="w-full px-3.5 py-2.5 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-herb-green/20 focus:border-herb-green/50" />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-foreground block mb-1.5">Mobile Number <span className="text-red-500">*</span></label>
                    <div className="flex">
                      <span className="px-3 py-2.5 bg-muted border border-border border-r-0 rounded-l-xl text-sm text-muted-foreground">+91</span>
                      <input type="tel" value={patient.phone}
                        onChange={e => setPatient(p => ({ ...p, phone: e.target.value.replace(/\D/g, "").slice(0, 10) }))}
                        placeholder="10-digit mobile"
                        className="flex-1 px-3.5 py-2.5 text-sm border border-border rounded-r-xl focus:outline-none focus:ring-2 focus:ring-herb-green/20 focus:border-herb-green/50" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-foreground block mb-1.5">Date of Birth</label>
                      <input type="date" value={patient.dob} onChange={e => setPatient(p => ({ ...p, dob: e.target.value }))}
                        max={new Date().toISOString().split("T")[0]}
                        className="w-full px-3.5 py-2.5 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-herb-green/20 bg-white" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-foreground block mb-1.5">Blood Group</label>
                      <select value={patient.bloodGroup} onChange={e => setPatient(p => ({ ...p, bloodGroup: e.target.value }))}
                        className="w-full px-3.5 py-2.5 text-sm border border-border rounded-xl focus:outline-none bg-white">
                        {BLOOD_GROUPS.map(bg => <option key={bg}>{bg}</option>)}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-foreground block mb-2">Gender</label>
                    <div className="flex flex-wrap gap-2">
                      {GENDERS.map(g => (
                        <button key={g} type="button" onClick={() => setPatient(p => ({ ...p, gender: g }))}
                          className={cn("px-4 py-2 rounded-xl border text-sm font-medium transition-all",
                            patient.gender === g ? "bg-herb-green text-white border-herb-green" : "border-border text-muted-foreground bg-white hover:border-herb-green/40"
                          )}>{g}</button>
                      ))}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-border">
                    <p className="text-xs font-semibold text-muted-foreground mb-3">Emergency Contact <span className="font-normal">(optional)</span></p>
                    <div className="grid grid-cols-2 gap-3">
                      <input type="text" value={patient.emergencyName} onChange={e => setPatient(p => ({ ...p, emergencyName: e.target.value }))}
                        placeholder="Contact name"
                        className="px-3.5 py-2.5 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-herb-green/20" />
                      <input type="tel" value={patient.emergencyPhone} onChange={e => setPatient(p => ({ ...p, emergencyPhone: e.target.value }))}
                        placeholder="Phone number"
                        className="px-3.5 py-2.5 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-herb-green/20" />
                    </div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button onClick={back} className="px-5 py-3 border border-border rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">← Back</button>
                  <button onClick={next} disabled={!step1Valid}
                    className={cn("flex-1 py-3 rounded-xl text-sm font-semibold transition-all",
                      step1Valid ? "bg-herb-green text-white hover:bg-herb-green/90 active:scale-95" : "bg-muted text-muted-foreground cursor-not-allowed"
                    )}>Continue to Visit Info →</button>
                </div>
              </div>
            )}

            {/* ── Step 2: Visit details ─────────────────────────────────────── */}
            {step === 2 && (
              <div className="bg-white rounded-2xl border border-border p-6 space-y-5">
                <div>
                  <h2 className="font-semibold text-foreground">Visit Details</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Chief complaint and consultation setup for today's visit</p>
                </div>

                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1.5">Chief Complaint <span className="text-red-500">*</span></label>
                  <textarea rows={3} value={visit.complaint} onChange={e => setVisit(v => ({ ...v, complaint: e.target.value }))}
                    placeholder="What brings the patient in today? Describe symptoms…"
                    className="w-full px-3.5 py-2.5 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-herb-green/20 resize-none placeholder:text-muted-foreground" />
                </div>

                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1.5">Duration of Complaint</label>
                  <input type="text" value={visit.duration} onChange={e => setVisit(v => ({ ...v, duration: e.target.value }))}
                    placeholder="e.g. 2 weeks, 3 months, since childhood"
                    className="w-full px-3.5 py-2.5 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-herb-green/20" />
                </div>

                <div>
                  <label className="text-xs font-semibold text-foreground block mb-2">Consultation Mode</label>
                  <div className="grid grid-cols-2 gap-3">
                    {MODES.map(m => (
                      <button key={m.value} type="button" onClick={() => setVisit(v => ({ ...v, mode: m.value }))}
                        className={cn("p-4 rounded-xl border text-left transition-all",
                          visit.mode === m.value ? "border-herb-green ring-1 ring-herb-green/20 bg-herb-green/5" : "border-border bg-white hover:border-herb-green/30"
                        )}>
                        <p className="text-xl mb-1">{m.icon}</p>
                        <p className="text-sm font-semibold text-foreground">{m.label}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{m.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-foreground block mb-2">Priority</label>
                  <div className="grid grid-cols-2 gap-3">
                    {PRIORITIES.map(pr => (
                      <button key={pr.value} type="button" onClick={() => setVisit(v => ({ ...v, priority: pr.value }))}
                        className={cn("p-3 rounded-xl border text-left transition-all flex items-center gap-3",
                          visit.priority === pr.value ? "border-herb-green ring-1 ring-herb-green/20 bg-herb-green/5" : "border-border bg-white hover:border-herb-green/30"
                        )}>
                        <span className="text-base">{pr.icon}</span>
                        <div>
                          <p className="text-sm font-semibold text-foreground">{pr.label}</p>
                          <p className="text-[10px] text-muted-foreground">{pr.desc}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1.5">AYUSH System</label>
                  <div className="flex flex-wrap gap-2">
                    {AYUSH.map(s => (
                      <button key={s} type="button" onClick={() => setVisit(v => ({ ...v, system: s }))}
                        className={cn("px-3 py-1.5 rounded-full border text-xs font-medium transition-all",
                          visit.system === s ? "bg-herb-green text-white border-herb-green" : "border-border text-muted-foreground bg-white hover:border-herb-green/40"
                        )}>{s}</button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1.5">
                    Allergies / Contraindications
                    {mode === "existing" && selected?.allergySummary && selected.allergySummary !== "No known drug allergies" && selected.allergySummary !== "No known allergies" && (
                      <span className="ml-2 text-[10px] text-amber-600 font-normal normal-case">pre-filled from record</span>
                    )}
                  </label>
                  <input type="text" value={visit.allergies} onChange={e => setVisit(v => ({ ...v, allergies: e.target.value }))}
                    placeholder="e.g. Penicillin, shellfish, latex (or None)"
                    className={cn("w-full px-3.5 py-2.5 text-sm border rounded-xl focus:outline-none focus:ring-2 focus:ring-herb-green/20",
                      visit.allergies && visit.allergies !== "No known drug allergies" && visit.allergies !== "No known allergies"
                        ? "border-amber-200 bg-amber-50/50"
                        : "border-border"
                    )} />
                </div>

                <div className="flex gap-3">
                  <button onClick={back} className="px-5 py-3 border border-border rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">← Back</button>
                  <button onClick={next} disabled={!step2Valid}
                    className={cn("flex-1 py-3 rounded-xl text-sm font-semibold transition-all",
                      step2Valid ? "bg-herb-green text-white hover:bg-herb-green/90 active:scale-95" : "bg-muted text-muted-foreground cursor-not-allowed"
                    )}>Review & Confirm →</button>
                </div>
              </div>
            )}

            {/* ── Step 3: Confirm ───────────────────────────────────────────── */}
            {step === 3 && (
              <div className="space-y-4">
                {/* Patient card */}
                <div className="bg-white rounded-2xl border border-border p-5">
                  <div className="flex items-center gap-4 mb-4">
                    <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0",
                      mode === "existing" ? "bg-herb-gradient" : "bg-sage/20"
                    )}>
                      <span className={cn("font-bold text-xl", mode === "existing" ? "text-white" : "text-sage")}>
                        {mode === "existing" ? selected?.name[0] : patient.name[0]}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h2 className="font-display font-bold text-foreground text-lg truncate">
                        {mode === "existing" ? selected?.name : patient.name}
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        {mode === "existing"
                          ? `+91 ${selected?.phone} · ${selected?.gender} · ${selected?.bloodGroup}`
                          : `+91 ${patient.phone} · ${patient.gender} · ${patient.bloodGroup}`}
                      </p>
                      {mode === "existing" && selected && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{selected.conditions}</p>
                      )}
                    </div>
                    <span className={cn("ml-auto text-[10px] font-semibold px-2.5 py-1 rounded-full flex-shrink-0 border",
                      mode === "existing"
                        ? "bg-herb-green/10 text-herb-green border-herb-green/20"
                        : "bg-amber-50 text-amber-700 border-amber-100"
                    )}>
                      {mode === "existing" ? "Returning Patient" : "New Patient"}
                    </span>
                  </div>

                  {/* Allergy warning */}
                  {visit.allergies && visit.allergies !== "No known drug allergies" && visit.allergies !== "No known allergies" && (
                    <div className="mb-4 flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-2.5">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="text-amber-600 flex-shrink-0">
                        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                      </svg>
                      <p className="text-xs text-amber-800"><span className="font-semibold">Allergy alert:</span> {visit.allergies}</p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3 border-t border-border pt-4">
                    {[
                      { label: "Mode",      value: `${MODES.find(m => m.value === visit.mode)?.icon} ${MODES.find(m => m.value === visit.mode)?.label}` },
                      { label: "System",    value: visit.system },
                      { label: "Priority",  value: `${PRIORITIES.find(p => p.value === visit.priority)?.icon} ${PRIORITIES.find(p => p.value === visit.priority)?.label}` },
                      { label: "Date/Time", value: new Date().toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) },
                    ].map(({ label, value }) => (
                      <div key={label}>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
                        <p className="text-sm font-medium text-foreground mt-0.5">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Chief complaint */}
                <div className="bg-ivory-deep rounded-2xl border border-border p-5">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Chief Complaint</p>
                  <p className="text-sm text-foreground leading-relaxed">{visit.complaint}</p>
                  {visit.duration && <p className="text-xs text-muted-foreground mt-1.5">Duration: {visit.duration}</p>}
                </div>

                {/* What happens next */}
                <div className="bg-herb-green/5 border border-herb-green/20 rounded-2xl p-4">
                  <p className="text-xs text-herb-green font-semibold">What happens next</p>
                  <ul className="mt-2 space-y-1">
                    {(mode === "existing"
                      ? [
                          "EMR opens with patient's full history — problems, meds, allergies, vitals",
                          "Chief complaint is pre-filled in the Subjective (S) field",
                          "All previous visit records and care team visible",
                        ]
                      : [
                          "EMR opens pre-filled with this patient's details",
                          "Chief complaint is added to the Subjective (S) field",
                          "You can diagnose and write a prescription immediately",
                        ]
                    ).map(t => (
                      <li key={t} className="text-xs text-muted-foreground flex items-start gap-1.5">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} className="text-herb-green flex-shrink-0 mt-0.5"><polyline points="20 6 9 17 4 12"/></svg>
                        {t}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="flex gap-3">
                  <button onClick={back} className="px-5 py-3 border border-border rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">← Back</button>
                  <button onClick={startConsultation} disabled={starting}
                    className="flex-1 py-3 bg-herb-green text-white rounded-xl text-sm font-bold hover:bg-herb-green/90 active:scale-95 transition-all disabled:opacity-60 flex items-center justify-center gap-2">
                    {starting
                      ? <><div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" /> Starting…</>
                      : <>{visit.mode === "video" ? "📹" : "📋"} Start Consultation</>}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
