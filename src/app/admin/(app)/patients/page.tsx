"use client";

import { Fragment, useState } from "react";
import { cn } from "@/lib/utils";
import { useAdminPatients, togglePatientStatusApi, createPatientApi } from "@/hooks/use-admin";

type PatientStatus = "active" | "suspended";

type CareTeamMember = {
  doctorId: string;
  name: string;
  specialty: string;
  since: string;
};

const GENDERS = ["Male", "Female", "Other"];

type FamilyMemberView = {
  id: string;
  patientId: string | null;
  full_name: string;
  relationship: string;
  genderLabel: string;
  dobLabel: string;
  age: number | null;
  phone: string;
  bloodGroup: string;
  isActive: boolean;
  careTeam: CareTeamMember[];
  totalConsults: number;
  lastVisit: string;
  lastVisitAt: string | null;
  addedLabel: string;
};

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function genderLabelOf(g?: string | null): string {
  const v = (g || "").toLowerCase();
  if (v === "m" || v === "male") return "Male";
  if (v === "f" || v === "female") return "Female";
  if (!v) return "—";
  return "Other";
}

function ageOf(dob?: string | null): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d.getTime())) return null;
  return new Date().getFullYear() - d.getFullYear();
}

function buildCareTeam(consultations: any[]): CareTeamMember[] {
  const map = new Map<string, CareTeamMember>();
  // Oldest first so "since" is the first consultation with that doctor.
  [...consultations]
    .sort((a, b) => new Date(a.session_start || a.created_at).getTime() - new Date(b.session_start || b.created_at).getTime())
    .forEach((c) => {
      const prac = Array.isArray(c.practitioner) ? c.practitioner[0] : c.practitioner;
      if (prac && !map.has(prac.id)) {
        map.set(prac.id, {
          doctorId: prac.id,
          name: prac.full_name,
          specialty: prac.disciplines?.[0] ?? "Ayurveda",
          since: formatDate(c.session_start || c.created_at),
        });
      }
    });
  return Array.from(map.values());
}

const EMPTY_FORM = {
  name: "", phone: "", email: "", dob: "", gender: "Male",
  city: "", abha: false, abhaId: "",
};

