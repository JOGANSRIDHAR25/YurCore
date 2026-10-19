"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { getNavContext, setNavContext } from "@/lib/nav-context-client";

// ─── Patient registry ─────────────────────────────────────────────────────────

type RegPatient = {
  id: string; name: string; age: number; gender: string; phone: string;
  abha: string | null; bloodGroup: string; prakriti: string;
  lastVisit: string; conditions: string;
  problems: { code: string; name: string; status: "active" | "controlled" | "resolved" }[];
  allergies: string;
  currentMeds: { name: string; dose: string; frequency: string; system: string }[];
};

const REGISTRY: RegPatient[] = [
  {
    id: "p1", name: "Rohit Kumar", age: 32, gender: "Male", phone: "98765 43210",
    abha: "rohit@abha", bloodGroup: "B+", prakriti: "Vata-Pitta",
    lastVisit: "05 Jun 2026", conditions: "IBS (Vataja Grahani) · Anxiety",
    problems: [
      { code: "GRH-V",  name: "Vataja Grahani",  status: "active"     },
      { code: "CIT-01", name: "Chittodvega",      status: "active"     },
    ],
    allergies: "Sulfonamides (moderate), Peanuts (moderate)",
    currentMeds: [
      { name: "Ashwagandha Churna", dose: "5g",     frequency: "Twice daily",  system: "Ayurveda"   },
      { name: "Triphala Churna",    dose: "3g",     frequency: "Bedtime",      system: "Ayurveda"   },
      { name: "Brahmi Ghrita",      dose: "5ml",    frequency: "Once daily",   system: "Ayurveda"   },
      { name: "Nux Vomica 30C",     dose: "4 pellets", frequency: "Twice daily", system: "Homeopathy" },
    ],
  },
  {
    id: "p2", name: "Meera Patel", age: 45, gender: "Female", phone: "87654 32109",
    abha: "meera@abha", bloodGroup: "A+", prakriti: "Pitta-Kapha",
    lastVisit: "01 Jun 2026", conditions: "Sandhivata (Knee OA) · Hypertension",
    problems: [
      { code: "SNV-01", name: "Sandhivata",         status: "active"     },
      { code: "STH-01", name: "Sthaulya",            status: "active"     },
      { code: "RKT-01", name: "Raktachapa Vriddi",   status: "controlled" },
    ],
    allergies: "Penicillin (life-threatening), Shellfish (severe)",
    currentMeds: [
      { name: "Maharasnadi Kashayam", dose: "15ml",  frequency: "Twice daily",  system: "Ayurveda"   },
      { name: "Shallaki (Boswellia)", dose: "400mg", frequency: "Thrice daily", system: "Ayurveda"   },
      { name: "Amlodipine 5mg",       dose: "5mg",   frequency: "Once daily",   system: "Allopathic" },
    ],
  },
  {
    id: "p3", name: "Suresh Rao", age: 58, gender: "Male", phone: "76543 21098",
    abha: null, bloodGroup: "O+", prakriti: "Kapha",
    lastVisit: "20 May 2026", conditions: "Psoriasis · DM2 · Hypertension",
    problems: [
      { code: "KSH-01", name: "Kushtha Roga",          status: "active"     },
      { code: "PRM-02", name: "Prameha (Madhumeha)",   status: "controlled" },
      { code: "RKT-02", name: "Raktachapa Vriddi",     status: "controlled" },
    ],
    allergies: "NSAIDs — Aspirin, Ibuprofen (severe gastric risk), Latex (moderate)",
    currentMeds: [
      { name: "Neem Capsule",       dose: "500mg", frequency: "Twice daily",  system: "Ayurveda"   },
      { name: "Khadirarishta",      dose: "20ml",  frequency: "Twice daily",  system: "Ayurveda"   },
      { name: "Telmisartan 40mg",   dose: "40mg",  frequency: "Once daily",   system: "Allopathic" },
      { name: "Metformin 500mg",    dose: "500mg", frequency: "Twice daily",  system: "Allopathic" },
    ],
  },
  {
    id: "p4", name: "Kavitha Nair",    age: 29, gender: "Female", phone: "91234 56780",
    abha: "kavitha@abha", bloodGroup: "AB+", prakriti: "Vata-Kapha",
    lastVisit: "03 Jun 2026", conditions: "PCOD · Stress / Burnout",
    problems: [
      { code: "PCOD-01", name: "PCOD",           status: "controlled" },
      { code: "STR-01",  name: "Stress/Burnout", status: "active"     },
    ],
    allergies: "No known drug allergies",
    currentMeds: [
      { name: "Shatavari Churna",   dose: "3g",   frequency: "Twice daily", system: "Ayurveda" },
      { name: "Ashoka Capsule",     dose: "500mg", frequency: "Once daily",  system: "Ayurveda" },
    ],
  },
  {
    id: "p5", name: "Arjun Menon",     age: 41, gender: "Male",   phone: "82345 67891",
    abha: "arjun@abha", bloodGroup: "B−", prakriti: "Pitta",
    lastVisit: "28 Apr 2026", conditions: "Acid peptic disease · Migraine",
    problems: [
      { code: "APD-01", name: "Amlapitta (Acid PD)",   status: "active" },
      { code: "MIG-01", name: "Shiro Roga (Migraine)",  status: "active" },
    ],
    allergies: "No known allergies",
    currentMeds: [
      { name: "Avipattikar Churna", dose: "3g",    frequency: "Before meals", system: "Ayurveda" },
      { name: "Brahmi Vati",        dose: "2 tabs", frequency: "Twice daily",  system: "Ayurveda" },
    ],
  },
  {
    id: "p6", name: "Priya Sundaram",  age: 36, gender: "Female", phone: "73456 78902",
    abha: null, bloodGroup: "O−", prakriti: "Vata",
    lastVisit: "12 May 2026", conditions: "Hypothyroidism · Hair loss",
    problems: [
      { code: "THY-01", name: "Hypothyroidism",       status: "controlled" },
      { code: "KES-01", name: "Khalitya (Hair loss)", status: "active"     },
    ],
    allergies: "Iodine contrast (mild reaction)",
    currentMeds: [
      { name: "Thyroid support (Kanchanara)", dose: "2 tabs", frequency: "Before breakfast", system: "Ayurveda" },
    ],
  },
  {
    id: "p7", name: "Vikram Desai",    age: 52, gender: "Male",   phone: "94567 89013",
    abha: "vikram@abha", bloodGroup: "A−", prakriti: "Kapha-Pitta",
    lastVisit: "18 Jan 2026", conditions: "Type 2 Diabetes · Dyslipidaemia",
    problems: [
      { code: "DM-02",  name: "Prameha (DM2)",              status: "controlled" },
      { code: "MDO-01", name: "Medovriddhi (Dyslipidaemia)", status: "controlled" },
    ],
    allergies: "No known allergies",
    currentMeds: [
      { name: "Guduchi Churna",   dose: "3g",    frequency: "Twice daily", system: "Ayurveda"   },
      { name: "Metformin 500mg",  dose: "500mg", frequency: "Twice daily", system: "Allopathic" },
    ],
  },
  {
    id: "p8", name: "Lalitha Krishnan", age: 68, gender: "Female", phone: "65678 90124",
    abha: "lalitha@abha", bloodGroup: "B+", prakriti: "Vata-Kapha",
    lastVisit: "31 May 2026", conditions: "Osteoporosis · Chronic back pain",
    problems: [
      { code: "OST-01", name: "Asthi Kshaya (Osteoporosis)", status: "active" },
      { code: "KT-01",  name: "Kati Shoola (Back pain)",     status: "active" },
    ],
    allergies: "Aspirin (moderate GI reaction)",
    currentMeds: [
      { name: "Laksha Guggulu",     dose: "2 tabs", frequency: "Twice daily", system: "Ayurveda" },
      { name: "Bala Ashwagandha",   dose: "5ml",    frequency: "Once daily",  system: "Ayurveda" },
    ],
  },
];

