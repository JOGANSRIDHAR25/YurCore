"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { useAdminClinics, createClinicApi as createClinic, toggleClinicActiveApi as toggleClinicActive } from "@/hooks/use-admin";

type HospitalStatus = "active" | "inactive" | "pending";
type HospitalType = "AYUSH Hospital" | "Wellness Centre" | "Panchakarma Centre" | "Homeopathy Clinic" | "Naturopathy Centre" | "Multi-specialty AYUSH";

type Hospital = {
  id: string; name: string; type: HospitalType; address: string;
  city: string; state: string; pin: string; beds: number;
  hfrId: string; phone: string; email: string;
  specialties: string[]; status: HospitalStatus; added: string;
};

const HOSPITAL_TYPES: HospitalType[] = ["AYUSH Hospital", "Wellness Centre", "Panchakarma Centre", "Homeopathy Clinic", "Naturopathy Centre", "Multi-specialty AYUSH"];
const SPECIALTY_OPTIONS = ["Ayurveda", "Homeopathy", "Yoga", "Naturopathy", "Unani", "Siddha", "Panchakarma", "Kayachikitsa"];

const STATUS_STYLE: Record<HospitalStatus, string> = {
  active: "bg-herb-green/10 text-herb-green",
  pending: "bg-amber-50 text-amber-700",
  inactive: "bg-muted text-muted-foreground",
};

const EMPTY_FORM = { name: "", type: "AYUSH Hospital" as HospitalType, address: "", city: "", state: "", pin: "", beds: "", hfrId: "", phone: "", email: "", specialties: [] as string[] };

