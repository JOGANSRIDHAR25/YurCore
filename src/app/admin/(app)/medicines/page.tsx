"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { MedicineRow } from "./type";

type MedStatus = "active" | "inactive" | "low_stock";
type Category = "Churna" | "Capsule" | "Tablet" | "Ghrita" | "Syrup" | "Oil" | "Juice" | "Cream" | "Drop";

type Medicine = {
  id: string; name: string; brand: string; category: Category;
  description: string; price: number; stock: number; unit: string;
  discipline: string; status: MedStatus; sku: string; added: string;
};

const CATEGORIES: Category[] = ["Churna", "Capsule", "Tablet", "Ghrita", "Syrup", "Oil", "Juice", "Cream", "Drop"];
const DISCIPLINES = ["Ayurveda", "Homeopathy", "Unani", "Siddha", "Naturopathy"];

const STATUS_STYLE: Record<MedStatus, string> = {
  active: "bg-herb-green/10 text-herb-green",
  low_stock: "bg-amber-50 text-amber-700",
  inactive: "bg-red-50 text-red-600",
};

const STATUS_LABEL: Record<MedStatus, string> = {
  active: "Active",
  low_stock: "Low Stock",
  inactive: "Inactive",
};

const EMPTY_FORM = { name: "", brand: "", category: "Churna" as Category, description: "", price: "100", stock: "100", unit: "", discipline: "Ayurveda", sku: "" };

async function fetchAdminMedicines(): Promise<MedicineRow[]> {
  const response = await fetch("/api/medicines/admin", { method: "GET", credentials: "include", cache: "no-store" });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.error || "Unable to load medicines");
  }
  return result.data as MedicineRow[];
}

async function createMedicine(m: { name: string; generic_name?: string; brand?: string; discipline: string; category: string; standard_dose?: string; price_paise?: number }): Promise<void> {
  const response = await fetch("/api/medicines/admin", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(m),
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.error || "Unable to create medicine");
  }
}

async function updateMedicine(id: string, m: { name: string; generic_name?: string; brand?: string; discipline: string; category: string; standard_dose?: string; price_paise?: number }): Promise<void> {
  const response = await fetch(`/api/medicines/admin/${id}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(m),
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.error || "Unable to update medicine");
  }
}

async function toggleMedicineActive(id: string, isActive: boolean): Promise<void> {
  const response = await fetch(`/api/medicines/admin/${id}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "toggleActive", isActive }),
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.error || "Unable to toggle medicine status");
  }
}

