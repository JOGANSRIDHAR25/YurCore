/**
 * AI Assistant controller (Phase 1 — free-tier pilot).
 *
 * - General Ayurveda Q&A only: NO access to appointments, prescriptions or
 *   any patient data while running on free tiers.
 * - 40 messages per user per hour.
 * - Audit-logged WITHOUT message content.
 * - Stateless: chat history lives in the user's browser tab and is sent
 *   with each request; nothing is stored server-side.
 * - Streams the answer as newline-delimited JSON events so text appears
 *   while the model is still writing:
 *     {"type":"meta","remaining":39}
 *     {"type":"delta","text":"..."}   (many)
 *     {"type":"done"}  or  {"type":"error","message":"..."}
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/shared/auth/require-auth";
import { apiSuccess } from "@/shared/api/api-response";
import { AppError, AuthorizationError, RateLimitError } from "@/shared/api/api-error";
import { PERMISSIONS } from "@/shared/security/permissions";
import { checkRateLimit } from "@/shared/security/rate-limit";
import { writeAuditLog } from "@/shared/security/audit-log";
import { getRequestIp, getRequestUserAgent } from "@/shared/security/request-meta";
import { AiAssistantService, modeForRole } from "@/backend/service/ai/ai-assistant.service";

const HOURLY_LIMIT = 40;
const WINDOW_SECONDS = 60 * 60;

const chatSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        // Assistant turns can be long structured answers for doctors.
        content: z.string().trim().min(1).max(20000),
      }),
    )
    .min(1)
    .max(40)
    .refine((m) => m[m.length - 1].role === "user", "Last message must be from the user")
    .refine((m) => m[m.length - 1].content.length <= 2000, "Message is too long (max 2000 characters)"),
});

async function requireAiUser(req: NextRequest) {
  const user = await requireAuth(req);
  if (!user.permissions.includes(PERMISSIONS.AI_CHAT_USE)) {
    throw new AuthorizationError("AI Assistant is not available for your account");
  }
  return user;
}

/** GET /api/ai-chat — availability + the caller's mode. */
export async function getStatus(req: NextRequest) {
  const user = await requireAiUser(req);
  return apiSuccess({
    available: AiAssistantService.isConfigured(),
    mode: modeForRole(user.role),
    hourlyLimit: HOURLY_LIMIT,
  });
}

/** POST /api/ai-chat — { messages: [{ role, content }] } → NDJSON answer stream */
export async function handleAction(req: NextRequest) {
  const user = await requireAiUser(req);

  if (!AiAssistantService.isConfigured()) {
    throw new AppError("AI Assistant is not configured yet. Please try again later.", 503);
  }

  const { messages } = chatSchema.parse(await req.json());

  const limit = checkRateLimit(`ai-chat:${user.id}`, HOURLY_LIMIT, WINDOW_SECONDS);
  if (!limit.allowed) {
    const minutes = Math.max(1, Math.ceil(limit.retryAfterSeconds / 60));
    throw new RateLimitError(
      `You've reached the limit of ${HOURLY_LIMIT} messages per hour. Please try again in about ${minutes} minute${minutes === 1 ? "" : "s"}.`,
    );
  }

  const startedAt = Date.now();
  const ipAddress = getRequestIp(req);
  const userAgent = getRequestUserAgent(req);
  let meta: Record<string, unknown> = {};
  let firstTextMs: number | null = null;
  let logged = false;

  // Usage metadata only — never the message text. Runs once per request.
  const audit = (outcome: "ok" | "error" | "interrupted" | "cancelled") => {
    if (logged) return;
    logged = true;
    void writeAuditLog({
      userId: user.id,
      role: user.role,
      action: "ai_chat_message",
      module: "ai_assistant",
      ipAddress,
      userAgent,
      metadata: {
        ...meta,
        outcome,
        firstTextMs,
        latencyMs: Date.now() - startedAt,
        turns: messages.length,
      },
    });
  };

  let answer: Awaited<ReturnType<typeof AiAssistantService.stream>>;
  try {
    answer = await AiAssistantService.stream(user.role, messages);
  } catch (err) {
    console.error("[AI] All providers failed:", (err as Error)?.message);
    audit("error");
    throw new AppError("The AI Assistant is busy right now. Please try again in a minute.", 503);
  }

  meta = { mode: answer.mode, provider: answer.provider, model: answer.model, fallbackUsed: answer.fallbackUsed };
  const chunks = answer.chunks;
  const encoder = new TextEncoder();
  const event = (e: Record<string, unknown>) => encoder.encode(`${JSON.stringify(e)}\n`);

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(event({ type: "meta", remaining: limit.remaining }));
    },
    async pull(controller) {
      try {
        const { done, value } = await chunks.next();
        if (done) {
          controller.enqueue(event({ type: "done" }));
          controller.close();
          audit("ok");
          return;
        }
        firstTextMs ??= Date.now() - startedAt;
        controller.enqueue(event({ type: "delta", text: value }));
      } catch (err) {
        console.error("[AI] Stream interrupted:", (err as Error)?.message);
        controller.enqueue(event({ type: "error", message: "The answer was interrupted. Please try again." }));
        controller.close();
        audit("interrupted");
      }
    },
    async cancel() {
      // Browser closed the request (user pressed Stop or left the page).
      await chunks.return(undefined).catch(() => {});
      audit("cancelled");
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
