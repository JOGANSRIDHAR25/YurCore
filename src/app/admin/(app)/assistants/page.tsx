"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { apiClient } from "@/shared/api/api-client";
import { useQuery } from "@/hooks/useQuery";
import { toast } from "react-hot-toast";
import { Mail, Phone, ShieldCheck, UserCheck } from "lucide-react";

type AssistantStatus = "pending" | "approved" | "rejected" | "suspended";

type AdminAssistant = {
  id: string;
  fullName: string;
  status: AssistantStatus;
  rejectionReason: string | null;
  createdAt: string;
  email: string | null;
  phone: string | null;
  doctorName: string | null;
  doctorEmail: string | null;
};

type DoctorSearchResult = {
  id: string;
  fullName: string;
  email: string;
  specializations: string[];
};

const STATUS_STYLE: Record<AssistantStatus, string> = {
  approved: "bg-herb-green/10 text-herb-green",
  pending: "bg-amber-50 text-amber-700",
  rejected: "bg-red-50 text-red-600",
  suspended: "bg-slate-100 text-slate-600",
};

const EMPTY_FORM = { fullName: "", email: "", phone: "" };

function useAdminAssistants(query: string) {
  return useQuery<AdminAssistant[]>(
    () =>
      apiClient<{ data: AdminAssistant[] }>("/api/admin/assistants", { params: { q: query || undefined } }).then(
        (r) => r.data
      ),
    [query]
  );
}

async function updateAssistantStatus(id: string, status: AssistantStatus, reason?: string): Promise<void> {
  await apiClient(`/api/admin/assistants/${id}`, {
    method: "POST",
    body: JSON.stringify({ status, reason }),
  });
}

