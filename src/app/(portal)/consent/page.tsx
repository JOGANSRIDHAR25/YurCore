"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { ConsentView } from "./type";

type ConsentTab = "active" | "expired";

async function fetchConsentGrants(): Promise<ConsentView[]> {
  const response = await fetch("/api/consent", {
    method: "GET",
    credentials: "include",
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.error || "Unable to load consent grants");
  }
  return result.data as ConsentView[];
}

async function revokeConsent(id: string): Promise<void> {
  const response = await fetch(`/api/consent/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.error || "Unable to revoke consent");
  }
}

const CONSENT_ICONS: Record<string, string> = {
  prescriptions: "🏥",
  emr: "🩺",
  vitals: "📈",
  allergy: "🤧",
  diagnostic: "🔬",
};

const getIconForRecordTypes = (types: string[]) => {
  const primary = (types[0] || "").toLowerCase();
  for (const key in CONSENT_ICONS) {
    if (primary.includes(key)) return CONSENT_ICONS[key];
  }
  return "🩺";
};

export default function ConsentPage() {
  const [allConsents, setAllConsents] = useState<ConsentView[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<ConsentTab>("active");
  const [revoking, setRevoking] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function loadConsents(): Promise<void> {
    try {
      setLoading(true);
      const data = await fetchConsentGrants();
      setAllConsents(data);
    } catch (err) {
      console.error("Failed to load consent grants:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadConsents();
  }, []);

  // Divide consents into active vs expired/revoked
  const activeConsents = allConsents.filter((c) => {
    if (c.action === "revoked") return false;
    if (c.expiresAt && new Date(c.expiresAt) < new Date()) return false;
    return true;
  });

  const expiredConsents = allConsents.filter((c) => {
    return c.action === "revoked" || (c.expiresAt && new Date(c.expiresAt) < new Date());
  });

  async function handleRevoke(id: string) {
    setSubmitting(true);
    try {
      await revokeConsent(id);
      setRevoking(null);
      await loadConsents();
    } catch (err) {
      console.error("Failed to revoke consent:", err);
    } finally {
      setSubmitting(false);
    }
  }

  const consents = activeTab === "active" ? activeConsents : expiredConsents;

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold text-foreground">ABDM Consent Manager</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Control who accesses your health records. All consents are ABDM-compliant.
        </p>
      </div>

      {/* Info banner */}
      <div className="mb-6 bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-start gap-3">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="oklch(0.45 0.14 250)" strokeWidth={2} className="flex-shrink-0 mt-0.5">
          <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <p className="text-xs text-blue-800 leading-relaxed">
          Your health data is protected under the DPDP Act 2023. You can revoke any consent at any time. Revoking consent does not delete previously shared data from the requester&apos;s system.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
        {/* Left: Consents list */}
        <div>
          {/* Tabs */}
          <div className="flex gap-2 mb-5">
            {(["active", "expired"] as ConsentTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "px-4 py-2 text-xs font-semibold rounded-full border capitalize transition-all",
                  activeTab === tab
                    ? "bg-herb-green text-white border-herb-green"
                    : "border-border text-muted-foreground bg-white hover:border-herb-green/30"
                )}
              >
                {tab} ({tab === "active" ? activeConsents.length : expiredConsents.length})
              </button>
            ))}
          </div>

          {loading ? (
            <div className="py-20 text-center text-sm text-muted-foreground">Loading consents...</div>
          ) : (
            <div className="space-y-3">
              {consents.length === 0 && (
                <div className="text-center py-12 bg-white rounded-2xl border border-border">
                  <span className="text-4xl">🔒</span>
                  <p className="text-sm font-medium text-foreground mt-3">
                    {activeTab === "active" ? "No active consents" : "No expired or revoked consents"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {activeTab === "active" ? "All active data sharing requests will appear here" : "Previously completed sharing sessions will be shown here"}
                  </p>
                </div>
              )}
              {consents.map((c) => {
                const isRevoked = c.action === "revoked";
                const isExpired = c.expiresAt && new Date(c.expiresAt) < new Date();
                
                return (
                  <div key={c.id} className={cn("bg-white rounded-2xl border border-border p-5 transition-all", (isRevoked || isExpired) ? "opacity-60" : "")}>
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-xl bg-herb-green/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-xl">{getIconForRecordTypes(c.recordTypes)}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-foreground">{c.practitionerName}</p>
                            <p className="text-xs text-muted-foreground">Purpose: {c.duration}</p>
                          </div>
                          <span className={cn("flex-shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full",
                            isRevoked ? "bg-red-50 text-red-600" : isExpired ? "bg-muted text-muted-foreground" : "bg-herb-green/10 text-herb-green"
                          )}>
                            {isRevoked ? "Revoked" : isExpired ? "Expired" : "Active"}
                          </span>
                        </div>
                        <p className="text-xs text-foreground mt-2 font-medium">Data sharing granted for EMR synchronization</p>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {(c.recordTypes || []).map((d) => (
                            <span key={d} className="text-[10px] bg-muted px-2 py-0.5 rounded-full text-muted-foreground capitalize">
                              {d}
                            </span>
                          ))}
                        </div>
                        <div className="flex items-center justify-between mt-3">
                          <p className="text-[10px] text-muted-foreground">
                            Granted: {c.createdAt}
                            {c.expiresAt && !isRevoked && !isExpired && (
                              <> · Expires: {new Date(c.expiresAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</>
                            )}
                          </p>
                          {activeTab === "active" && !isRevoked && !isExpired && (
                            <button
                              onClick={() => setRevoking(c.id)}
                              className="text-[10px] text-red-600 font-semibold border border-red-200 px-2.5 py-1 rounded-lg hover:bg-red-50 transition-colors"
                            >
                              Revoke
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: Info panel */}
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-border p-5">
            <h3 className="font-semibold text-foreground text-sm mb-3">Consent Summary</h3>
            {[
              { label: "Active Consents", value: activeConsents.length, color: "text-herb-green" },
              { label: "Expired", value: expiredConsents.filter(c => c.action !== "revoked").length, color: "text-muted-foreground" },
              { label: "Revoked (all time)", value: expiredConsents.filter(c => c.action === "revoked").length, color: "text-red-500" },
            ].map((s) => (
              <div key={s.label} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className={cn("text-sm font-bold", s.color)}>{s.value}</p>
              </div>
            ))}
          </div>

          <div className="bg-ivory-deep rounded-2xl border border-border p-5">
            <h3 className="font-semibold text-foreground text-sm mb-2">Your Rights</h3>
            <ul className="space-y-2 text-xs text-muted-foreground">
              {[
                "Right to grant consent",
                "Right to revoke consent",
                "Right to access your data",
                "Right to data portability",
                "Right to erasure request",
              ].map((r) => (
                <li key={r} className="flex items-center gap-2">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="oklch(0.29 0.09 158)" strokeWidth={2.5}>
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  {r}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Revoke confirmation modal */}
      {revoking && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="font-display font-semibold text-foreground text-center">Revoke Consent?</h3>
            <p className="text-sm text-muted-foreground text-center mt-2 leading-relaxed">
              This will immediately revoke the data access grant. Previously shared data may still be retained by the requester.
            </p>
            <div className="flex gap-3 mt-5">
              <button
                disabled={submitting}
                onClick={() => setRevoking(null)}
                className="flex-1 py-3 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                disabled={submitting}
                onClick={() => handleRevoke(revoking)}
                className="flex-1 py-3 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                {submitting ? "Revoking..." : "Revoke"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