// ─── Medicine catalogue ───────────────────────────────────────────────────────

type Med = { name: string; system: "Ayurveda" | "Homeopathy" | "Siddha" | "Naturopathy" | "Allopathic" | "OTC" };

const MEDICINE_CATALOGUE: Med[] = [
  // Ayurveda
  { name: "Ashwagandha Churna",        system: "Ayurveda"   },
  { name: "Triphala Churna",            system: "Ayurveda"   },
  { name: "Brahmi Ghrita",              system: "Ayurveda"   },
  { name: "Brahmi Vati",                system: "Ayurveda"   },
  { name: "Shallaki (Boswellia)",       system: "Ayurveda"   },
  { name: "Kanchanara Guggulu",         system: "Ayurveda"   },
  { name: "Triphala Guggulu",           system: "Ayurveda"   },
  { name: "Maharasnadi Kashayam",       system: "Ayurveda"   },
  { name: "Dashamoola Kashayam",        system: "Ayurveda"   },
  { name: "Jeerakadyarishta",           system: "Ayurveda"   },
  { name: "Khadirarishta",              system: "Ayurveda"   },
  { name: "Arjunarishta",               system: "Ayurveda"   },
  { name: "Saraswatarishta",            system: "Ayurveda"   },
  { name: "Punarnava Mandoora",         system: "Ayurveda"   },
  { name: "Avipattikar Churna",         system: "Ayurveda"   },
  { name: "Hingwashtak Churna",         system: "Ayurveda"   },
  { name: "Panchatikta Ghrita",         system: "Ayurveda"   },
  { name: "Neem Capsule",               system: "Ayurveda"   },
  { name: "Manjishtha Extract",         system: "Ayurveda"   },
  { name: "Guduchi (Giloy) Churna",     system: "Ayurveda"   },
  { name: "Shilajit Extract",           system: "Ayurveda"   },
  { name: "Shatavari Churna",           system: "Ayurveda"   },
  { name: "Laksha Guggulu",             system: "Ayurveda"   },
  { name: "Chyavanprash",               system: "Ayurveda"   },
  { name: "Bala Ashwagandha Taila",     system: "Ayurveda"   },
  // Homeopathy
  { name: "Nux Vomica 30C",             system: "Homeopathy" },
  { name: "Passiflora Q",               system: "Homeopathy" },
  { name: "Rhus Tox 30C",               system: "Homeopathy" },
  { name: "Calcarea Carb 200C",         system: "Homeopathy" },
  { name: "Arnica Montana 30C",         system: "Homeopathy" },
  { name: "Sulphur 30C",                system: "Homeopathy" },
  { name: "Lycopodium 30C",             system: "Homeopathy" },
  { name: "Pulsatilla 30C",             system: "Homeopathy" },
  { name: "Ignatia Amara 30C",          system: "Homeopathy" },
  { name: "Graphites 30C",              system: "Homeopathy" },
  // Siddha
  { name: "Kanchanara Guggulu (Sid.)",  system: "Siddha"     },
  { name: "Kabasura Kudineer",          system: "Siddha"     },
  // Allopathic (co-management)
  { name: "Amlodipine 5mg",             system: "Allopathic" },
  { name: "Telmisartan 40mg",           system: "Allopathic" },
  { name: "Metformin 500mg",            system: "Allopathic" },
  { name: "Rosuvastatin 10mg",          system: "Allopathic" },
  { name: "Pantoprazole 40mg",          system: "Allopathic" },
  { name: "Cetirizine 10mg",            system: "Allopathic" },
  // OTC
  { name: "Vitamin D3 60k IU",          system: "OTC"        },
  { name: "Vitamin B12 1500mcg",        system: "OTC"        },
  { name: "Zinc 25mg",                  system: "OTC"        },
];