export default function AdminAssistantsPage() {
  const [search, setSearch] = useState("");
  const { data: assistants, loading, refetch } = useAdminAssistants(search);

  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [doctorQuery, setDoctorQuery] = useState("");
  const [doctorResults, setDoctorResults] = useState<DoctorSearchResult[]>([]);
  const [selectedDoctor, setSelectedDoctor] = useState<DoctorSearchResult | null>(null);
  const [searchingDoctors, setSearchingDoctors] = useState(false);

  const [rejecting, setRejecting] = useState<AdminAssistant | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!showAddForm || doctorQuery.trim().length < 2) {
      setDoctorResults([]);
      return;
    }
    let active = true;
    setSearchingDoctors(true);
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/practitioners/search?q=${encodeURIComponent(doctorQuery.trim())}`, {
          cache: "no-store",
        });
        const data = await res.json().catch(() => null);
        if (active) setDoctorResults(res.ok ? data?.data ?? [] : []);
      } catch {
        if (active) setDoctorResults([]);
      } finally {
        if (active) setSearchingDoctors(false);
      }
    }, 300);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [doctorQuery, showAddForm]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-herb-green border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const rows = assistants ?? [];
  const pendingCount = rows.filter((a) => a.status === "pending").length;

  function closeAddForm() {
    setShowAddForm(false);
    setForm(EMPTY_FORM);
    setDoctorQuery("");
    setDoctorResults([]);
    setSelectedDoctor(null);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedDoctor) {
      toast.error("Please search for and select the doctor this assistant works for");
      return;
    }
    setSaving(true);
    try {
      await apiClient("/api/admin/assistants", {
        method: "POST",
        body: JSON.stringify({
          fullName: form.fullName,
          email: form.email,
          phone: form.phone,
          practitionerId: selectedDoctor.id,
        }),
      });
      toast.success("Assistant created");
      closeAddForm();
      refetch();
    } catch (err: any) {
      toast.error(err.message ?? "Failed to create assistant");
    } finally {
      setSaving(false);
    }
  }

  async function handleApprove(a: AdminAssistant) {
    if (!confirm(`Approve ${a.fullName} to assist ${a.doctorName ?? "their doctor"}?`)) return;
    setBusyId(a.id);
    try {
      await updateAssistantStatus(a.id, "approved");
      toast.success(`${a.fullName} approved`);
      refetch();
    } catch (err: any) {
      toast.error(err.message ?? "Failed to approve assistant");
    } finally {
      setBusyId(null);
    }
  }

  async function handleSuspend(a: AdminAssistant) {
    if (
      !confirm(
        `Suspend ${a.fullName}? They will immediately lose access to ${a.doctorName ?? "the"} practitioner dashboard. You can reactivate them later if they rejoin.`
      )
    )
      return;
    setBusyId(a.id);
    try {
      await updateAssistantStatus(a.id, "suspended");
      toast.success(`${a.fullName} suspended`);
      refetch();
    } catch (err: any) {
      toast.error(err.message ?? "Failed to suspend assistant");
    } finally {
      setBusyId(null);
    }
  }

  async function handleReactivate(a: AdminAssistant) {
    if (!confirm(`Restore ${a.fullName}'s access?`)) return;
    setBusyId(a.id);
    try {
      await updateAssistantStatus(a.id, "approved");
      toast.success(`${a.fullName} reactivated`);
      refetch();
    } catch (err: any) {
      toast.error(err.message ?? "Failed to reactivate assistant");
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject(e: React.FormEvent) {
    e.preventDefault();
    if (!rejectionReason.trim()) {
      toast.error("Please specify a reason for rejection");
      return;
    }
    try {
      await updateAssistantStatus(rejecting!.id, "rejected", rejectionReason);
      toast.success("Assistant request rejected");
      setRejecting(null);
      setRejectionReason("");
      refetch();
    } catch (err: any) {
      toast.error(err.message ?? "Failed to reject assistant");
    }
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Assistants</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {rows.length} total{pendingCount > 0 && ` · ${pendingCount} pending approval`}
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="bg-herb-green text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-herb-green/90 transition-all active:scale-95 flex-shrink-0"
        >
          + Add Assistant
        </button>
      </div>

      <div className="flex flex-wrap gap-3 mb-5">
        <input
          type="text"
          placeholder="Search by assistant name, email, or doctor…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-48 px-3.5 py-2 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-herb-green/20 bg-white"
        />
      </div>

      <div className="bg-white rounded-2xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-background">
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Assistant</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Contact</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Doctor</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((a) => (
                <tr key={a.id} className="hover:bg-background transition-colors">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-copper/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-copper text-xs font-bold">
                          {a.fullName?.split(" ").slice(-1)[0]?.[0] ?? "A"}
                        </span>
                      </div>
                      <p className="font-medium text-foreground">{a.fullName}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <p className="text-xs text-foreground flex items-center gap-1"><Mail size={11} /> {a.email || "—"}</p>
                    {a.phone && (
                      <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5"><Phone size={10} /> {a.phone}</p>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    <p className="text-xs text-foreground">{a.doctorName ?? "—"}</p>
                    <p className="text-[10px] text-muted-foreground">{a.doctorEmail ?? ""}</p>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={cn("text-[10px] font-semibold px-2.5 py-1 rounded-full capitalize", STATUS_STYLE[a.status])}>
                      {a.status}
                    </span>
                    {(a.status === "rejected" || a.status === "suspended") && a.rejectionReason && (
                      <p className="text-[10px] text-red-500 mt-1 italic max-w-[180px] break-words">&quot;{a.rejectionReason}&quot;</p>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {a.status === "pending" && (
                        <>
                          <button
                            disabled={busyId === a.id}
                            onClick={() => handleApprove(a)}
                            className="text-[10px] font-semibold text-herb-green hover:underline disabled:opacity-60"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => setRejecting(a)}
                            className="text-[10px] font-semibold text-red-500 hover:underline"
                          >
                            Reject
                          </button>
                        </>
                      )}
                      {a.status === "approved" && (
                        <button
                          disabled={busyId === a.id}
                          onClick={() => handleSuspend(a)}
                          className="text-[10px] font-semibold text-amber-600 hover:underline disabled:opacity-60"
                        >
                          Suspend
                        </button>
                      )}
                      {a.status === "suspended" && (
                        <button
                          disabled={busyId === a.id}
                          onClick={() => handleReactivate(a)}
                          className="text-[10px] font-semibold text-herb-green hover:underline disabled:opacity-60"
                        >
                          Reactivate
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-16 text-center">
                    <UserCheck className="mx-auto text-muted-foreground/40" size={32} />
                    <p className="text-sm text-muted-foreground mt-3">No assistants found</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reject dialog */}
      {rejecting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="font-semibold text-foreground flex items-center gap-2 text-red-600">
                <ShieldCheck className="text-red-500" size={18} /> Reject Assistant Request
              </h2>
              <button onClick={() => setRejecting(null)} className="text-muted-foreground hover:text-foreground">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleReject} className="px-6 py-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-foreground block mb-2">Rejection Reason</label>
                <textarea
                  required
                  rows={4}
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Let them know why this request was declined…"
                  className="w-full px-3.5 py-2.5 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500/50 bg-white placeholder:text-muted-foreground transition-all resize-none"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setRejecting(null)}
                  className="flex-1 py-2.5 border border-border rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 transition-all"
                >
                  Reject Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add assistant modal */}
      {showAddForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="font-semibold text-foreground">Add New Assistant</h2>
              <button onClick={closeAddForm} className="text-muted-foreground hover:text-foreground">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleAdd} className="px-6 py-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-foreground block mb-1">Full Name</label>
                <input
                  required
                  value={form.fullName}
                  onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
                  placeholder="Assistant full name"
                  className="w-full px-3 py-2 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-herb-green/20"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-foreground block mb-1">Email</label>
                <input
                  required
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="assistant@example.com"
                  className="w-full px-3 py-2 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-herb-green/20"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-foreground block mb-1">Phone</label>
                <input
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="10-digit number"
                  className="w-full px-3 py-2 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-herb-green/20"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground block mb-1">Doctor this assistant works for</label>
                {selectedDoctor ? (
                  <div className="flex items-center justify-between rounded-xl border border-herb-green/40 bg-herb-green/5 px-3.5 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{selectedDoctor.fullName}</p>
                      <p className="truncate text-xs text-muted-foreground">{selectedDoctor.email}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedDoctor(null);
                        setDoctorQuery("");
                      }}
                      className="ml-2 flex-shrink-0 text-xs font-medium text-herb-green hover:underline"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <input
                      type="text"
                      value={doctorQuery}
                      onChange={(e) => setDoctorQuery(e.target.value)}
                      placeholder="Search by doctor name or email"
                      className="w-full px-3 py-2 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-herb-green/20"
                    />
                    {(searchingDoctors || doctorResults.length > 0) && doctorQuery.trim().length >= 2 && (
                      <div className="absolute z-10 mt-1.5 max-h-56 w-full overflow-y-auto rounded-xl border border-border bg-white shadow-lg">
                        {searchingDoctors ? (
                          <p className="px-3.5 py-2.5 text-xs text-muted-foreground">Searching…</p>
                        ) : doctorResults.length === 0 ? (
                          <p className="px-3.5 py-2.5 text-xs text-muted-foreground">No verified doctors found.</p>
                        ) : (
                          doctorResults.map((doc) => (
                            <button
                              key={doc.id}
                              type="button"
                              onClick={() => {
                                setSelectedDoctor(doc);
                                setDoctorResults([]);
                              }}
                              className="block w-full px-3.5 py-2.5 text-left text-sm hover:bg-muted transition-colors"
                            >
                              <p className="font-medium text-foreground">{doc.fullName}</p>
                              <p className="text-xs text-muted-foreground">{doc.email}</p>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Search by email to uniquely identify a doctor when multiple share the same name.
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeAddForm}
                  className="flex-1 py-2.5 border border-border rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-2.5 bg-herb-green text-white rounded-xl text-sm font-semibold hover:bg-herb-green/90 transition-all disabled:opacity-60"
                >
                  {saving ? "Adding…" : "Add Assistant"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}