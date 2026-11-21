import "server-only";

import { ROLES, type Role } from "@/shared/security/roles";
import {
  buildSystemPrompt,
  EMERGENCY_REPLY,
  isEmergency,
  redactIdentifiers,
  type AiMode,
} from "./ai-prompts";
import {
  isAiConfigured,
  streamChatCompletion,
  type CompletionOptions,
  type ProviderMessage,
} from "./ai-provider";

export type ChatTurn = { role: "user" | "assistant"; content: string };

type ReplyMeta = {
  mode: AiMode;
  /** "guard" = answered locally without calling a provider. */
  provider: "primary" | "fallback" | "guard";
  model: string | null;
  fallbackUsed: boolean;
};

export type AssistantStream = ReplyMeta & { chunks: AsyncGenerator<string, void, undefined> };
export type AssistantReply = ReplyMeta & { reply: string };

/** How many previous turns we send back for follow-up context. */
const MAX_HISTORY_TURNS = 12;

/** Earlier assistant answers are trimmed in history to keep requests small. */
const MAX_HISTORY_ASSISTANT_CHARS = 2500;

/**
 * Doctors get long, structured answers; patients get short plain ones.
 * If the primary (free-tier Gemini) hasn't started writing within
 * `firstTokenTimeoutMs`, we switch to the fallback (Groq starts in <1s).
 */
const MODE_OPTIONS: Record<AiMode, CompletionOptions> = {
  practitioner: { maxTokens: 5000, firstTokenTimeoutMs: 12_000, totalTimeoutMs: 90_000 },
  patient: { maxTokens: 1500, firstTokenTimeoutMs: 10_000, totalTimeoutMs: 30_000 },
};

export function modeForRole(role: Role): AiMode {
  return role === ROLES.DOCTOR || role === ROLES.ASSISTANT ? "practitioner" : "patient";
}

async function* once(text: string): AsyncGenerator<string, void, undefined> {
  yield text;
}

function buildMessages(mode: AiMode, history: ChatTurn[]): ProviderMessage[] {
  return [
    { role: "system", content: buildSystemPrompt(mode) },
    ...history.slice(-MAX_HISTORY_TURNS).map((t) => ({
      role: t.role,
      content:
        t.role === "user"
          ? redactIdentifiers(t.content)
          : t.content.length > MAX_HISTORY_ASSISTANT_CHARS
            ? `${t.content.slice(0, MAX_HISTORY_ASSISTANT_CHARS)}\n…[earlier answer trimmed]`
            : t.content,
    })),
  ];
}

async function stream(role: Role, history: ChatTurn[]): Promise<AssistantStream> {
  const mode = modeForRole(role);
  const latest = history[history.length - 1];

  if (isEmergency(latest.content)) {
    return { mode, provider: "guard", model: null, fallbackUsed: false, chunks: once(EMERGENCY_REPLY) };
  }

  const result = await streamChatCompletion(buildMessages(mode, history), MODE_OPTIONS[mode]);
  return { mode, ...result };
}

export const AiAssistantService = {
  isConfigured: isAiConfigured,

  /** Streams the answer as it is written (used by the chat API). */
  stream,

  /** Convenience: waits for the full answer. */
  async reply(role: Role, history: ChatTurn[]): Promise<AssistantReply> {
    const { chunks, ...meta } = await stream(role, history);
    let reply = "";
    for await (const chunk of chunks) reply += chunk;
    return { ...meta, reply: reply.trim() };
  },
};
