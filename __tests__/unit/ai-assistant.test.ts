// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/config/env", () => ({
  serverEnv: {
    AI_PRIMARY_API_URL: "https://primary.test/chat/completions",
    AI_PRIMARY_API_KEY: "test-primary",
    AI_PRIMARY_MODEL: "primary-model",
    AI_PRIMARY_REASONING_EFFORT: "none",
    AI_FALLBACK_API_URL: "https://fallback.test/chat/completions",
    AI_FALLBACK_API_KEY: "test-fallback",
    AI_FALLBACK_MODEL: "fallback-model",
    AI_FALLBACK_REASONING_EFFORT: "",
  },
}));

import { isEmergency, redactIdentifiers, buildSystemPrompt } from "@/backend/service/ai/ai-prompts";
import { AiAssistantService, modeForRole } from "@/backend/service/ai/ai-assistant.service";
import { streamChatCompletion } from "@/backend/service/ai/ai-provider";

/** An OpenAI-style streaming (SSE) response that sends `parts` as deltas. */
const sse = (...parts: string[]) => {
  const body =
    parts.map((p) => `data: ${JSON.stringify({ choices: [{ delta: { content: p } }] })}\n\n`).join("") + "data: [DONE]\n\n";
  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
};

/** A response that never sends any text, and errors when the request is aborted. */
const silent = (init?: RequestInit) =>
  new Response(
    new ReadableStream({
      start(c) {
        init?.signal?.addEventListener("abort", () => c.error(new DOMException("aborted", "AbortError")));
      },
    }),
    { status: 200 },
  );

describe("AI guards", () => {
  it("detects emergencies in English and Hindi", () => {
    expect(isEmergency("I have severe chest pain since an hour")).toBe(true);
    expect(isEmergency("मुझे आत्महत्या के विचार आ रहे हैं")).toBe(true);
    expect(isEmergency("How do I balance Pitta in summer?")).toBe(false);
  });

  it("redacts personal identifiers", () => {
    const out = redactIdentifiers("Call me on +91 9876543210 or a@b.com, aadhaar 1234 5678 9012, PAN ABCDE1234F");
    expect(out).not.toMatch(/9876543210|a@b\.com|1234 5678 9012|ABCDE1234F/);
  });

  it("maps roles to modes and builds distinct prompts", () => {
    expect(modeForRole("doctor")).toBe("practitioner");
    expect(modeForRole("assistant")).toBe("practitioner");
    expect(modeForRole("patient")).toBe("patient");
    expect(buildSystemPrompt("patient")).toContain("AyurSanvaad");
    expect(buildSystemPrompt("practitioner")).toContain("Vaidya Sahayak");
  });
});

describe("AiAssistantService (streaming)", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => vi.unstubAllGlobals());

  it("answers emergencies locally without calling any provider", async () => {
    const r = await AiAssistantService.reply("patient", [{ role: "user", content: "I can't breathe" }]);
    expect(r.provider).toBe("guard");
    expect(r.reply).toContain("112");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("streams from the primary and sends stream + reasoning_effort", async () => {
    fetchMock.mockResolvedValueOnce(sse("Nam", "aste"));
    const r = await AiAssistantService.reply("patient", [{ role: "user", content: "What is Agni?" }]);
    expect(r).toMatchObject({ reply: "Namaste", provider: "primary", fallbackUsed: false });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://primary.test/chat/completions");
    expect(JSON.parse(init.body)).toMatchObject({ stream: true, reasoning_effort: "none" });
  });

  it("yields text chunk by chunk", async () => {
    fetchMock.mockResolvedValueOnce(sse("## Overview", "\n- point"));
    const s = await AiAssistantService.stream("doctor", [{ role: "user", content: "Amavata?" }]);
    const parts: string[] = [];
    for await (const c of s.chunks) parts.push(c);
    expect(parts).toEqual(["## Overview", "\n- point"]);
    expect(s.mode).toBe("practitioner");
  });

  it("falls back when the primary is rate-limited", async () => {
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 429 })).mockResolvedValueOnce(sse("From fallback"));
    const r = await AiAssistantService.reply("doctor", [{ role: "user", content: "Guna of Guduchi?" }]);
    expect(r).toMatchObject({ reply: "From fallback", provider: "fallback", fallbackUsed: true, mode: "practitioner" });
    // Empty reasoning effort is not sent to the fallback.
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).reasoning_effort).toBeUndefined();
  });

  it("falls back when the primary sends no text before the first-token timeout", async () => {
    fetchMock.mockImplementationOnce((_u: string, init: RequestInit) => Promise.resolve(silent(init))).mockResolvedValueOnce(sse("fast"));
    const s = await streamChatCompletion([{ role: "user", content: "hi" }], {
      maxTokens: 100,
      firstTokenTimeoutMs: 50,
      totalTimeoutMs: 5000,
    });
    expect(s.provider).toBe("fallback");
    expect((await s.chunks.next()).value).toBe("fast");
  });

  it("redacts identifiers before sending to the provider", async () => {
    fetchMock.mockResolvedValueOnce(sse("ok"));
    await AiAssistantService.reply("patient", [{ role: "user", content: "my number is 9876543210" }]);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(JSON.stringify(body.messages)).not.toContain("9876543210");
  });

  it("throws when every provider fails", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 503 }));
    await expect(AiAssistantService.reply("patient", [{ role: "user", content: "hi" }])).rejects.toThrow();
  });
});
