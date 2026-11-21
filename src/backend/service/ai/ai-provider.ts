import "server-only";

import { serverEnv } from "@/shared/config/env";

/**
 * Provider-agnostic streaming chat client for any OpenAI-compatible
 * `/chat/completions` endpoint (Gemini, Groq, OpenRouter, etc.).
 *
 * Phase 1 → Phase 2 is purely configuration: change the URL / key / model
 * env vars and nothing in this file or its callers needs to change.
 */

export type ProviderMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type ProviderName = "primary" | "fallback";

type ProviderConfig = {
  name: ProviderName;
  url: string;
  apiKey?: string;
  model: string;
  /** Sent as `reasoning_effort` when set (e.g. "none" / "low"); omitted when empty. */
  reasoningEffort?: string;
};

export type CompletionOptions = {
  /** Includes the model's hidden "thinking" tokens on current models. */
  maxTokens: number;
  /** Switch to the next provider if no answer text has arrived by then. */
  firstTokenTimeoutMs: number;
  /** Hard cap for the whole answer once it has started. */
  totalTimeoutMs: number;
};

export type CompletionStream = {
  provider: ProviderName;
  model: string;
  fallbackUsed: boolean;
  /** Answer text, chunk by chunk, as the model writes it. */
  chunks: AsyncGenerator<string, void, undefined>;
};

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
  }
}

async function readErrorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as unknown;
    const err = (Array.isArray(body) ? body[0] : body) as { error?: { message?: string } };
    return (err?.error?.message ?? "").slice(0, 200);
  } catch {
    return "";
  }
}

function getProviders(): ProviderConfig[] {
  const providers: ProviderConfig[] = [
    {
      name: "primary",
      url: serverEnv.AI_PRIMARY_API_URL,
      apiKey: serverEnv.AI_PRIMARY_API_KEY,
      model: serverEnv.AI_PRIMARY_MODEL,
      reasoningEffort: serverEnv.AI_PRIMARY_REASONING_EFFORT,
    },
    {
      name: "fallback",
      url: serverEnv.AI_FALLBACK_API_URL,
      apiKey: serverEnv.AI_FALLBACK_API_KEY,
      model: serverEnv.AI_FALLBACK_MODEL,
      reasoningEffort: serverEnv.AI_FALLBACK_REASONING_EFFORT,
    },
  ];
  return providers.filter((p) => !!p.apiKey);
}

export function isAiConfigured(): boolean {
  return getProviders().length > 0;
}

/** Parses an OpenAI-style SSE body and yields only the answer text. */
async function* readSseContent(body: ReadableStream<Uint8Array>): AsyncGenerator<string, void, undefined> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") return;
        let event: { error?: { message?: string }; choices?: { delta?: { content?: string | null } }[] };
        try {
          event = JSON.parse(data);
        } catch {
          continue;
        }
        if (event.error) throw new ProviderError(`stream error: ${(event.error.message ?? "").slice(0, 200)}`);
        // Reasoning/"thinking" deltas arrive in other fields and are ignored.
        const text = event.choices?.[0]?.delta?.content;
        if (text) yield text;
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }
}

/**
 * Opens a streaming request and waits for the first piece of answer text.
 * Throws (so the caller can fall back) if the provider errors, is busy, or
 * stays silent past `firstTokenTimeoutMs`.
 */
async function openStream(
  provider: ProviderConfig,
  messages: ProviderMessage[],
  options: CompletionOptions,
): Promise<AsyncGenerator<string, void, undefined>> {
  const controller = new AbortController();
  let timedOut: "first" | "total" | null = null;
  const firstTimer = setTimeout(() => {
    timedOut = "first";
    controller.abort();
  }, options.firstTokenTimeoutMs);
  const totalTimer = setTimeout(() => {
    timedOut = "total";
    controller.abort();
  }, options.totalTimeoutMs);
  const clearTimers = () => {
    clearTimeout(firstTimer);
    clearTimeout(totalTimer);
  };
  const label = `${provider.name} (${provider.model})`;
  const toProviderError = (err: unknown) => {
    if (err instanceof ProviderError) return new ProviderError(`${label} ${err.message}`, err.status);
    if (timedOut === "first") return new ProviderError(`${label} sent no text within ${options.firstTokenTimeoutMs / 1000}s`);
    if (timedOut === "total") return new ProviderError(`${label} took longer than ${options.totalTimeoutMs / 1000}s`);
    return new ProviderError(`${label} unreachable`);
  };

  try {
    const res = await fetch(provider.url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify({
        model: provider.model,
        messages,
        temperature: 0.4,
        max_tokens: options.maxTokens,
        stream: true,
        ...(provider.reasoningEffort ? { reasoning_effort: provider.reasoningEffort } : {}),
      }),
    });

    if (!res.ok) {
      // Log only the provider's short error message (e.g. "model retired",
      // "quota exceeded"), never the full body, which could echo the prompt.
      const detail = await readErrorMessage(res);
      throw new ProviderError(`responded ${res.status}${detail ? `: ${detail}` : ""}`, res.status);
    }
    if (!res.body) throw new ProviderError("returned no body");

    const source = readSseContent(res.body);
    const first = await source.next();
    clearTimeout(firstTimer);
    if (first.done) throw new ProviderError("returned an empty reply");

    return (async function* () {
      let finished = false;
      try {
        yield first.value;
        yield* source;
        finished = true;
      } catch (err) {
        throw toProviderError(err);
      } finally {
        clearTimers();
        // Caller stopped early (e.g. user pressed Stop): stop the upstream request too.
        if (!finished) controller.abort();
      }
    })();
  } catch (err) {
    clearTimers();
    controller.abort();
    throw toProviderError(err);
  }
}

/**
 * Streams from the primary provider, falling back to the next one when the
 * primary is rate-limited, busy, down, or hasn't started answering in time.
 * Once text has started flowing we stay with that provider.
 */
export async function streamChatCompletion(
  messages: ProviderMessage[],
  options: CompletionOptions,
): Promise<CompletionStream> {
  const providers = getProviders();
  if (providers.length === 0) {
    throw new ProviderError("No AI provider is configured");
  }

  let lastError: unknown;
  for (let i = 0; i < providers.length; i++) {
    const provider = providers[i];
    try {
      const chunks = await openStream(provider, messages, options);
      return { provider: provider.name, model: provider.model, fallbackUsed: i > 0, chunks };
    } catch (err) {
      lastError = err;
      console.warn(`[AI] ${(err as Error).message}${i < providers.length - 1 ? " — trying fallback" : ""}`);
    }
  }
  throw lastError;
}