const KALPANA_OPT   = ["Churna (Powder)", "Vati (Tablet)", "Kashaya (Decoction)", "Arishta (Fermented)", "Avaleha (Confection)", "Taila (Oil)", "Ghrita (Ghee)", "Bhasma (Ash)", "Guggulu", "Capsule", "Syrup", "Tablet (Modern)"];
const FREQ_OPTIONS   = ["Pratah (Morning)", "Sayam (Evening)", "Pratah + Sayam (Twice daily)", "Trikala (Thrice daily)", "Pragbhakta (Before food)", "Adhobhakta (After food)", "Nishi (At bedtime)", "Yathakalam (As needed)"];
const ANUPANA_OPT    = ["Ushna Jala (Warm water)", "Kshira (Warm milk)", "Madhu (Honey)", "Ghrita (Ghee)", "Sheeta Jala (Plain water)", "Adhobhakta (After food)"];
const DURATION_OPT   = ["1 Saptaha (1 week)", "2 Saptaha (2 weeks)", "1 Masa (1 month)", "Ardha Masa (6 weeks)", "3 Masa (3 months)", "6 Masa (6 months)", "Nityam (Ongoing)"];

// ─── Prescription row type ────────────────────────────────────────────────────

type RxRow = {
  id: string;
  name: string;
  system: Med["system"] | "";
  dose: string;
  frequency: string;
  duration: string;
  anupana: string;
  instructions: string;
};

