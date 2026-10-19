import "server-only";

import { createHmac } from "crypto";
import { after } from "next/server";

/**
 * Instant "something changed" signals for chat screens, over Supabase Realtime
 * Broadcast.
 *
 * Auth in this app is our own JWT, not Supabase Auth, so browsers can't be
 * trusted with postgres_changes on the message tables. Instead the server
 * broadcasts a content-free ping after every write, and the browser refetches
 * through the normal authorised API. Topic names are HMACs of the recipient's
 * id, so they can only be learned from /api/realtime (which checks auth).
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVER_KEY = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const BROADCAST_TIMEOUT_MS = 2000;

function topicFor(scope: string): string {
  const digest = createHmac("sha256", SERVER_KEY ?? "meyveda-realtime")
    .update(scope)
    .digest("hex")
    .slice(0, 32);
  return `mv:${digest}`;
}

export const RealtimeTopics = {
  patientInbox: (patientId: string) => topicFor(`inbox:patient:${patientId}`),
  practitionerInbox: (practitionerId: string) => topicFor(`inbox:practitioner:${practitionerId}`),
  community: () => topicFor("community:doctors"),
};

export type RealtimeEvent = "message" | "read" | "reaction";

/**
 * Schedules the broadcast to run after the HTTP response has been sent, so
 * the sender's request returns as soon as the write is done instead of
 * waiting on the Realtime round-trip. Falls back to an immediate
 * fire-and-forget broadcast outside a request scope.
 */
export function broadcastSignalAfterResponse(topics: string[] | (() => Promise<string[]>), event: RealtimeEvent): void {
  const run = async () => {
    const resolved = typeof topics === "function" ? await topics() : topics;
    await broadcastSignal(resolved, event);
  };
  try {
    after(run);
  } catch {
    void run();
  }
}

/**
 * Best-effort broadcast — never throws, so a Realtime hiccup can't fail the
 * write that triggered it (clients still have their fallback poll).
 */
export async function broadcastSignal(topics: string[], event: RealtimeEvent): Promise<void> {
  if (!SUPABASE_URL || !SERVER_KEY || topics.length === 0) return;
  try {
    const response = await fetch(`${SUPABASE_URL}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SERVER_KEY,
        Authorization: `Bearer ${SERVER_KEY}`,
      },
      body: JSON.stringify({
        messages: topics.map((topic) => ({ topic, event, payload: { at: Date.now() }, private: false })),
      }),
      signal: AbortSignal.timeout(BROADCAST_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.error("[realtime] broadcast failed:", response.status, await response.text().catch(() => ""));
    }
  } catch (err) {
    console.error("[realtime] broadcast error:", err instanceof Error ? err.message : err);
  }
}