export default function AdminMedicinesPage() {
  const [rawMedicines, setRawMedicines] = useState<MedicineRow[]>([]);
  const [loading, setLoading] = useState(true);

  async function refetch(): Promise<void> {
    try {
      setLoading(true);
      const data = await fetchAdminMedicines();
      setRawMedicines(data);
    } catch (err) {
      console.error("Failed to load medicines:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refetch();
  }, []);

  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<Medicine | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-herb-green border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const medicines: Medicine[] = (rawMedicines ?? []).map((m) => ({
    id: m.id,
    name: m.name,
    brand: m.generic_name || "Standard",
    category: (m.category as Category) || "Churna",
    description: m.generic_name ? `Generic: ${m.generic_name}. Standard Dose: ${m.standard_dose || "As directed"}` : `Standard Dose: ${m.standard_dose || "As directed"}`,
    price: 100,
    stock: 100,
    unit: m.standard_dose || "1 unit",
    discipline: m.discipline,
    status: m.is_active ? "active" : "inactive",
    sku: `MVA-${m.id.substring(0, 4).toUpperCase()}`,
    added: "Live DB",
  }));

  const filtered = medicines.filter((m) => {
    const matchSearch = m.name.toLowerCase().includes(search.toLowerCase()) ||
      m.brand.toLowerCase().includes(search.toLowerCase()) ||
      m.sku.toLowerCase().includes(search.toLowerCase());
    const matchCat = filterCat === "all" || m.category === filterCat;
    return matchSearch && matchCat;
  });

  function openAdd() { setForm(EMPTY_FORM); setEditItem(null); setShowForm(true); }
  
  function openEdit(m: Medicine) {
    const rawMed = rawMedicines?.find((r) => r.id === m.id);
    setForm({
      name: m.name,
      brand: rawMed?.generic_name || "",
      category: m.category,
      description: m.description,
      price: String(m.price),
      stock: String(m.stock),
      unit: rawMed?.standard_dose || "",
      discipline: m.discipline,
      sku: m.sku
    });
    setEditItem(m);
    setShowForm(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (editItem) {
        await updateMedicine(editItem.id, {
          name: form.name,
          generic_name: form.brand,
          discipline: form.discipline,
          category: form.category,
          standard_dose: form.unit,
        });
      } else {
        await createMedicine({
          name: form.name,
          generic_name: form.brand,
          discipline: form.discipline,
          category: form.category,
          standard_dose: form.unit,
        });
      }
      setShowForm(false);
      refetch();
    } catch (err: any) {
      alert(err.message ?? "Failed to save medicine");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(id: string, currentStatus: string) {
    try {
      await toggleMedicineActive(id, currentStatus !== "active");
      refetch();
    } catch (err: any) {
      alert(err.message ?? "Failed to toggle status");
    }
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Medicines & Apothecary</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{medicines.length} products · {medicines.filter(m => m.status === "low_stock").length} low stock · {medicines.filter(m => m.status === "inactive").length} out of stock</p>
        </div>
        <button onClick={openAdd} className="bg-herb-green text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-herb-green/90 transition-all active:scale-95 flex-shrink-0">
          + Add Medicine
        </button>
      </div>

      <div className="flex flex-wrap gap-3 mb-5">
        <input type="text" placeholder="Search by name, brand, SKU…" value={search} onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-48 px-3.5 py-2 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-herb-green/20 bg-white" />
        <select value={filterCat} onChange={e => setFilterCat(e.target.value)} className="px-3 py-2 text-sm border border-border rounded-xl focus:outline-none bg-white text-foreground">
          <option value="all">All Categories</option>
          {CATEGORIES.map(c => <option key={c}>{c}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-2xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-background">
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Medicine</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Category</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Price</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Stock</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">SKU</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((m) => (
                <tr key={m.id} className="hover:bg-background transition-colors">
                  <td className="px-5 py-3.5">
                    <p className="font-medium text-foreground">{m.name}</p>
                    <p className="text-[10px] text-muted-foreground">{m.brand} · {m.unit}</p>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="text-xs bg-copper/10 text-copper px-2 py-0.5 rounded-full font-medium">{m.category}</span>
                  </td>
                  <td className="px-4 py-3.5 text-sm font-semibold text-foreground">₹{m.price}</td>
                  <td className="px-4 py-3.5">
                    <span className={cn("text-xs font-semibold", m.stock === 0 ? "text-red-500" : m.stock < 20 ? "text-amber-600" : "text-foreground")}>
                      {m.stock} units
                    </span>
                  </td>
                  <td className="px-4 py-3.5 font-mono text-xs text-muted-foreground">{m.sku}</td>
                  <td className="px-4 py-3.5">
                    <span className={cn("text-[10px] font-semibold px-2.5 py-1 rounded-full", STATUS_STYLE[m.status])}>
                      {STATUS_LABEL[m.status]}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <button onClick={() => openEdit(m)} className="text-[10px] font-semibold text-herb-green hover:underline">Edit</button>
                      <button onClick={() => toggleActive(m.id, m.status)} className={cn("text-[10px] font-semibold hover:underline", m.status === "active" ? "text-red-500" : "text-amber-600")}>
                        {m.status === "active" ? "Disable" : "Enable"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-5 py-12 text-center text-sm text-muted-foreground">No medicines found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="font-semibold text-foreground">{editItem ? "Edit Medicine" : "Add Medicine"}</h2>
              <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <form onSubmit={handleSave} className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-foreground block mb-1">Medicine Name</label>
                  <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Ashwagandha Churna" className="w-full px-3 py-2 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-herb-green/20" />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-foreground block mb-1">Generic Name / Brand</label>
                  <input required value={form.brand} onChange={e => setForm(f => ({ ...f, brand: e.target.value }))} placeholder="e.g. Withania somnifera" className="w-full px-3 py-2 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-herb-green/20" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">Category</label>
                  <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value as Category }))} className="w-full px-3 py-2 text-sm border border-border rounded-xl focus:outline-none bg-white">
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">Discipline</label>
                  <select value={form.discipline} onChange={e => setForm(f => ({ ...f, discipline: e.target.value }))} className="w-full px-3 py-2 text-sm border border-border rounded-xl focus:outline-none bg-white">
                    {DISCIPLINES.map(d => <option key={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">Standard Dose / Unit</label>
                  <input required value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} placeholder="e.g. 5g, 1 capsule" className="w-full px-3 py-2 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-herb-green/20" />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-2.5 border border-border rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 py-2.5 bg-herb-green text-white rounded-xl text-sm font-semibold hover:bg-herb-green/90 transition-all disabled:opacity-60">
                  {saving ? "Saving…" : editItem ? "Save Changes" : "Add Medicine"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