export default function AdminPatientsPage() {
  const { data: patients, loading, refetch } = useAdminPatients();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | PatientStatus>("all");
  const [selected, setSelected] = useState<any | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<"owners" | "everyone">("owners");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedMember, setSelectedMember] = useState<{ member: FamilyMemberView; owner: any } | null>(null);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-herb-green border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // Pre-process and format patients (account owners, each with family members)
  const processedPatients = (patients ?? []).map((p: any) => {
    const userObj = Array.isArray(p.user) ? p.user[0] : p.user;
    const isActive = userObj?.is_active ?? true;
    const status: PatientStatus = isActive ? "active" : "suspended";

    const careTeam = buildCareTeam(p.consultations ?? []);
    const hasAbha = p.abha ? (Array.isArray(p.abha) ? p.abha.length > 0 : !!p.abha.abha_id) : false;
    const abhaIdLabel = p.abha ? (Array.isArray(p.abha) ? p.abha[0]?.abha_id : p.abha.abha_id) : "";

    const familyMembers: FamilyMemberView[] = (p.familyMembers ?? []).map((fm: any) => ({
      id: fm.id,
      patientId: fm.patientId,
      full_name: fm.full_name,
      relationship: fm.relationship || "—",
      genderLabel: genderLabelOf(fm.gender),
      dobLabel: formatDate(fm.date_of_birth),
      age: ageOf(fm.date_of_birth),
      phone: fm.phone || "",
      bloodGroup: fm.blood_group || "",
      isActive: fm.is_active,
      careTeam: buildCareTeam(fm.consultations ?? []),
      totalConsults: (fm.consultations ?? []).length,
      lastVisit: formatDate(fm.lastVisitAt),
      lastVisitAt: fm.lastVisitAt as string | null,
      addedLabel: formatDate(fm.created_at),
    }));

    const activeFamily = familyMembers.filter((fm) => fm.isActive);
    const ownerLastVisitAt: string | null = p.lastVisitAt ?? null;
    const householdLastVisitAt = [ownerLastVisitAt, ...activeFamily.map((fm) => fm.lastVisitAt)]
      .filter(Boolean)
      .sort((a, b) => new Date(b as string).getTime() - new Date(a as string).getTime())[0] as string | undefined;

    return {
      ...p,
      genderLabel: genderLabelOf(p.gender),
      dobLabel: formatDate(p.date_of_birth),
      registeredLabel: formatDate(p.created_at),
      hasAbha,
      abhaIdLabel,
      status,
      userObj,
      careTeam,
      totalConsults: (p.consultations ?? []).length,
      lastVisit: formatDate(ownerLastVisitAt),
      familyMembers,
      activeFamily,
      householdConsults: (p.consultations ?? []).length + activeFamily.reduce((n, fm) => n + fm.totalConsults, 0),
      householdLastVisit: formatDate(householdLastVisitAt),
    };
  });

  const q = search.trim().toLowerCase();
  const matchesOwner = (p: any) =>
    !q ||
    p.full_name?.toLowerCase().includes(q) ||
    p.userObj?.mobile?.includes(q) ||
    p.userObj?.email?.toLowerCase().includes(q) ||
    p.city?.toLowerCase().includes(q);
  const matchesFamily = (fm: FamilyMemberView) =>
    !!q && (fm.full_name?.toLowerCase().includes(q) || fm.phone.includes(q) || fm.relationship.toLowerCase().includes(q));

  const filtered = processedPatients.filter((p) => {
    const matchSearch = matchesOwner(p) || p.familyMembers.some(matchesFamily);
    const matchStatus = filterStatus === "all" || p.status === filterStatus;
    return matchSearch && matchStatus;
  });

  // Flat "everyone" view: owners and family members as individual rows.
  const individuals = processedPatients
    .filter((p) => filterStatus === "all" || p.status === filterStatus)
    .flatMap((p) => [
      ...(matchesOwner(p) ? [{ kind: "owner" as const, owner: p }] : []),
      ...p.familyMembers
        .filter((fm: FamilyMemberView) => !q || matchesFamily(fm) || matchesOwner(p))
        .map((fm: FamilyMemberView) => ({ kind: "family" as const, owner: p, member: fm })),
    ]);

  const totalFamily = processedPatients.reduce((n, p) => n + p.activeFamily.length, 0);

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function toggleStatus(id: string, currentIsActive: boolean) {
    try {
      await togglePatientStatusApi(id, !currentIsActive);
      refetch();
      setSelected(null);
    } catch (err: any) {
      alert(err.message ?? "Failed to toggle status");
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await createPatientApi({
        name: form.name,
        phone: form.phone,
        email: form.email,
        dob: form.dob,
        gender: form.gender,
        city: form.city,
        abha: form.abha,
        abhaId: form.abhaId,
      });
      setForm(EMPTY_FORM);
      setShowAddForm(false);
      refetch();
    } catch (err: any) {
      alert(err.message ?? "Failed to create patient");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Patients</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {processedPatients.length} account owners · {totalFamily} family members · {processedPatients.filter((p) => p.hasAbha).length} ABHA linked
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="bg-herb-green text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-herb-green/90 transition-all active:scale-95 flex-shrink-0"
        >
          + Add Patient
        </button>
      </div>

      <div className="flex flex-wrap gap-3 mb-5">
        <input
          type="text"
          placeholder="Search owners or family members by name, phone, email, city…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-48 px-3.5 py-2 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-herb-green/20 bg-white"
        />
        <div className="flex gap-1 bg-muted rounded-xl p-1">
          {([
            { id: "owners", label: "Account owners" },
            { id: "everyone", label: "All individuals" },
          ] as const).map((v) => (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              className={cn(
                "px-3 py-1.5 text-xs font-semibold rounded-lg transition-all",
                view === v.id ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {v.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5">
          {(["all", "active", "suspended"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={cn(
                "px-3 py-2 text-xs font-semibold rounded-xl border transition-all capitalize",
                filterStatus === s
                  ? "bg-herb-green text-white border-herb-green"
                  : "border-border text-muted-foreground bg-white hover:border-herb-green/30"
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {view === "owners" ? (
      <div className="bg-white rounded-2xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-background">
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Account Owner</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Contact</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Family</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">ABHA</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">City</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Consults</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Last Visit</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((p) => {
                const familyMatch = !!q && p.familyMembers.some(matchesFamily);
                const isOpen = expanded.has(p.id) || familyMatch;
                return (
                <Fragment key={p.id}>
                <tr className="hover:bg-background transition-colors">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-sage/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-sage text-xs font-bold">{p.full_name ? p.full_name[0].toUpperCase() : "P"}</span>
                      </div>
                      <div>
                        <p className="font-medium text-foreground capitalize">{p.full_name}</p>
                        <p className="text-[10px] text-muted-foreground">{p.genderLabel} · DOB {p.dobLabel}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <p className="text-xs text-foreground">{p.userObj?.mobile || "—"}</p>
                    <p className="text-[10px] text-muted-foreground">{p.userObj?.email || "—"}</p>
                  </td>
                  <td className="px-4 py-3.5">
                    {p.familyMembers.length === 0 ? (
                      <span className="text-[10px] text-muted-foreground">None</span>
                    ) : (
                      <button
                        onClick={() => toggleExpanded(p.id)}
                        className="inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full hover:bg-indigo-100 transition-colors"
                        aria-expanded={isOpen}
                      >
                        {p.activeFamily.length} {p.activeFamily.length === 1 ? "member" : "members"}
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className={cn("transition-transform", isOpen && "rotate-180")}>
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    {p.hasAbha
                      ? <span className="text-[10px] font-semibold text-herb-green bg-herb-green/10 px-2 py-0.5 rounded-full">Linked</span>
                      : <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">Not linked</span>
                    }
                  </td>
                  <td className="px-4 py-3.5 text-xs text-foreground">{p.city ?? "—"}</td>
                  <td className="px-4 py-3.5 text-xs text-foreground">
                    <span className="font-semibold">{p.totalConsults}</span>
                    {p.householdConsults !== p.totalConsults && (
                      <span className="text-[10px] text-muted-foreground block">{p.householdConsults} household</span>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-xs text-muted-foreground">
                    {p.lastVisit}
                    {p.lastVisit === "—" && p.householdLastVisit !== "—" && (
                      <span className="text-[10px] block">Family: {p.householdLastVisit}</span>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={cn(
                      "text-[10px] font-semibold px-2.5 py-1 rounded-full capitalize",
                      p.status === "active" ? "bg-herb-green/10 text-herb-green" : "bg-red-50 text-red-600"
                    )}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <button onClick={() => setSelected(p)} className="text-[10px] font-semibold text-herb-green hover:underline">View</button>
                      <button
                        onClick={() => toggleStatus(p.id, p.userObj?.is_active ?? true)}
                        className={cn("text-[10px] font-semibold hover:underline", p.status === "active" ? "text-red-500" : "text-amber-600")}
                      >
                        {p.status === "active" ? "Suspend" : "Reinstate"}
                      </button>
                    </div>
                  </td>
                </tr>
                {isOpen && p.familyMembers.map((fm: FamilyMemberView) => (
                  <tr key={fm.id} className={cn("bg-indigo-50/30 hover:bg-indigo-50/60 transition-colors", !fm.isActive && "opacity-60")}>
                    <td className="pl-12 pr-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0">
                          <span className="text-indigo-700 text-[10px] font-bold">{fm.full_name ? fm.full_name[0].toUpperCase() : "F"}</span>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-foreground capitalize flex items-center gap-1.5">
                            {fm.full_name}
                            <span className="text-[9px] font-semibold text-indigo-700 bg-indigo-100 px-1.5 py-0.5 rounded-full capitalize">{fm.relationship}</span>
                            {!fm.isActive && <span className="text-[9px] font-semibold text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">Removed</span>}
                          </p>
                          <p className="text-[10px] text-muted-foreground">{fm.genderLabel} · {fm.age !== null ? `${fm.age} y` : "—"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs text-foreground">{fm.phone || "—"}</p>
                      <p className="text-[10px] text-muted-foreground">via {p.full_name}</p>
                    </td>
                    <td className="px-4 py-3 text-[10px] text-muted-foreground">Family member</td>
                    <td className="px-4 py-3 text-[10px] text-muted-foreground">—</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{p.city ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-foreground font-semibold">{fm.totalConsults}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{fm.lastVisit}</td>
                    <td className="px-4 py-3" />
                    <td className="px-5 py-3 text-right">
                      <button onClick={() => setSelectedMember({ member: fm, owner: p })} className="text-[10px] font-semibold text-herb-green hover:underline">View</button>
                    </td>
                  </tr>
                ))}
                </Fragment>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-5 py-12 text-center text-sm text-muted-foreground">No patients found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      ) : (
      <div className="bg-white rounded-2xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-background">
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Name</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Type</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Phone</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Account Owner</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Consults</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Last Visit</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {individuals.map((row) => row.kind === "owner" ? (
                <tr key={`o-${row.owner.id}`} className="hover:bg-background transition-colors">
                  <td className="px-5 py-3">
                    <p className="text-xs font-medium text-foreground capitalize">{row.owner.full_name}</p>
                    <p className="text-[10px] text-muted-foreground">{row.owner.genderLabel} · DOB {row.owner.dobLabel}</p>
                  </td>
                  <td className="px-4 py-3"><span className="text-[10px] font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-full">Account owner</span></td>
                  <td className="px-4 py-3 text-xs text-foreground">{row.owner.userObj?.mobile || "—"}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">—</td>
                  <td className="px-4 py-3 text-xs font-semibold text-foreground">{row.owner.totalConsults}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{row.owner.lastVisit}</td>
                  <td className="px-5 py-3 text-right">
                    <button onClick={() => setSelected(row.owner)} className="text-[10px] font-semibold text-herb-green hover:underline">View</button>
                  </td>
                </tr>
              ) : (
                <tr key={`f-${row.member.id}`} className={cn("hover:bg-background transition-colors", !row.member.isActive && "opacity-60")}>
                  <td className="px-5 py-3">
                    <p className="text-xs font-medium text-foreground capitalize">{row.member.full_name}</p>
                    <p className="text-[10px] text-muted-foreground">{row.member.genderLabel} · {row.member.age !== null ? `${row.member.age} y` : "—"}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full capitalize">Family · {row.member.relationship}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-foreground">{row.member.phone || "—"}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => setSelected(row.owner)} className="text-xs text-foreground hover:text-herb-green capitalize">{row.owner.full_name}</button>
                    <p className="text-[10px] text-muted-foreground">{row.owner.userObj?.mobile || ""}</p>
                  </td>
                  <td className="px-4 py-3 text-xs font-semibold text-foreground">{row.member.totalConsults}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{row.member.lastVisit}</td>
                  <td className="px-5 py-3 text-right">
                    <button onClick={() => setSelectedMember({ member: row.member, owner: row.owner })} className="text-[10px] font-semibold text-herb-green hover:underline">View</button>
                  </td>
                </tr>
              ))}
              {individuals.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-sm text-muted-foreground">No patients found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {/* Account owner detail modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="font-semibold text-foreground">Account Owner</h2>
              <button onClick={() => setSelected(null)} className="text-muted-foreground hover:text-foreground">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div className="px-6 py-5">
              <div className="flex items-center gap-4 mb-5">
                <div className="w-14 h-14 rounded-2xl bg-sage/20 flex items-center justify-center">
                  <span className="text-sage text-xl font-bold">{selected.full_name ? selected.full_name[0].toUpperCase() : "P"}</span>
                </div>
                <div>
                  <h3 className="font-semibold text-foreground capitalize">{selected.full_name}</h3>
                  <p className="text-sm text-muted-foreground">{selected.genderLabel} · {selected.city ?? "—"}</p>
                  {selected.hasAbha && <p className="text-xs text-herb-green mt-0.5">ABHA: {selected.abhaIdLabel}</p>}
                </div>
              </div>

              <div className="mb-5">
                {[
                  ["Phone", selected.userObj?.mobile ?? "—"],
                  ["Email", selected.userObj?.email ?? "—"],
                  ["Date of Birth", selected.dobLabel],
                  ["Registered", selected.registeredLabel],
                  ["Last Visit", selected.lastVisit],
                  ["Total Consultations", String(selected.totalConsults)],
                  ["Household Consultations", String(selected.householdConsults)],
                ].map(([label, val]) => (
                  <div key={label} className="flex justify-between text-xs py-1.5 border-b border-border last:border-0">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-medium text-foreground">{val}</span>
                  </div>
                ))}
              </div>

              {/* Family members */}
              <div className="mb-5">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Family Members · {selected.activeFamily.length}
                </h4>
                {selected.familyMembers.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">No family members added</p>
                ) : (
                  <div className="space-y-2">
                    {selected.familyMembers.map((fm: FamilyMemberView) => (
                      <button
                        key={fm.id}
                        onClick={() => { setSelectedMember({ member: fm, owner: selected }); setSelected(null); }}
                        className={cn("w-full text-left flex items-center gap-3 bg-background rounded-xl px-3 py-2.5 hover:bg-indigo-50/50 transition-colors", !fm.isActive && "opacity-60")}
                      >
                        <div className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0">
                          <span className="text-indigo-700 text-[10px] font-bold">{fm.full_name ? fm.full_name[0].toUpperCase() : "F"}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-foreground capitalize">{fm.full_name} <span className="font-normal text-muted-foreground">· {fm.relationship}</span></p>
                          <p className="text-[10px] text-muted-foreground">{fm.phone || "No phone"} · {fm.totalConsults} consults</p>
                        </div>
                        <span className="text-[10px] text-muted-foreground flex-shrink-0">{fm.isActive ? `Last: ${fm.lastVisit}` : "Removed"}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="mb-5">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Care Team · {selected.careTeam.length} {selected.careTeam.length === 1 ? "doctor" : "doctors"}
                </h4>
                {selected.careTeam.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">No doctors assigned yet</p>
                ) : (
                  <div className="space-y-2">
                    {selected.careTeam.map((d: any) => (
                      <div key={d.doctorId} className="flex items-center gap-3 bg-background rounded-xl px-3 py-2.5">
                        <div className="w-7 h-7 rounded-lg bg-herb-green/10 flex items-center justify-center flex-shrink-0">
                          <span className="text-herb-green text-[10px] font-bold">
                            {d.name.split(" ").slice(-1)[0]?.[0] ?? "D"}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-foreground">{d.name}</p>
                          <p className="text-[10px] text-muted-foreground">{d.specialty}</p>
                        </div>
                        <span className="text-[10px] text-muted-foreground flex-shrink-0">since {d.since}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setSelected(null)}
                  className="flex-1 py-2.5 border border-border rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
                >
                  Close
                </button>
                <button
                  onClick={() => toggleStatus(selected.id, selected.userObj?.is_active ?? true)}
                  className={cn(
                    "flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all",
                    selected.status === "active" ? "bg-red-50 text-red-600 hover:bg-red-100" : "bg-herb-green text-white hover:bg-herb-green/90"
                  )}
                >
                  {selected.status === "active" ? "Suspend Account" : "Reinstate Account"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Family member detail modal */}
      {selectedMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="font-semibold text-foreground">Family Member</h2>
              <button onClick={() => setSelectedMember(null)} className="text-muted-foreground hover:text-foreground">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div className="px-6 py-5">
              <div className="flex items-center gap-4 mb-5">
                <div className="w-14 h-14 rounded-2xl bg-indigo-100 flex items-center justify-center">
                  <span className="text-indigo-700 text-xl font-bold">{selectedMember.member.full_name?.[0]?.toUpperCase() ?? "F"}</span>
                </div>
                <div>
                  <h3 className="font-semibold text-foreground capitalize">{selectedMember.member.full_name}</h3>
                  <p className="text-sm text-muted-foreground capitalize">{selectedMember.member.relationship} of {selectedMember.owner.full_name}</p>
                </div>
              </div>

              <div className="mb-5">
                {[
                  ["Phone", selectedMember.member.phone || "—"],
                  ["Gender", selectedMember.member.genderLabel],
                  ["Date of Birth", selectedMember.member.dobLabel],
                  ["Blood Group", selectedMember.member.bloodGroup || "—"],
                  ["Added", selectedMember.member.addedLabel],
                  ["Last Visit", selectedMember.member.lastVisit],
                  ["Total Consultations", String(selectedMember.member.totalConsults)],
                  ["Status", selectedMember.member.isActive ? "Active" : "Removed by owner"],
                ].map(([label, val]) => (
                  <div key={label} className="flex justify-between text-xs py-1.5 border-b border-border last:border-0">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-medium text-foreground">{val}</span>
                  </div>
                ))}
              </div>

              <div className="mb-5 rounded-xl border border-border px-4 py-3">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Account Owner</p>
                <p className="text-sm font-semibold text-foreground capitalize">{selectedMember.owner.full_name}</p>
                <p className="text-xs text-muted-foreground">{selectedMember.owner.userObj?.mobile || "—"} · {selectedMember.owner.userObj?.email || "—"}</p>
              </div>

              <div className="mb-5">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Care Team · {selectedMember.member.careTeam.length}
                </h4>
                {selectedMember.member.careTeam.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">No consultations yet</p>
                ) : (
                  <div className="space-y-2">
                    {selectedMember.member.careTeam.map((d) => (
                      <div key={d.doctorId} className="flex items-center justify-between bg-background rounded-xl px-3 py-2.5">
                        <div>
                          <p className="text-xs font-semibold text-foreground">{d.name}</p>
                          <p className="text-[10px] text-muted-foreground">{d.specialty}</p>
                        </div>
                        <span className="text-[10px] text-muted-foreground">since {d.since}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setSelectedMember(null)}
                  className="flex-1 py-2.5 border border-border rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
                >
                  Close
                </button>
                <button
                  onClick={() => { setSelected(selectedMember.owner); setSelectedMember(null); }}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-herb-green text-white hover:bg-herb-green/90 transition-all"
                >
                  View Account Owner
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Patient form modal */}
      {showAddForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="font-semibold text-foreground">Add New Patient</h2>
              <button onClick={() => setShowAddForm(false)} className="text-muted-foreground hover:text-foreground">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <form onSubmit={handleAdd} className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-foreground block mb-1">Full Name</label>
                  <input
                    required
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Patient full name"
                    className="w-full px-3 py-2 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-herb-green/20"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">Phone</label>
                  <input
                    required
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    placeholder="+91 XXXXX XXXXX"
                    className="w-full px-3 py-2 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-herb-green/20"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">City</label>
                  <input
                    required
                    value={form.city}
                    onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                    placeholder="City"
                    className="w-full px-3 py-2 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-herb-green/20"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-foreground block mb-1">Email</label>
                  <input
                    required
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="patient@example.com"
                    className="w-full px-3 py-2 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-herb-green/20"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">Date of Birth</label>
                  <input
                    required
                    type="date"
                    value={form.dob}
                    onChange={(e) => setForm((f) => ({ ...f, dob: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-herb-green/20"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">Gender</label>
                  <select
                    value={form.gender}
                    onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-border rounded-xl focus:outline-none bg-white"
                  >
                    {GENDERS.map((g) => <option key={g}>{g}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">ABHA Linked?</label>
                  <div className="flex gap-2 mt-1">
                    {([true, false] as const).map((v) => (
                      <button
                        key={String(v)}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, abha: v, abhaId: v ? f.abhaId : "" }))}
                        className={cn(
                          "flex-1 py-2 rounded-xl text-xs font-semibold border transition-all",
                          form.abha === v
                            ? "bg-herb-green text-white border-herb-green"
                            : "border-border text-muted-foreground hover:border-herb-green/30"
                        )}
                      >
                        {v ? "Yes" : "No"}
                      </button>
                    ))}
                  </div>
                </div>
                {form.abha && (
                  <div className="col-span-2">
                    <label className="text-xs font-semibold text-foreground block mb-1">ABHA ID</label>
                    <input
                      required
                      value={form.abhaId}
                      onChange={(e) => setForm((f) => ({ ...f, abhaId: e.target.value }))}
                      placeholder="patient@abdm"
                      className="w-full px-3 py-2 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-herb-green/20"
                    />
                  </div>
                )}
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="flex-1 py-2.5 border border-border rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-2.5 bg-herb-green text-white rounded-xl text-sm font-semibold hover:bg-herb-green/90 transition-all disabled:opacity-60"
                >
                  {saving ? "Adding…" : "Add Patient"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
