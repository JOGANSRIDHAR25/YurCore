import "server-only";

import { after, type NextRequest } from "next/server";
import { createClient } from "../db/supabase.server";
import { getRequestIp, getRequestUserAgent } from "./request-meta";

export type AuditLogEntry = {
  userId: string;
  role: string;
  action: string;
  /** Table/module the action targeted, e.g. "practitioners" | "patients" | "assistants" */
  module: string;
  recordId?: string;
  /** Patient this event relates to, when applicable (e.g. an assistant/doctor acting on a patient record) */
  patientId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, any>;
};

// Sensitive keys that must NEVER be logged under any circumstances
const SENSITIVE_KEYS = new Set([
  "password",
  "otp",
  "token",
  "accessToken",
  "refreshToken",
  "access_token",
  "refresh_token",
  "medicalNotes",
  "medical_notes",
  "card",
  "cardNumber",
  "card_number",
  "cvv",
  "serviceRoleKey",
  "service_role_key",
]);

/**
 * Sanitizes metadata by recursively removing sensitive fields.
 */
function sanitizeMetadata(data: any): any {
  if (!data) return data;
  if (typeof data !== "object") return data;

  if (Array.isArray(data)) {
    return data.map(sanitizeMetadata);
  }

  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase()) || key.includes("password") || key.includes("token")) {
      sanitized[key] = "[REDACTED_SENSITIVE_DATA]";
    } else {
      sanitized[key] = sanitizeMetadata(value);
    }
  }
  return sanitized;
}

/**
 * Writes an entry to the system audit logs.
 * Falls back to structured stdout logging if DB insertions fail or table does not exist.
 */
export async function writeAuditLog(entry: AuditLogEntry): Promise<void> {
  const sanitizedMetadata = sanitizeMetadata(entry.metadata);

  // The audit_logs table has no dedicated `role`/`module` columns, so they are
  // folded into metadata alongside the actor's role for full traceability.
  const logPayload = {
    actor_user_id: entry.userId,
    action: entry.action,
    entity_type: entry.module,
    entity_id: entry.recordId || null,
    patient_id: entry.patientId || null,
    ip_address: entry.ipAddress && entry.ipAddress !== "unknown" ? entry.ipAddress : null,
    user_agent: entry.userAgent || "unknown",
    metadata: {
      role: entry.role,
      module: entry.module,
      ...(sanitizedMetadata || {}),
    },
    created_at: new Date().toISOString(),
  };

  // 1. Structured stdout logging (extremely secure, easily collected by Datadog, CloudWatch, Google Cloud Logging)
  console.info(`[AUDIT_LOG] ${JSON.stringify(logPayload)}`);

  // 2. Database logging (via admin client to bypass RLS)
  try {
    const supabase = createClient() as any;
    const { error } = await supabase
      .from("audit_logs")
      .insert([logPayload]);

    if (error) {
      // Table might not exist yet, we catch this and log to console
      if (error.code === "PGRST116" || error.message.includes("does not exist")) {
        console.warn("[AUDIT_LOG] Warning: 'audit_logs' table does not exist in database yet. Log stored in stdout only.");
      } else {
        console.error("[AUDIT_LOG] Database insert failed:", error.message);
      }
    }
  } catch (err: any) {
    console.error("[AUDIT_LOG] Unexpected database logging error:", err?.message || err);
  }
}

/**
 * Records an audit event for the current request without delaying the
 * response — the insert runs after the response is sent (Next.js `after`),
 * falling back to fire-and-forget outside a request scope. Never throws.
 */
export function auditRequest(
  req: NextRequest,
  actor: { id: string; role: string },
  entry: Omit<AuditLogEntry, "userId" | "role" | "ipAddress" | "userAgent">,
): void {
  const full: AuditLogEntry = {
    ...entry,
    userId: actor.id,
    role: actor.role,
    ipAddress: getRequestIp(req),
    userAgent: getRequestUserAgent(req),
  };
  try {
    after(() => writeAuditLog(full));
  } catch {
    void writeAuditLog(full);
  }
}