export default function AdminHospitalsPage() {
  const { data: clinics, loading, refetch } = useAdminClinics();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | HospitalStatus>("all");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-herb-green border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const hospitals: Hospital[] = (clinics ?? []).map((c) => {
    const practitionersList = c.clinic_practitioners ?? [];
    const specialties = Array.from(new Set(
      practitionersList.flatMap((cp: any) => cp.practitioner?.disciplines ?? [])
    )) as string[];
    if (specialties.length === 0) specialties.push("General AYUSH");

    return {
      id: c.id,
      name: c.name,
      type: "Wellness Centre",
      address: c.address_line1 || "—",
      city: c.city,
      state: c.state,
      pin: c.pin_code,
      beds: 0,
      hfrId: c.hfr_id || "Pending",
      phone: c.phone || "—",
      email: "info@" + c.name.toLowerCase().replace(/\s+/g, "") + ".in",
      specialties,
      status: c.is_active ? "active" : "inactive",
      added: "Live DB",
    };
  });

  const filtered = hospitals.filter((h) => {
    const matchSearch = h.name.toLowerCase().includes(search.toLowerCase()) ||
      h.city.toLowerCase().includes(search.toLowerCase()) ||
      h.state.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "all" || h.status === filterStatus;
    return matchSearch && matchStatus;
  });

  async function toggleStatus(id: string, currentStatus: string) {
    try {
      await toggleClinicActive(id, currentStatus !== "active");
      refetch();
    } catch (err: any) {
      alert(err.message ?? "Failed to toggle status");
    }
  }

  function toggleSpecialty(sp: string) {
    setForm((f) => ({
      ...f,
      specialties: f.specialties.includes(sp)
        ? f.specialties.filter(s => s !== sp)
        : [...f.specialties, sp],
    }));
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await createClinic({
        name: form.name,
        address: form.address,
        city: form.city,
        state: form.state,
        pin: form.pin,
        hfrId: form.hfrId,
        phone: form.phone,
      });
      setForm(EMPTY_FORM);
      setShowForm(false);
      refetch();
    } catch (err: any) {
      alert(err.message ?? "Failed to create hospital/clinic");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Hospitals & Clinics</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{hospitals.length} registered · {hospitals.filter(h => h.status === "active").length} active</p>
        </div>
        <button onClick={() => setShowForm(true)} className="bg-herb-green text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-herb-green/90 transition-all active:scale-95 flex-shrink-0">
          + Add Hospital
        </button>
      </div>

      <div className="flex flex-wrap gap-3 mb-5">
        <input type="text" placeholder="Search by name, city, state…" value={search} onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-48 px-3.5 py-2 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-herb-green/20 bg-white" />
        <div className="flex gap-1.5">
          {(["all", "active", "pending", "inactive"] as const).map((s) => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={cn("px-3 py-2 text-xs font-semibold rounded-xl border transition-all capitalize",
                filterStatus === s ? "bg-herb-green text-white border-herb-green" : "border-border text-muted-foreground bg-white hover:border-herb-green/30"
              )}>
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-background">
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Hospital / Clinic</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Type</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Location</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Beds</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">HFR ID</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((h) => (
                <tr key={h.id} className="hover:bg-background transition-colors">
                  <td className="px-5 py-3.5">
                    <p className="font-medium text-foreground">{h.name}</p>
                    <p className="text-[10px] text-muted-foreground">{h.specialties.join(" · ")}</p>
                  </td>
                  <td className="px-4 py-3.5 text-xs text-muted-foreground">{h.type}</td>
                  <td className="px-4 py-3.5">
                    <p className="text-xs text-foreground">{h.city}</p>
                    <p className="text-[10px] text-muted-foreground">{h.state} · {h.pin}</p>
                  </td>
                  <td className="px-4 py-3.5 text-xs text-foreground">{h.beds}</td>
                  <td className="px-4 py-3.5 font-mono text-xs text-muted-foreground">{h.hfrId}</td>
                  <td className="px-4 py-3.5">
                    <span className={cn("text-[10px] font-semibold px-2.5 py-1 rounded-full capitalize", STATUS_STYLE[h.status])}>
                      {h.status}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <button onClick={() => toggleStatus(h.id, h.status)} className={cn("text-[10px] font-semibold hover:underline", h.status === "active" ? "text-red-500" : "text-herb-green")}>
                      {h.status === "active" ? "Deactivate" : "Activate"}
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-5 py-12 text-center text-sm text-muted-foreground">No hospitals found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="font-semibold text-foreground">Add Hospital / Clinic</h2>
              <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <form onSubmit={handleAdd} className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-foreground block mb-1">Hospital / Clinic Name</label>
                  <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Full name" className="w-full px-3 py-2 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-herb-green/20" />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-foreground block mb-1">Type</label>
                  <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as HospitalType }))} className="w-full px-3 py-2 text-sm border border-border rounded-xl focus:outline-none bg-white">
                    {HOSPITAL_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-foreground block mb-1">Address</label>
                  <input required value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="Street address" className="w-full px-3 py-2 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-herb-green/20" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">City</label>
                  <input required value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} placeholder="City" className="w-full px-3 py-2 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-herb-green/20" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">State</label>
                  <input required value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))} placeholder="State" className="w-full px-3 py-2 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-herb-green/20" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">PIN Code</label>
                  <input required value={form.pin} onChange={e => setForm(f => ({ ...f, pin: e.target.value }))} placeholder="6-digit PIN" className="w-full px-3 py-2 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-herb-green/20" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">Beds</label>
                  <input required type="number" value={form.beds} onChange={e => setForm(f => ({ ...f, beds: e.target.value }))} placeholder="0" className="w-full px-3 py-2 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-herb-green/20" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">HFR ID</label>
                  <input required value={form.hfrId} onChange={e => setForm(f => ({ ...f, hfrId: e.target.value }))} placeholder="HFR-XX-XXXX" className="w-full px-3 py-2 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-herb-green/20" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">Phone</label>
                  <input required value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+91 XXXXX XXXXX" className="w-full px-3 py-2 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-herb-green/20" />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-foreground block mb-1">Email</label>
                  <input required type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="hospital@example.com" className="w-full px-3 py-2 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-herb-green/20" />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-foreground block mb-1">Specialties</label>
                  <div className="flex flex-wrap gap-2">
                    {SPECIALTY_OPTIONS.map((sp) => (
                      <button key={sp} type="button" onClick={() => toggleSpecialty(sp)}
                        className={cn("text-xs px-3 py-1.5 rounded-full border transition-all",
                          form.specialties.includes(sp) ? "bg-herb-green text-white border-herb-green" : "border-border text-muted-foreground bg-white hover:border-herb-green/40"
                        )}>
                        {sp}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-2.5 border border-border rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 py-2.5 bg-herb-green text-white rounded-xl text-sm font-semibold hover:bg-herb-green/90 transition-all disabled:opacity-60">
                  {saving ? "Adding…" : "Add Hospital"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
