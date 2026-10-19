"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import type { ChatMessage } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/auth-context";

const PATIENT_PROMPTS = [
  "Configure my Dinacharya",
  "Balance Pitta dosha",
  "Tips for better Nidra (sleep)",
  "Strengthen my Agni",
  "Panchakarma (Shodhana) benefits",
  "Ritucharya for this season",
  "Immunity (Ojas) boosters",
  "Manage Chittodvega (stress)",
];

const PRACTITIONER_PROMPTS = [
  "Symptom-to-Nidana analysis",
  "Suggest herbs for Pitta Vikriti",
  "Check herb interaction / opposing Virya",
  "Formulate SOAP template for Prameha",
  "Anupana intelligence for Jwara",
  "Samprapti mapping for Amavata",
  "List classical herbs for Swasa (breathing)",
  "Nuskha recommendations for Sluggish Agni",
];

interface ModelState {
  loaded: boolean;
  message: string;
  progress: number;
  error: string | null;
}

export default function AIChatPage() {
  const { user } = useAuth();
  const isPractitioner = user?.role === "practitioner";

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  
  // Model state variables
  const [modelState, setModelState] = useState<ModelState>({
    loaded: false,
    message: "Checking model status...",
    progress: 0,
    error: null,
  });
  const [isInitializing, setIsInitializing] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Set initial messages dynamically based on user role when user object is loaded
  useEffect(() => {
    if (user) {
      setMessages([
        {
          id: "ai-0",
          role: "ai",
          content: isPractitioner
            ? "Pranam Vaidya-ji 🙏 I am Vaidya Sahayak AI, your clinical co-pilot. I can assist you with Symptom-to-Nidana mapping, herb suggestion checks for opposing Virya, and formulating classical Nuskha templates.\n\nWhat clinical case can I assist you with today?"
            : "Namaste 🙏 I am AyurSanvaad AI, powered by the AyurParam 2.9B LLM. I can help you structure your daily Dinacharya routines, analyze Dosha imbalances, and guide you towards health remedies.\n\nWhat brings you here today? How is your Agni and Nidra?",
          timestamp: new Date(),
        },
      ]);
    }
  }, [user, isPractitioner]);

  // Poll status from the API route
  const checkStatus = async () => {
    try {
      const res = await fetch("/api/ai-chat");
      if (res.ok) {
        const data = await res.json();
        setModelState({
          loaded: data.loaded,
          message: data.message,
          progress: data.progress,
          error: data.error,
        });

        // Stop polling if loaded or if there's an error
        if (data.loaded) {
          setIsInitializing(false);
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
        } else if (data.error) {
          setIsInitializing(false);
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
        }
      }
    } catch (e: any) {
      setModelState((prev) => ({
        ...prev,
        error: "Failed to connect to backend server. Make sure the database and API are running.",
      }));
      setIsInitializing(false);
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    }
  };

  // Run status check on mount
  useEffect(() => {
    checkStatus();
    
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  // Start polling
  const startPolling = () => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    pollIntervalRef.current = setInterval(checkStatus, 800);
  };

  // Trigger model loading
  const initializeModel = async () => {
    setIsInitializing(true);
    setModelState((prev) => ({
      ...prev,
      error: null,
      message: "Starting background server and initializing thread...",
      progress: 5,
    }));

    try {
      const res = await fetch("/api/ai-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "load" }),
      });

      if (res.ok) {
        const data = await res.json();
        setModelState({
          loaded: data.loaded || false,
          message: data.message || "Initializing...",
          progress: data.progress || 5,
          error: data.error || null,
        });
        
        // Start polling for real-time progress updates
        startPolling();
      } else {
        const err = await res.json();
        setModelState((prev) => ({
          ...prev,
          error: err.error || "Failed to trigger initialization.",
        }));
        setIsInitializing(false);
      }
    } catch (e: any) {
      setModelState((prev) => ({
        ...prev,
        error: e.message || "Connection refused.",
      }));
      setIsInitializing(false);
    }
  };

  // Send message
  async function sendMessage(text: string) {
    if (!text.trim() || isTyping) return;
    
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: text,
      timestamp: new Date(),
    };
    
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);

    try {
      const res = await fetch("/api/ai-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "chat", message: text, role: user?.role || "patient" }),
      });

      if (res.ok) {
        const data = await res.json();
        const aiMsg: ChatMessage = {
          id: `ai-${Date.now()}`,
          role: "ai",
          content: data.response,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, aiMsg]);
      } else {
        const errData = await res.json();
        const errorMsg: ChatMessage = {
          id: `err-${Date.now()}`,
          role: "ai",
          content: `⚠️ Chikitsa Error: ${errData.error || "The model failed to generate a response. Please try again."}`,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, errorMsg]);
      }
    } catch (e: any) {
      const errorMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        role: "ai",
        content: `⚠️ Connection Error: Failed to communicate with the model server (${e.message}). Please ensure the local service is running.`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsTyping(false);
    }
  }

  const quickPrompts = isPractitioner ? PRACTITIONER_PROMPTS : PATIENT_PROMPTS;

  // Loading Screen rendering when model is not ready
  if (!modelState.loaded) {
    return (
      <div className="h-[calc(100vh-3.5rem)] flex items-center justify-center bg-ivory p-4">
        <div className="w-full max-w-lg bg-white rounded-3xl border border-border/80 shadow-xl overflow-hidden p-6 sm:p-8 space-y-6 animate-in fade-in zoom-in-95 duration-300">
          
          {/* Logo / Header */}
          <div className="flex flex-col items-center text-center space-y-3">
            <div className="w-16 h-16 rounded-2xl bg-ivory-gradient border-2 border-copper/30 flex items-center justify-center shadow-md shadow-copper/5">
              <span className="text-3xl">✨</span>
            </div>
            <div className="space-y-1">
              <h1 className="font-display text-2xl font-bold text-foreground">
                {isPractitioner ? "Vaidya Sahayak Loader" : "AyurParam AI Loader"}
              </h1>
              <p className="text-xs text-muted-foreground max-w-sm">
                Initializing <strong>bharatgenai/AyurParam</strong> (2.9B LLM) — Sovereign AI tuned for classical Ayurvedic text interpretation and clinical insights.
              </p>
            </div>
          </div>

          {/* Model info banner */}
          <div className="bg-ivory-deep border border-sand rounded-2xl p-4 text-xs space-y-2 text-foreground/80 leading-relaxed">
            <div className="flex justify-between border-b border-sand/50 pb-1.5 font-mono text-[10px] text-muted-foreground">
              <span>MODEL IDENTIFIER</span>
              <span className="font-bold text-herb-green">bharatgenai/AyurParam</span>
            </div>
            {isPractitioner ? (
              <>
                <p>
                  🎓 <strong>Clinician Reference:</strong> Grounded in Ayurvedic treatises (Charaka, Sushruta, Vagbhata) to map pathogenesis (*Samprapti*) and suggest clinical *Aushadhi* formulations.
                </p>
                <p>
                  🔬 <strong>Precision Tools:</strong> Ready for opposing *Virya* checks, *Anupana* optimization, and pre-formatted EMR SOAP notes.
                </p>
              </>
            ) : (
              <>
                <p>
                  🌿 <strong>Ayurvedic Grounding:</strong> Trained on classical treatises for general *Nidana* (wellness) and *Chikitsa* (remedial) routine guidance.
                </p>
                <p>
                  🖥️ <strong>Local Compute:</strong> Runs directly on your device. First load initializes weights and loads layers into active memory.
                </p>
              </>
            )}
          </div>

          {/* Progress Section */}
          {(isInitializing || modelState.progress > 0) && (
            <div className="space-y-2.5 animate-in slide-in-from-bottom-3 duration-250">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-herb-green flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-herb-green animate-ping" />
                  {modelState.message}
                </span>
                <span className="font-bold text-foreground">{modelState.progress}%</span>
              </div>
              
              {/* Progress track */}
              <div className="w-full h-2.5 bg-sand rounded-full overflow-hidden">
                <div
                  className="h-full bg-herb-green rounded-full transition-all duration-300 ease-out shadow-sm"
                  style={{ width: `${modelState.progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Error Banner */}
          {modelState.error && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-2xl p-3.5 flex items-start gap-2.5 animate-in shake duration-300">
              <span className="text-destructive text-lg">⚠️</span>
              <div className="flex-1 space-y-1">
                <p className="text-xs font-bold text-destructive">Initialization Failed</p>
                <p className="text-[11px] text-destructive/80 leading-normal">{modelState.error}</p>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col space-y-2">
            {!isInitializing && (
              <button
                onClick={initializeModel}
                className="w-full py-3.5 bg-herb-green text-white hover:bg-herb-green/90 transition-all font-semibold rounded-2xl shadow-md shadow-herb-green/10 active:scale-[0.98]"
              >
                {modelState.error ? "Retry Initializing Model" : "Initialize AyurParam Model"}
              </button>
            )}
            {isInitializing && (
              <button
                disabled
                className="w-full py-3.5 bg-sand text-muted-foreground font-semibold rounded-2xl flex items-center justify-center gap-2.5 cursor-not-allowed"
              >
                <span className="w-4 h-4 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
                Loading Model Weights...
              </button>
            )}
            <Link
              href={isPractitioner ? "/pro" : "/discover"}
              className="text-xs text-center text-muted-foreground hover:text-herb-green font-medium py-1 hover:underline transition-colors"
            >
              {isPractitioner ? "Skip and Open Patient Registry" : "Skip and Find a verified Vaidya instead"}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Main chat screen when model loaded successfully
  return (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col max-w-4xl mx-auto animate-in fade-in duration-300">
      {/* Chat header */}
      <div className="px-4 sm:px-6 py-4 border-b border-border bg-background flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-ivory-gradient border border-copper/30 flex items-center justify-center">
            <span className="text-lg">✨</span>
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-semibold text-foreground">
                {isPractitioner ? "Vaidya Sahayak AI" : "AyurSanvaad AI"}
              </h1>
              <span className="text-[10px] bg-herb-green/10 text-herb-green font-semibold px-2.5 py-0.5 rounded-full flex items-center gap-1">
                <span className="w-1 h-1 rounded-full bg-herb-green animate-pulse" />
                AyurParam 2.9B
              </span>
              {isPractitioner && (
                <span className="text-[10px] bg-copper/10 text-copper font-semibold px-2 py-0.5 rounded-full">
                  Clinical Co-Pilot
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {isPractitioner
                ? "Clinical Reference & EMR Assistant · For Qualified Vaidyas"
                : "Swasthya Vrittanta & Chikitsa Guidance · Non-diagnostic"}
            </p>
          </div>
          <div className="flex items-center gap-1.5 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200/50">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
            <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">Active</span>
          </div>
        </div>

        <div className="mt-3 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <span className="text-amber-500 text-sm mt-0.5">⚠️</span>
          <p className="text-[10px] text-amber-700 leading-relaxed font-medium">
            {isPractitioner
              ? "Vaidya Sahayak AI is a clinical co-pilot designed to reference treatises. Final clinical judgment remains solely with the practicing Vaidya."
              : "AyurSanvaad AI provides general wellness guidance only. It is not a substitute for clinical Nidana. Consult a verified Vaidya for medical advice."}
          </p>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4">
        {messages.length === 1 && (
          <div>
            <p className="text-xs text-muted-foreground font-semibold mb-3 tracking-wide uppercase">
              {isPractitioner ? "Case assistance workflows" : "Quick wellness topics"}
            </p>
            <div className="flex flex-wrap gap-2">
              {quickPrompts.map((p) => (
                <button
                  key={p}
                  onClick={() => sendMessage(p)}
                  className="text-xs border border-border rounded-full px-3.5 py-1.5 text-foreground bg-white hover:border-herb-green/40 hover:bg-herb-green/5 hover:text-herb-green transition-all shadow-sm active:scale-95 cursor-pointer"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
            {msg.role === "ai" && (
              <div className="w-7 h-7 rounded-lg bg-ivory-gradient border border-copper/20 flex items-center justify-center flex-shrink-0 mr-2 mt-auto">
                <span className="text-sm">✨</span>
              </div>
            )}
            <div className={cn("max-w-[80%] text-sm leading-relaxed p-3.5 rounded-2xl shadow-sm border", 
              msg.role === "user" 
                ? "bg-herb-green text-white border-herb-green/20 rounded-br-none" 
                : msg.content.startsWith("⚠️") 
                  ? "bg-red-50 text-red-800 border-red-200 rounded-bl-none font-medium" 
                  : "bg-white text-foreground border-border/70 rounded-bl-none"
            )}>
              {msg.content.split("\n").map((line, i, arr) => (
                <span key={i} className="block min-h-[0.5rem]">
                  {/* Basic markdown rendering for bold headers and bullet points */}
                  {line.startsWith("###") ? (
                    <span className="block font-display text-base font-bold text-foreground/90 mt-2 mb-1">
                      {line.replace("###", "").trim()}
                    </span>
                  ) : line.startsWith("####") ? (
                    <span className="block text-sm font-bold text-foreground/90 mt-2 mb-0.5">
                      {line.replace("####", "").trim()}
                    </span>
                  ) : line.startsWith("* **") || line.startsWith("   * **") || line.startsWith("• **") ? (
                    <span className="pl-2">
                      • <strong>{line.replace(/^(\s*\*\s*\*\*|\s*•\s*\*\*)/, "").split("**")[0]}</strong>
                      {line.split("**").slice(2).join("**")}
                    </span>
                  ) : line.startsWith("1. **") || line.startsWith("2. **") || line.startsWith("3. **") || line.startsWith("4. **") || line.startsWith("5. **") ? (
                    <span className="pl-1">
                      {line.split("**")[0]}<strong>{line.split("**")[1]}</strong>
                      {line.split("**").slice(2).join("**")}
                    </span>
                  ) : line.startsWith("*") || line.startsWith("•") ? (
                    <span className="pl-3 block">
                      • {line.substring(1).trim()}
                    </span>
                  ) : line.startsWith("```") ? (
                    null // Hide markdown block identifiers
                  ) : (
                    <span>
                      {/* Sub-bold highlights inside plain sentences */}
                      {line.includes("**") ? (
                        <span>
                          {line.split("**").map((chunk, idx) => 
                            idx % 2 === 1 ? <strong key={idx}>{chunk}</strong> : chunk
                          )}
                        </span>
                      ) : (
                        line
                      )}
                    </span>
                  )}
                </span>
              ))}
              <p className={cn("text-[9px] mt-2 text-right tracking-wide", msg.role === "user" ? "text-white/60" : "text-muted-foreground/60")}>
                {new Date(msg.timestamp).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          </div>
        ))}

        {isTyping && (
          <div className="flex items-end gap-2">
            <div className="w-7 h-7 rounded-lg bg-ivory-gradient border border-copper/20 flex items-center justify-center flex-shrink-0">
              <span className="text-sm">✨</span>
            </div>
            <div className="bg-white border border-border/70 p-4 rounded-2xl rounded-bl-none shadow-sm flex items-center gap-1.5">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="w-2.5 h-2.5 rounded-full bg-sage animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input controls */}
      <div className="border-t border-border bg-background px-4 sm:px-6 py-4 flex-shrink-0">
        <div className="flex items-end gap-2.5">
          <div className="flex-1 bg-white border border-border rounded-2xl overflow-hidden focus-within:border-herb-green/50 focus-within:ring-2 focus-within:ring-herb-green/10 transition-all">
            <textarea
              rows={1}
              placeholder={isPractitioner ? "Enter case presentation, symptoms, check herb compatibility..." : "Ask about wellness, remedies, Nidra, Dinacharya..."}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage(input);
                }
              }}
              className="w-full px-4 py-3.5 text-sm resize-none focus:outline-none placeholder:text-muted-foreground bg-transparent"
            />
          </div>
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || isTyping}
            className={cn(
              "w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 transition-all cursor-pointer",
              input.trim() && !isTyping
                ? "bg-herb-green text-white hover:bg-herb-green/90 shadow-md shadow-herb-green/15 active:scale-95"
                : "bg-muted text-muted-foreground cursor-not-allowed"
            )}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
        <div className="flex items-center justify-center mt-3">
          {isPractitioner ? (
            <Link href="/pro" className="text-xs text-herb-green font-semibold flex items-center gap-1 hover:underline">
              <span>📋</span> Go back to Patient Registry
            </Link>
          ) : (
            <Link href="/discover" className="text-xs text-herb-green font-semibold flex items-center gap-1 hover:underline">
              <span>🩺</span> Find a verified Vaidya instead
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