const emptyRow = (): RxRow => ({
  id: Date.now().toString(),
  name: "", system: "", dose: "", frequency: "Twice daily", duration: "1 month", anupana: "", instructions: "",
});

// ─── System colour helper ─────────────────────────────────────────────────────

function systemColor(s: string) {
  if (s === "Ayurveda")   return "bg-herb-green/10 text-herb-green";
  if (s === "Homeopathy") return "bg-blue-50 text-blue-700";
  if (s === "Siddha")     return "bg-amber-50 text-amber-700";
  if (s === "Allopathic") return "bg-slate-100 text-slate-700";
  if (s === "OTC")        return "bg-muted text-muted-foreground";
  return "bg-muted text-muted-foreground";
}

// ─── Medicine search cell ─────────────────────────────────────────────────────

function MedCell({ row, onChange }: { row: RxRow; onChange: (r: RxRow) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => {
    if (!row.name.trim()) return MEDICINE_CATALOGUE.slice(0, 10);
    const q = row.name.toLowerCase();
    return MEDICINE_CATALOGUE.filter(m => m.name.toLowerCase().includes(q)).slice(0, 8);
  }, [row.name]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <input
        value={row.name}
        onChange={e => { onChange({ ...row, name: e.target.value, system: "" }); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Medicine / formulation name…"
        className="w-full px-3 py-2 text-xs border border-border rounded-lg focus:outline-none focus:border-herb-green/50 bg-white"
      />
      {open && matches.length > 0 && (
        <div className="absolute left-0 right-0 top-[calc(100%+2px)] bg-white border border-border rounded-xl shadow-lg z-50 overflow-hidden max-h-48 overflow-y-auto">
          {matches.map(m => (
            <button key={m.name}
              onMouseDown={() => { onChange({ ...row, name: m.name, system: m.system }); setOpen(false); }}
              className="w-full flex items-center justify-between gap-3 px-3 py-2 text-xs hover:bg-muted transition-colors text-left">
              <span className="font-medium text-foreground">{m.name}</span>
              <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0", systemColor(m.system))}>{m.system}</span>
            </button>
          ))}
          {row.name.trim() && !MEDICINE_CATALOGUE.some(m => m.name.toLowerCase() === row.name.toLowerCase()) && (
            <button
              onMouseDown={() => { onChange({ ...row, system: "Ayurveda" }); setOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted transition-colors text-left border-t border-border text-herb-green font-semibold">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Add "{row.name}" as custom
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PrescribePage() {
  const router = useRouter();

  const [query, setQuery]         = useState("");
  const [patient, setPatient]     = useState<RegPatient | null>(null);
  const [rows, setRows]           = useState<RxRow[]>([emptyRow()]);
  const [diagnosis, setDiagnosis] = useState("");
  const [lifestyle, setLifestyle] = useState("");
  const [followUp, setFollowUp]   = useState("");
  const [notes, setNotes]         = useState("");
  const [signed, setSigned]       = useState(false);
  const [signing, setSigning]     = useState(false);

  useEffect(() => {
    getNavContext<{ patient: string }>("prescribe").then((result) => {
      if (result?.patient) {
        const preselected = REGISTRY.find(r => r.id === result.patient);
        if (preselected) setPatient(preselected);
      }
    });
  }, []);

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

  function selectPatient(p: RegPatient) {
    setPatient(p);
    setRows([emptyRow()]);
    setDiagnosis(""); setLifestyle(""); setFollowUp(""); setNotes("");
    setSigned(false);
  }

  function addRow()           { setRows(r => [...r, emptyRow()]); }
  function removeRow(id: string) { setRows(r => r.filter(x => x.id !== id)); }
  function updateRow(updated: RxRow) { setRows(r => r.map(x => x.id === updated.id ? updated : x)); }

  function sign() {
    setSigning(true);
    setTimeout(() => { setSigning(false); setSigned(true); }, 900);
  }

  const hasAllergy = patient && patient.allergies !== "No known drug allergies" && patient.allergies !== "No known allergies";
  const filledRows = rows.filter(r => r.name.trim());

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-xl font-semibold text-foreground">Write Prescription</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {patient ? `Prescribing for ${patient.name}` : "Search for a patient to begin"}
          </p>
        </div>
        {patient && (
          <div className="flex items-center gap-2">
            <button onClick={() => { setPatient(null); setQuery(""); setSigned(false); }}
              className="text-xs text-muted-foreground border border-border px-3 py-2 rounded-xl hover:bg-muted transition-colors">
              ← Change Patient
            </button>
            <button
              onClick={async () => {
                await setNavContext("emr", { patient: patient.id });
                router.push("/pro/emr");
              }}
              className="text-xs font-medium border border-border px-3 py-2 rounded-xl hover:bg-muted transition-colors"
            >
              Open Full EMR
            </button>
          </div>
        )}
      </div>

      {/* ── Patient search (no patient selected) ─────────────────────────── */}
      {!patient && (
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-2xl border border-border p-6 mb-4">
            <h2 className="font-semibold text-foreground mb-1">Find Patient</h2>
            <p className="text-xs text-muted-foreground mb-4">Search by name, phone number, ABHA ID, or diagnosis</p>

            <div className="relative mb-4">
              <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
                width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input autoFocus type="text" value={query} onChange={e => setQuery(e.target.value)}
                placeholder="Rohit Kumar · 98765 43210 · rohit@abha · IBS…"
                className="w-full pl-10 pr-10 py-3 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-herb-green/20 focus:border-herb-green/50 bg-white placeholder:text-muted-foreground transition-all" />
              {query && (
                <button onClick={() => setQuery("")} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              )}
            </div>

            <div className="space-y-2 max-h-80 overflow-y-auto">
              {results.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-6">No patients match "{query}"</p>
              ) : results.map(p => (
                <div key={p.id}
                  onClick={() => selectPatient(p)}
                  className="flex items-start gap-3 p-3.5 rounded-xl border border-border bg-background hover:border-herb-green/30 hover:bg-herb-green/3 transition-all cursor-pointer group">
                  <div className="w-10 h-10 rounded-xl bg-sage/15 flex items-center justify-center flex-shrink-0">
                    <span className="font-bold text-sage">{p.name[0]}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-foreground">{p.name}</p>
                      <span className="text-xs text-muted-foreground">{p.age}y · {p.gender} · {p.bloodGroup}</span>
                      {p.abha && <span className="text-[10px] text-herb-green font-semibold">ABHA ✓</span>}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">+91 {p.phone}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{p.conditions}</p>
                    {p.allergies !== "No known drug allergies" && p.allergies !== "No known allergies" && (
                      <p className="text-[10px] text-amber-700 mt-0.5">⚠ {p.allergies}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className="text-[10px] text-muted-foreground">{p.lastVisit}</span>
                    <span className="text-[10px] font-semibold text-herb-green opacity-0 group-hover:opacity-100 transition-opacity">Select →</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Prescription form (patient selected) ─────────────────────────── */}
      {patient && !signed && (
        <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6">

          {/* Left: Patient context */}
          <div className="space-y-4">
            {/* Patient card */}
            <div className="bg-white rounded-2xl border border-border p-4 sticky top-20">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-12 h-12 rounded-xl bg-herb-gradient flex items-center justify-center flex-shrink-0">
                  <span className="text-white font-bold text-lg">{patient.name[0]}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-foreground">{patient.name}</p>
                  <p className="text-xs text-muted-foreground">{patient.age}y · {patient.gender} · {patient.bloodGroup}</p>
                  <p className="text-xs text-muted-foreground">+91 {patient.phone}</p>
                  {patient.abha && <p className="text-[10px] text-herb-green mt-0.5">ABHA ✓ · {patient.abha}</p>}
                </div>
              </div>

              {/* Allergy warning */}
              {hasAllergy && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 mb-4">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="text-red-600 flex-shrink-0 mt-0.5">
                    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                  <div>
                    <p className="text-[10px] font-bold text-red-700 uppercase tracking-wider">Allergy alert</p>
                    <p className="text-[10px] text-red-600 mt-0.5 leading-relaxed">{patient.allergies}</p>
                  </div>
                </div>
              )}

              {/* Active problems */}
              <div className="mb-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Active Problems</p>
                <div className="space-y-1.5">
                  {patient.problems.map(pr => (
                    <div key={pr.code} className="flex items-center gap-2">
                      <div className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0",
                        pr.status === "active" ? "bg-red-400" : pr.status === "controlled" ? "bg-amber-400" : "bg-herb-green"
                      )} />
                      <span className="text-xs text-foreground flex-1 leading-snug">{pr.name}</span>
                      <span className="text-[9px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded flex-shrink-0">{pr.code}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Current medications */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Currently On</p>
                <div className="space-y-1.5">
                  {patient.currentMeds.map((m, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <div className={cn("w-1.5 h-1.5 rounded-full mt-1 flex-shrink-0",
                        m.system === "Allopathic" ? "bg-slate-400" : m.system === "Homeopathy" ? "bg-blue-400" : "bg-herb-green"
                      )} />
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold text-foreground leading-snug">{m.name}</p>
                        <p className="text-[10px] text-muted-foreground">{m.dose} · {m.frequency}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-border">
                <button
                  onClick={async () => {
                    await setNavContext("patient", { patientId: patient.id });
                    router.push("/pro/patient");
                  }}
                  className="text-[11px] text-herb-green font-semibold hover:underline"
                >
                  Full patient record →
                </button>
              </div>
            </div>
          </div>

          {/* Right: Rx form */}
          <div className="space-y-5">

            {/* Diagnosis */}
            <div className="bg-white rounded-2xl border border-border p-5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-2">Roga Vinischaya (Diagnosis)</label>
              <input type="text" value={diagnosis} onChange={e => setDiagnosis(e.target.value)}
                placeholder="e.g. Vataja Grahani — follow-up, dose escalation"
                className="w-full px-3.5 py-2.5 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-herb-green/20 focus:border-herb-green/50" />
            </div>

            {/* Medications */}
            <div className="bg-white rounded-2xl border border-border p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Aushadhi Yoga ({filledRows.length})
                </p>
                <button onClick={addRow}
                  className="flex items-center gap-1.5 text-xs text-herb-green font-semibold hover:underline">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                  Add Medicine
                </button>
              </div>

              <div className="space-y-4">
                {rows.map((row, idx) => (
                  <div key={row.id} className={cn(
                    "rounded-xl border p-4 space-y-3 transition-all",
                    row.name ? "border-herb-green/20 bg-herb-green/3" : "border-border bg-background"
                  )}>
                    <div className="flex items-start gap-2">
                      <span className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground flex-shrink-0 mt-0.5">
                        {idx + 1}
                      </span>
                      <div className="flex-1">
                        <MedCell row={row} onChange={updateRow} />
                      </div>
                      {row.system && (
                        <span className={cn("text-[10px] font-semibold px-2 py-1 rounded-full flex-shrink-0 mt-1", systemColor(row.system))}>
                          {row.system}
                        </span>
                      )}
                      {rows.length > 1 && (
                        <button onClick={() => removeRow(row.id)}
                          className="text-muted-foreground hover:text-red-500 transition-colors flex-shrink-0 mt-1">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                            <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
                          </svg>
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 ml-7">
                      <div>
                        <label className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">Dose</label>
                        <input value={row.dose} onChange={e => updateRow({ ...row, dose: e.target.value })}
                          placeholder="e.g. 5g, 2 tabs"
                          className="w-full px-2.5 py-1.5 text-xs border border-border rounded-lg focus:outline-none focus:border-herb-green/50 bg-white" />
                      </div>
                      <div>
                        <label className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">Sevana Kala</label>
                        <select value={row.frequency} onChange={e => updateRow({ ...row, frequency: e.target.value })}
                          className="w-full px-2.5 py-1.5 text-xs border border-border rounded-lg focus:outline-none bg-white">
                          {FREQ_OPTIONS.map(o => <option key={o}>{o}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">Avadhi (Duration)</label>
                        <select value={row.duration} onChange={e => updateRow({ ...row, duration: e.target.value })}
                          className="w-full px-2.5 py-1.5 text-xs border border-border rounded-lg focus:outline-none bg-white">
                          {DURATION_OPT.map(o => <option key={o}>{o}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">Anupana</label>
                        <select value={row.anupana} onChange={e => updateRow({ ...row, anupana: e.target.value })}
                          className="w-full px-2.5 py-1.5 text-xs border border-border rounded-lg focus:outline-none bg-white">
                          <option value="">—</option>
                          {ANUPANA_OPT.map(o => <option key={o}>{o}</option>)}
                        </select>
                      </div>
                    </div>

                    <div className="ml-7">
                      <input value={row.instructions} onChange={e => updateRow({ ...row, instructions: e.target.value })}
                        placeholder="Special instructions (optional)"
                        className="w-full px-2.5 py-1.5 text-xs border border-border rounded-lg focus:outline-none focus:border-herb-green/50 bg-white" />
                    </div>
                  </div>
                ))}
              </div>

              <button onClick={addRow}
                className="mt-4 w-full py-2.5 border-2 border-dashed border-border rounded-xl text-xs text-muted-foreground hover:border-herb-green/30 hover:text-herb-green hover:bg-herb-green/3 transition-all flex items-center justify-center gap-2">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Add another medicine
              </button>
            </div>

            {/* Lifestyle + notes */}
            <div className="bg-white rounded-2xl border border-border p-5 space-y-4">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-2">Pathya-Apathya & Vihara (Diet & Lifestyle)</label>
                <textarea rows={3} value={lifestyle} onChange={e => setLifestyle(e.target.value)}
                  placeholder="Pathya (favourable): warm, light foods, Moong dal, cooked vegetables…\nApathya (unfavourable): cold, raw, heavy foods, curd at night…\nVihara: Yoga, Pranayama, Abhyanga, Panchakarma recommendations…"
                  className="w-full px-3.5 py-2.5 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-herb-green/20 resize-none placeholder:text-muted-foreground" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-2">Follow-up Date</label>
                  <input type="date" value={followUp} onChange={e => setFollowUp(e.target.value)}
                    min={new Date().toISOString().split("T")[0]}
                    className="w-full px-3.5 py-2.5 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-herb-green/20 bg-white" />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-2">Notes to Patient</label>
                  <input value={notes} onChange={e => setNotes(e.target.value)}
                    placeholder="e.g. Avoid cold foods, report if rash develops"
                    className="w-full px-3.5 py-2.5 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-herb-green/20" />
                </div>
              </div>
            </div>

            {/* Preview + Sign */}
            {filledRows.length > 0 && (
              <div className="bg-ivory-deep rounded-2xl border border-border p-5">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Prescription Preview</p>
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <rect x="5" y="2" width="14" height="20" rx="2"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="16" x2="12" y2="16"/>
                    </svg>
                    Digital Rx · ABDM linked
                  </div>
                </div>

                <div className="space-y-2 mb-4">
                  {filledRows.map((r, i) => (
                    <div key={r.id} className="flex items-start gap-3 py-2 border-b border-border last:border-0">
                      <span className="text-[10px] font-bold text-muted-foreground w-4 flex-shrink-0 mt-0.5">{i + 1}.</span>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-foreground">{r.name}</span>
                          {r.system && <span className={cn("text-[9px] font-semibold px-1.5 py-0.5 rounded-full", systemColor(r.system))}>{r.system}</span>}
                        </div>
                        <span className="text-[10px] text-muted-foreground">
                          {[r.dose, r.frequency, r.duration, r.anupana ? `with ${r.anupana}` : ""].filter(Boolean).join(" · ")}
                        </span>
                        {r.instructions && <p className="text-[10px] text-muted-foreground italic mt-0.5">{r.instructions}</p>}
                      </div>
                    </div>
                  ))}
                </div>

                {diagnosis && (
                  <p className="text-xs text-muted-foreground mb-2">
                    <span className="font-semibold text-foreground">Dx:</span> {diagnosis}
                  </p>
                )}
                {followUp && (
                  <p className="text-xs text-muted-foreground mb-4">
                    <span className="font-semibold text-foreground">Follow-up:</span> {new Date(followUp).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                  </p>
                )}

                <div className="flex gap-3">
                  <button onClick={sign} disabled={signing || !diagnosis.trim()}
                    className={cn("flex-1 py-3 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2",
                      diagnosis.trim()
                        ? "bg-herb-green text-white hover:bg-herb-green/90 active:scale-95"
                        : "bg-muted text-muted-foreground cursor-not-allowed"
                    )}>
                    {signing
                      ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Signing…</>
                      : <>✍️ Sign &amp; Save Prescription</>}
                  </button>
                  <button className="px-4 py-3 border border-border rounded-xl text-xs font-medium text-muted-foreground hover:bg-muted transition-colors">
                    📥 Save Draft
                  </button>
                </div>
                {!diagnosis.trim() && (
                  <p className="text-[10px] text-muted-foreground mt-2 text-center">Add a diagnosis to enable signing</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Signed confirmation ────────────────────────────────────────────── */}
      {patient && signed && (
        <div className="max-w-md mx-auto text-center py-12">
          <div className="w-16 h-16 rounded-full bg-herb-green/10 flex items-center justify-center mx-auto mb-5">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="text-herb-green" strokeLinecap="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <h2 className="font-display text-xl font-bold text-foreground">Prescription Signed</h2>
          <p className="text-sm text-muted-foreground mt-2">
            Saved to {patient.name}'s record
            {patient.abha && " and uploaded to ABHA health locker"}
          </p>
          {patient.abha && (
            <span className="inline-flex items-center gap-1.5 mt-2 text-xs text-herb-green font-medium bg-herb-green/10 px-3 py-1 rounded-full">
              ✓ ABDM synced
            </span>
          )}

          {/* Summary */}
          <div className="mt-6 bg-white rounded-2xl border border-border p-5 text-left">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Prescription Summary</p>
            <div className="space-y-2">
              {filledRows.map((r, i) => (
                <div key={r.id} className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">{i + 1}.</span>
                  <span className="font-semibold text-foreground">{r.name}</span>
                  <span className="text-muted-foreground">{r.dose} · {r.frequency}</span>
                </div>
              ))}
            </div>
            {followUp && (
              <p className="text-xs text-muted-foreground mt-3 pt-3 border-t border-border">
                Follow-up: <span className="font-semibold text-foreground">{new Date(followUp).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span>
              </p>
            )}
          </div>

          <div className="flex gap-3 mt-6 justify-center">
            <button onClick={() => { setSigned(false); setRows([emptyRow()]); setDiagnosis(""); setLifestyle(""); setFollowUp(""); setNotes(""); }}
              className="px-5 py-2.5 bg-herb-green text-white rounded-xl text-sm font-semibold hover:bg-herb-green/90 transition-all">
              Write Another Rx
            </button>
            <button onClick={() => { setPatient(null); setQuery(""); setSigned(false); }}
              className="px-5 py-2.5 border border-border rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted transition-all">
              New Patient
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
