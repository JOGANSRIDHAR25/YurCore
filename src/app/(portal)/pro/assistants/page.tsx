"use client";

import { useState } from "react";
import { toast } from "react-hot-toast";
import { ShieldCheck, UserCheck, Mail, Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiClient } from "@/shared/api/api-client";
import { useQuery } from "@/hooks/useQuery";

type AssistantStatus = "pending" | "approved" | "rejected" | "suspended";

type Assistant = {
  id: string;
  fullName: string;
  status: AssistantStatus;
  rejectionReason: string | null;
  createdAt: string;
  email: string | null;
  phone: string | null;
};

const STATUS_STYLE: Record<AssistantStatus, string> = {
  approved: "bg-herb-green/10 text-herb-green",
  pending: "bg-amber-50 text-amber-700",
  rejected: "bg-red-50 text-red-600",
  suspended: "bg-slate-100 text-slate-600",
};

function useMyAssistants() {
  return useQuery<Assistant[]>(
    () => apiClient<{ data: Assistant[] }>("/api/pro/assistants").then((r) => r.data),
    []
  );
}

async function updateAssistantStatus(id: string, status: AssistantStatus, reason?: string): Promise<void> {
  await apiClient(`/api/pro/assistants/${id}`, {
    method: "POST",
    body: JSON.stringify({ status, reason }),
  });
}

export default function ProAssistantsPage() {
  const { data: assistants, loading, refetch } = useMyAssistants();
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [suspendingId, setSuspendingId] = useState<string | null>(null);
  const [reactivatingId, setReactivatingId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<Assistant | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-copper border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const pendingCount = (assistants ?? []).filter((a) => a.status === "pending").length;

  async function handleApprove(assistant: Assistant) {
    if (!confirm(`Approve ${assistant.fullName} as your assistant? They'll get full access to your practitioner dashboard.`)) {
      return;
    }
    setApprovingId(assistant.id);
    try {
      await updateAssistantStatus(assistant.id, "approved");
      toast.success(`${assistant.fullName} approved`);
      refetch();
    } catch (err: any) {
      toast.error(err.message || "Failed to approve assistant");
    } finally {
      setApprovingId(null);
    }
  }

  async function handleSuspend(assistant: Assistant) {
    if (
      !confirm(
        `Suspend ${assistant.fullName}? They will immediately lose access to your practitioner dashboard. You can reactivate them later if they rejoin.`
      )
    ) {
      return;
    }
    setSuspendingId(assistant.id);
    try {
      await updateAssistantStatus(assistant.id, "suspended");
      toast.success(`${assistant.fullName} suspended`);
      refetch();
    } catch (err: any) {
      toast.error(err.message || "Failed to suspend assistant");
    } finally {
      setSuspendingId(null);
    }
  }

  async function handleReactivate(assistant: Assistant) {
    if (!confirm(`Restore ${assistant.fullName}'s access to your practitioner dashboard?`)) {
      return;
    }
    setReactivatingId(assistant.id);
    try {
      await updateAssistantStatus(assistant.id, "approved");
      toast.success(`${assistant.fullName} reactivated`);
      refetch();
    } catch (err: any) {
      toast.error(err.message || "Failed to reactivate assistant");
    } finally {
      setReactivatingId(null);
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
      toast.error(err.message || "Failed to reject assistant");
    }
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-foreground">Assistants</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {(assistants ?? []).length} linked {(assistants ?? []).length === 1 ? "assistant" : "assistants"}
          {pendingCount > 0 && ` · ${pendingCount} awaiting your approval`}
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-border divide-y divide-border overflow-hidden">
        {(assistants ?? []).map((a) => (
          <div key={a.id} className="flex items-center gap-4 px-5 py-4">
            <div className="w-10 h-10 rounded-xl bg-copper/10 flex items-center justify-center flex-shrink-0">
              <span className="text-copper text-sm font-bold">
                {a.fullName?.split(" ").slice(-1)[0]?.[0] ?? "A"}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-foreground">{a.fullName}</p>
              <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground">
                {a.email && (
                  <span className="flex items-center gap-1">
                    <Mail size={11} /> {a.email}
                  </span>
                )}
                {a.phone && (
                  <span className="flex items-center gap-1">
                    <Phone size={11} /> {a.phone}
                  </span>
                )}
              </div>
              {(a.status === "rejected" || a.status === "suspended") && a.rejectionReason && (
                <p className="text-[10px] text-red-500 mt-1 italic">&quot;{a.rejectionReason}&quot;</p>
              )}
            </div>
            <span className={cn("text-[10px] font-semibold px-2.5 py-1 rounded-full capitalize flex-shrink-0", STATUS_STYLE[a.status])}>
              {a.status}
            </span>
            {a.status === "pending" && (
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  disabled={approvingId === a.id}
                  onClick={() => handleApprove(a)}
                  className="bg-herb-green text-white text-xs font-semibold px-3 py-1.5 rounded-xl hover:bg-herb-green/90 transition-all disabled:opacity-60"
                >
                  {approvingId === a.id ? "Approving…" : "Approve"}
                </button>
                <button
                  onClick={() => setRejecting(a)}
                  className="border border-red-200 text-red-600 text-xs font-semibold px-3 py-1.5 rounded-xl hover:bg-red-50 transition-all"
                >
                  Reject
                </button>
              </div>
            )}
            {a.status === "approved" && (
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  disabled={suspendingId === a.id}
                  onClick={() => handleSuspend(a)}
                  className="border border-amber-200 text-amber-700 text-xs font-semibold px-3 py-1.5 rounded-xl hover:bg-amber-50 transition-all disabled:opacity-60"
                >
                  {suspendingId === a.id ? "Suspending…" : "Suspend"}
                </button>
              </div>
            )}
            {a.status === "suspended" && (
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  disabled={reactivatingId === a.id}
                  onClick={() => handleReactivate(a)}
                  className="bg-herb-green text-white text-xs font-semibold px-3 py-1.5 rounded-xl hover:bg-herb-green/90 transition-all disabled:opacity-60"
                >
                  {reactivatingId === a.id ? "Reactivating…" : "Reactivate"}
                </button>
              </div>
            )}
          </div>
        ))}
        {(assistants ?? []).length === 0 && (
          <div className="px-5 py-16 text-center">
            <UserCheck className="mx-auto text-muted-foreground/40" size={32} />
            <p className="text-sm text-muted-foreground mt-3">No assistants have linked to your account yet.</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Assistants can request access from the sign-in page — they&apos;ll appear here for your approval.
            </p>
          </div>
        )}
      </div>

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
    </div>
  );
}