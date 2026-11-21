"use client";

import { useState, useRef, useEffect, useCallback, useLayoutEffect, type ReactNode } from "react";
import Link from "next/link";
import { Sparkles, RotateCcw, Copy, Check, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/auth-context";
import { API_ROUTES } from "@/constants/api.constants";
import { AiMarkdown } from "@/components/chat/AiMarkdown";

const PATIENT_PROMPTS = [
  "Suggest a simple Dinacharya",
  "How to balance Pitta in summer?",
  "Tips for better Nidra (sleep)",
  "How can I strengthen my Agni?",
  "What is Panchakarma?",
  "मन शांत रखने के लिए आयुर्वेदिक उपाय",
];

const PRACTITIONER_PROMPTS = [
  "Explain Amavata: Nidana, Samprapti and Chikitsa sutra",
  "Complete Dravyaguna profile of Guduchi",
  "Compare Vataja, Pittaja and Kaphaja Jwara",
  "Chikitsa sutra and Pathya-Apathya in Prameha",
  "Shodhana vs Shamana: when to choose which",
  "Sama vs Nirama Dosha lakshana",
];

type Turn = {
  id: string;
  role: "user" | "assistant";
  content: string;
  at: number;
  error?: boolean;
  /** Answer is still being written. */
  streaming?: boolean;
  /** Answer was cut short (Stop pressed or connection dropped). */
  partial?: boolean;
};

const STORAGE_KEY = "yc-ai-chat";
const MAX_INPUT = 2000;

// Chat history lives only in this browser tab (sessionStorage) per pilot policy.
function loadHistory(userId: string): Turn[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { userId: string; turns: Turn[] };
    if (parsed.userId !== userId) return [];
    return parsed.turns.map((t) => (t.streaming ? { ...t, streaming: false, partial: true } : t));
  } catch {
    return [];
  }
}

function saveHistory(userId: string, turns: Turn[]) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ userId, turns: turns.slice(-40) }));
  } catch {
    /* storage unavailable — chat still works in memory */
  }
}

