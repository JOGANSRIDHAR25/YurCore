"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { useAdminAuditLogs } from "@/hooks/use-admin";

const MODULES = ["all", "practitioners", "patients", "family_members", "assistants", "prescriptions", "health_records", "appointments", "availability", "consents", "profiles", "medicines", "clinics", "orders", "auth"];

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function actorLabel(actor: { email: string | null; mobile: string | null; role: string } | null) {
  if (!actor) return "System";
  return actor.email || actor.mobile || actor.role;
}

export default function AdminAuditLogsPage() {
  const [module, setModule] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<any | null>(null);

  const { data: logs, loading, refetch } = useAdminAuditLogs({
    module: module === "all" ? undefined : module,
    search: search.trim() || undefined,
  });

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Audit Logs</h1>
          <p className="text-sm text-muted-foreground">Who changed what, when, and from where — across doctors, patients, and assistants.</p>
        </div>
        <button
          onClick={() => refetch()}
          className="text-xs font-medium px-3 py-2 rounded-lg border border-border hover:bg-muted transition-colors"
        >
          Refresh
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {MODULES.map((m) => (
          <button
            key={m}
            onClick={() => setModule(m)}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-medium capitalize border transition-colors",
              module === m
                ? "bg-herb-green text-white border-herb-green"
                : "border-border text-muted-foreground hover:bg-muted"
            )}
          >
            {m.replace(/_/g, " ")}
          </button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by action (e.g. verify, create)..."
          className="ml-auto px-3 py-1.5 rounded-full text-xs border border-border bg-background outline-none focus:ring-2 focus:ring-herb-green/30 min-w-[220px]"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center min-h-[40vh]">
          <div className="w-8 h-8 border-4 border-herb-green border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/60 text-left text-xs text-muted-foreground uppercase tracking-wide">
                  <th className="px-4 py-3 font-medium">When</th>
                  <th className="px-4 py-3 font-medium">Actor</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Action</th>
                  <th className="px-4 py-3 font-medium">Module</th>
                  <th className="px-4 py-3 font-medium">Record</th>
                  <th className="px-4 py-3 font-medium">IP</th>
                  <th className="px-4 py-3 font-medium" />
                </tr>
              </thead>
              <tbody>
                {(logs ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground text-sm">
                      No audit events found.
                    </td>
                  </tr>
                ) : (
                  (logs ?? []).map((log) => (
                    <tr key={log.id} className="border-t border-border hover:bg-muted/30">
                      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{formatDate(log.created_at)}</td>
                      <td className="px-4 py-3 font-medium text-foreground">{actorLabel(log.actor)}</td>
                      <td className="px-4 py-3 capitalize text-muted-foreground">{log.metadata?.role || log.actor?.role || "—"}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded-full bg-herb-green/10 text-herb-green text-xs font-medium">
                          {log.action}
                        </span>
                      </td>
                      <td className="px-4 py-3 capitalize text-muted-foreground">{log.entity_type}</td>
                      <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{log.entity_id ? log.entity_id.slice(0, 8) : "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{log.ip_address || "—"}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => setSelected(log)}
                          className="text-xs font-medium text-herb-green hover:underline"
                        >
                          Details
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setSelected(null)}>
          <div
            className="bg-white rounded-xl max-w-lg w-full p-5 space-y-3 max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-foreground">Audit Event</h2>
              <button onClick={() => setSelected(null)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>
            <div className="text-sm space-y-1.5">
              <p><span className="text-muted-foreground">When:</span> {formatDate(selected.created_at)}</p>
              <p><span className="text-muted-foreground">Actor:</span> {actorLabel(selected.actor)} ({selected.actor_user_id || "system"})</p>
              <p><span className="text-muted-foreground">Action:</span> {selected.action}</p>
              <p><span className="text-muted-foreground">Module:</span> {selected.entity_type}</p>
              <p><span className="text-muted-foreground">Record ID:</span> {selected.entity_id || "—"}</p>
              <p><span className="text-muted-foreground">Patient ID:</span> {selected.patient_id || "—"}</p>
              <p><span className="text-muted-foreground">IP address:</span> {selected.ip_address || "—"}</p>
              <p><span className="text-muted-foreground">User agent:</span> {selected.user_agent || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Metadata</p>
              <pre className="text-xs bg-muted rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">
                {JSON.stringify(selected.metadata, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