/** Patients get plain text; strip any markdown symbols the model slips in. */
function toPlainText(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^\s*[-*•]\s+/gm, "• ")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1$2")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export default function AIChatPage() {
  const { user } = useAuth();
  const isPro = user?.role === "practitioner" || user?.role === "assistant";

  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const abortRef = useRef<AbortController | null>(null);

  const assistantName = isPro ? "Vaidya Sahayak" : "AyurSanvaad";
  const greeting = isPro
    ? `Pranam Vaidya-ji 🙏 I'm **${assistantName}**, your classical Ayurveda learning and reference assistant.\n\nAsk me about any concept, disease (Nidana, Samprapti, Chikitsa), dravya or formulation, and I'll give you a clear, structured answer.\n\n> During this pilot I can't see patient records, so please don't share patient details.`
    : `Namaste 🙏 I'm ${assistantName}, your Ayurveda wellness guide. Ask me about daily routines, diet, sleep or seasons, in English, Hindi or your language.\n\nI give general information only, not medical advice, and I can't see your appointments or records.`;

  useEffect(() => {
    if (user?.id) setTurns(loadHistory(user.id));
  }, [user?.id]);

  useEffect(() => {
    if (user?.id && !sending) saveHistory(user.id, turns);
  }, [user?.id, turns, sending]);

  useEffect(() => {
    let cancelled = false;
    fetch(API_ROUTES.AI_CHAT)
      .then((r) => r.json())
      .then((j) => !cancelled && setAvailable(!!j?.data?.available))
      .catch(() => !cancelled && setAvailable(false));
    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
  }, []);

  // Follow the answer as it streams, unless the user has scrolled up to read.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [turns, sending]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (el) stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  const updateTurn = (id: string, patch: (t: Turn) => Partial<Turn>) =>
    setTurns((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch(t) } : t)));

  const send = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content || sending) return;

      const now = Date.now();
      const userTurn: Turn = { id: `u-${now}`, role: "user", content, at: now };
      const replyId = `a-${now}`;
      const history = [...turns.filter((t) => !t.error && t.content), userTurn];
      setTurns((prev) => [...prev, userTurn, { id: replyId, role: "assistant", content: "", at: now, streaming: true }]);
      setInput("");
      setSending(true);
      stickToBottom.current = true;

      const controller = new AbortController();
      abortRef.current = controller;

      // Buffer incoming text and paint at most once per animation frame.
      let pending = "";
      let frame = 0;
      const flush = () => {
        frame = 0;
        if (!pending) return;
        const add = pending;
        pending = "";
        updateTurn(replyId, (t) => ({ content: t.content + add }));
      };
      const fail = (message: string) => {
        if (frame) cancelAnimationFrame(frame);
        flush();
        updateTurn(replyId, (t) =>
          t.content ? { streaming: false, partial: true } : { streaming: false, error: true, content: message },
        );
      };

      try {
        const res = await fetch(API_ROUTES.AI_CHAT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: history.map(({ role, content }) => ({ role, content })) }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body || !res.headers.get("content-type")?.includes("ndjson")) {
          const json = await res.json().catch(() => null);
          fail(json?.message || "Something went wrong. Please try again.");
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let finished = false;
        while (!finished) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, nl).trim();
            buffer = buffer.slice(nl + 1);
            if (!line) continue;
            const evt = JSON.parse(line) as { type: string; text?: string; message?: string };
            if (evt.type === "delta" && evt.text) {
              pending += evt.text;
              if (!frame) frame = requestAnimationFrame(flush);
            } else if (evt.type === "error") {
              fail(evt.message || "The answer was interrupted. Please try again.");
              finished = true;
            } else if (evt.type === "done") {
              finished = true;
            }
          }
        }
        if (frame) cancelAnimationFrame(frame);
        flush();
        updateTurn(replyId, (t) => (t.error ? {} : { streaming: false, partial: !finished }));
      } catch (err) {
        if ((err as Error)?.name === "AbortError") {
          if (frame) cancelAnimationFrame(frame);
          flush();
          updateTurn(replyId, (t) => (t.content ? { streaming: false, partial: true } : { streaming: false, error: true, content: "Stopped." }));
        } else {
          fail("Couldn't reach the server. Check your connection and try again.");
        }
      } finally {
        abortRef.current = null;
        setSending(false);
      }
    },
    [turns, sending],
  );

  const stop = () => abortRef.current?.abort();

  const prompts = isPro ? PRACTITIONER_PROMPTS : PATIENT_PROMPTS;
  const blocked = available === false;

  return (
    <div className="h-[calc(100dvh-3.5rem)] flex flex-col max-w-4xl mx-auto">
      {/* Header */}
      <div className="px-4 sm:px-6 py-4 border-b border-border bg-background flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-ivory-gradient border border-copper/30 flex items-center justify-center">
            <Sparkles size={18} className="text-copper" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-semibold text-foreground">{assistantName}</h1>
              <span className="text-[10px] bg-herb-green/10 text-herb-green font-semibold px-2.5 py-0.5 rounded-full">Pilot</span>
              {isPro && <span className="text-[10px] bg-copper/10 text-copper font-semibold px-2 py-0.5 rounded-full">For Vaidyas</span>}
            </div>
            <p className="text-xs text-muted-foreground truncate">
              {isPro ? "Structured classical reference for learning · Not for patient-specific decisions" : "General Ayurveda wellness guidance · Non-diagnostic"}
            </p>
          </div>
          {turns.length > 0 && !sending && (
            <button
              onClick={() => setTurns([])}
              title="Clear chat"
              className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-neutral-100 transition-colors"
            >
              <RotateCcw size={16} />
            </button>
          )}
        </div>

        <div className="mt-3 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <span className="text-amber-500 text-sm mt-0.5">⚠️</span>
          <p className="text-[10px] text-amber-700 leading-relaxed font-medium">
            {isPro
              ? "AI-generated reference only. Verify against classical texts; final clinical judgment rests with the treating Vaidya. Do not enter patient names, phone numbers or records."
              : "AI-generated general information, not medical advice. Don't share personal details. For emergencies call 112. Consult a verified Vaidya for treatment."}
          </p>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className={cn("flex-1 overflow-y-auto px-4 sm:px-6 py-5", isPro ? "space-y-6 bg-ivory/40" : "space-y-4")}
      >
        {isPro ? <ProAnswer content={greeting} /> : <PatientBubble role="assistant" content={greeting} />}

        {blocked && (
          <div className="bg-red-50 border border-red-200 text-red-800 text-xs rounded-xl px-3 py-2.5">
            The AI Assistant isn&apos;t available right now. Please check back later.
          </div>
        )}

        {turns.length === 0 && !blocked && (
          <div>
            <p className="text-xs text-muted-foreground font-semibold mb-3 tracking-wide uppercase">
              {isPro ? "Try asking" : "Quick wellness topics"}
            </p>
            <div className={cn(isPro ? "grid grid-cols-1 sm:grid-cols-2 gap-2" : "flex flex-wrap gap-2")}>
              {prompts.map((p) => (
                <button
                  key={p}
                  onClick={() => send(p)}
                  disabled={sending || blocked}
                  className={cn(
                    "text-xs border border-border text-foreground bg-white hover:border-herb-green/40 hover:bg-herb-green/5 hover:text-herb-green transition-all shadow-sm active:scale-[0.98] disabled:opacity-50",
                    isPro ? "rounded-xl px-3.5 py-2.5 text-left" : "rounded-full px-3.5 py-1.5",
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map((t) =>
          t.role === "assistant" && t.streaming && !t.content ? (
            <Thinking key={t.id} detailed={isPro} />
          ) : isPro ? (
            t.role === "user" ? (
              <ProQuestion key={t.id} content={t.content} />
            ) : (
              <ProAnswer key={t.id} content={t.content} error={t.error} streaming={t.streaming} partial={t.partial} showActions={!t.error && !t.streaming} />
            )
          ) : (
            <PatientBubble key={t.id} role={t.role} content={t.content} error={t.error} at={t.at} streaming={t.streaming} />
          ),
        )}
      </div>

      {/* Input */}
      <div className="border-t border-border bg-background px-4 sm:px-6 py-3 flex-shrink-0">
        <div className="flex items-end gap-2.5">
          <div className="flex-1 bg-white border border-border rounded-2xl overflow-hidden focus-within:border-herb-green/50 focus-within:ring-2 focus-within:ring-herb-green/10 transition-all">
            <textarea
              rows={1}
              maxLength={MAX_INPUT}
              placeholder={isPro ? "Ask about a disease, concept, dravya or formulation…" : "Ask about diet, sleep, routines, Doshas…"}
              value={input}
              disabled={blocked}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send(input);
                }
              }}
              className="w-full px-4 py-3.5 text-sm resize-none focus:outline-none placeholder:text-muted-foreground bg-transparent max-h-40"
            />
          </div>
          {sending ? (
            <button
              onClick={stop}
              aria-label="Stop answering"
              title="Stop"
              className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 bg-foreground text-background hover:opacity-90 active:scale-95 transition-all"
            >
              <Square size={14} fill="currentColor" />
            </button>
          ) : (
            <button
              onClick={() => send(input)}
              disabled={!input.trim() || blocked}
              aria-label="Send"
              className={cn(
                "w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 transition-all",
                input.trim() && !blocked
                  ? "bg-herb-green text-white hover:bg-herb-green/90 shadow-md shadow-herb-green/15 active:scale-95"
                  : "bg-muted text-muted-foreground cursor-not-allowed",
              )}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          )}
        </div>
        <div className="flex items-center justify-between mt-2 text-[10px] text-muted-foreground">
          <span>Chat is kept in this tab only.</span>
          {isPro ? (
            <Link href="/pro" className="text-herb-green font-semibold hover:underline">Back to Dashboard</Link>
          ) : (
            <Link href="/discover" className="text-herb-green font-semibold hover:underline">Find a verified Vaidya</Link>
          )}
        </div>
      </div>
    </div>
  );
}

function Avatar() {
  return (
    <div className="w-8 h-8 rounded-xl bg-ivory-gradient border border-copper/25 flex items-center justify-center flex-shrink-0 shadow-sm">
      <Sparkles size={14} className="text-copper" />
    </div>
  );
}

function Thinking({ detailed }: { detailed: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <Avatar />
      <div className="flex items-center gap-1.5 bg-white border border-border/70 px-3.5 py-2.5 rounded-2xl shadow-sm">
        {[0, 1, 2].map((i) => (
          <div key={i} className="w-2 h-2 rounded-full bg-sage animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
        ))}
        <span className="ml-1.5 text-xs text-muted-foreground">{detailed ? "Preparing your answer…" : "Thinking…"}</span>
      </div>
    </div>
  );
}

function Cursor() {
  return <span aria-hidden className="inline-block w-[7px] h-[15px] ml-0.5 -mb-0.5 rounded-[2px] bg-herb-green/70 animate-pulse" />;
}

/* ---------------- Practitioner: structured answer cards ---------------- */

function ProQuestion({ content }: { content: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] bg-herb-green text-white text-[14.5px] leading-relaxed px-4 py-2.5 rounded-2xl rounded-br-md shadow-sm whitespace-pre-wrap break-words">
        {content}
      </div>
    </div>
  );
}

function ProAnswer({
  content,
  error,
  streaming,
  partial,
  showActions,
}: {
  content: string;
  error?: boolean;
  streaming?: boolean;
  partial?: boolean;
  showActions?: boolean;
}) {
  if (error) {
    return (
      <div className="flex gap-3">
        <Avatar />
        <div className="text-sm bg-red-50 text-red-800 border border-red-200 rounded-xl px-3.5 py-2.5">{content}</div>
      </div>
    );
  }
  return (
    <div className="flex gap-3">
      <div className="pt-1 hidden sm:block">
        <Avatar />
      </div>
      <div className="flex-1 min-w-0 bg-white border border-border/70 rounded-2xl shadow-sm px-4 py-4 sm:px-6 sm:py-5">
        <AiMarkdown content={content} />
        {streaming && <Cursor />}
        {(showActions || partial) && (
          <div className="mt-4 pt-3 border-t border-border/60 flex items-center justify-between gap-3">
            {showActions ? <CopyButton text={content} /> : <span />}
            <span className="text-[10.5px] text-muted-foreground">
              {partial ? "Answer stopped early" : "AI-generated · verify with classical texts"}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard blocked */
        }
      }}
      className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground px-2 py-1 -ml-2 rounded-lg hover:bg-neutral-100 transition-colors"
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

/* ---------------- Patient: simple plain-text bubbles ---------------- */

function PatientBubble({
  role,
  content,
  error,
  at,
  streaming,
}: {
  role: "user" | "assistant";
  content: string;
  error?: boolean;
  at?: number;
  streaming?: boolean;
}): ReactNode {
  const mine = role === "user";
  return (
    <div className={cn("flex items-end gap-2", mine ? "justify-end" : "justify-start")}>
      {!mine && <Avatar />}
      <div
        className={cn(
          "max-w-[85%] sm:max-w-[80%] text-sm leading-relaxed p-3.5 rounded-2xl shadow-sm border break-words whitespace-pre-wrap",
          mine
            ? "bg-herb-green text-white border-herb-green/20 rounded-br-none"
            : error
              ? "bg-red-50 text-red-800 border-red-200 rounded-bl-none"
              : "bg-white text-foreground border-border/70 rounded-bl-none",
        )}
      >
        {mine ? content : toPlainText(content)}
        {streaming && <Cursor />}
        {at && !streaming && (
          <p className={cn("text-[9px] mt-1.5 text-right", mine ? "text-white/60" : "text-muted-foreground/60")}>
            {new Date(at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
          </p>
        )}
      </div>
    </div>
  );
}
