"use client";

import { SITE_NAME } from "@/shared/config/site";
import { useCallback, useEffect, useState } from "react";
import { ChatInboxShell, type ChatMessage, type ChatThread } from "@/components/chat/ChatInboxShell";
import { uploadCommunityAttachment } from "@/lib/chat-attachments";
import { useAuth } from "@/contexts/auth-context";
import { useRealtimeSignal, useRealtimeTopics } from "@/hooks/use-realtime-signal";

type GroupMessage = {
  id: string;
  content: string;
  sentAt: string;
  senderName: string;
  isMine: boolean;
  attachment: { name: string; type: string; size: number; url: string } | null;
  replyTo: { senderName: string; content: string } | null;
  reactions: { emoji: string; count: number; mine: boolean }[];
};
type State = { isMember: boolean; memberCount: number };

// New messages arrive instantly via Realtime; polling is only a safety net.
const STATE_POLL_MS = 60000;
const MESSAGE_POLL_MS = 60000;
const GROUP_ID = "doctors-community";

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: "include", cache: "no-store", ...init });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.error || "Something went wrong");
  return result.data as T;
}

function act(action: string, payload: Record<string, unknown> = {}) {
  return api<void>("/api/community", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, payload }),
  });
}

export default function CommunityPage() {
  const { user } = useAuth();
  const isDoctor = user?.role === "practitioner";

  const [state, setState] = useState<State | null>(null);
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [activeId, setActiveId] = useState<string | null>(GROUP_ID);

  const loadState = useCallback(async () => {
    try {
      setState(await api<State>("/api/community"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load the community");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMessages = useCallback(async () => {
    try {
      setMessages(await api<GroupMessage[]>("/api/community?view=messages"));
    } catch (err) {
      console.error("Failed to load community messages:", err);
    }
  }, []);

  useEffect(() => {
    if (!isDoctor) return;
    void loadState();
    const interval = setInterval(loadState, STATE_POLL_MS);
    return () => clearInterval(interval);
  }, [isDoctor, loadState]);

  const isMember = !!state?.isMember;

  useEffect(() => {
    if (!isMember) {
      setMessages([]);
      return;
    }
    void loadMessages();
    const interval = setInterval(loadMessages, MESSAGE_POLL_MS);
    return () => clearInterval(interval);
  }, [isMember, loadMessages]);

  const { community: communityTopic } = useRealtimeTopics(isDoctor);
  useRealtimeSignal(isMember ? communityTopic : null, loadMessages);

  async function join() {
    setJoining(true);
    setError(null);
    try {
      await act("join");
      await loadState();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to join");
    } finally {
      setJoining(false);
    }
  }

  async function leave() {
    if (!window.confirm("Leave the doctors' community group? You can rejoin any time.")) return;
    try {
      await act("leave");
      await loadState();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to leave");
    }
  }

  async function handleSend(e: React.FormEvent, file: File | null, replyToId: string | null): Promise<boolean> {
    e.preventDefault();
    const content = input.trim();
    if ((!content && !file) || sending) return false;
    setError(null);

    if (!file) {
      // Text: show it instantly and let the doctor keep typing while it sends.
      const tempId = `pending-${Date.now()}`;
      const target = replyToId ? messages.find((m) => m.id === replyToId) : undefined;
      setMessages((prev) => [
        ...prev,
        {
          id: tempId,
          content,
          sentAt: "Sending…",
          senderName: "You",
          isMine: true,
          attachment: null,
          replyTo: target ? { senderName: target.isMine ? "You" : target.senderName, content: target.content || "Attachment" } : null,
          reactions: [],
        },
      ]);
      setInput("");
      act("sendMessage", { content, replyToId })
        .then(loadMessages)
        .catch((err) => {
          setMessages((prev) => prev.filter((m) => m.id !== tempId));
          setInput((current) => current || content);
          setError(err instanceof Error ? err.message : "Failed to send message");
        });
      return true;
    }

    setSending(true);
    try {
      const attachment = await uploadCommunityAttachment(file);
      await act("sendMessage", { content, replyToId, attachment });
      setInput("");
      await loadMessages();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message");
      return false;
    } finally {
      setSending(false);
    }
  }

  async function handleReact(messageId: string, emoji: string) {
    // Reflect the toggle immediately (one reaction per doctor per message).
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId) return m;
        const previous = m.reactions.find((r) => r.mine);
        let reactions = m.reactions
          .map((r) => (r.mine ? { ...r, count: r.count - 1, mine: false } : r))
          .filter((r) => r.count > 0);
        if (previous?.emoji !== emoji) {
          const existing = reactions.find((r) => r.emoji === emoji);
          reactions = existing
            ? reactions.map((r) => (r.emoji === emoji ? { ...r, count: r.count + 1, mine: true } : r))
            : [...reactions, { emoji, count: 1, mine: true }];
        }
        return { ...m, reactions };
      })
    );
    try {
      await act("react", { messageId, emoji });
      await loadMessages();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to react");
      void loadMessages();
    }
  }

  if (user && !isDoctor) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-10 max-w-xl mx-auto text-center text-sm text-muted-foreground">
        The community is available to doctors only.
      </div>
    );
  }

  if (loading || !state) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 rounded-full border-2 border-herb-green border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!state.isMember) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-10 max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl border border-border shadow-sm p-10 text-center">
          <div className="w-16 h-16 rounded-2xl bg-herb-gradient flex items-center justify-center mx-auto mb-5 shadow-sm">
            <span className="text-3xl">🩺</span>
          </div>
          <h1 className="font-display text-2xl font-bold text-foreground">{SITE_NAME} Doctors&apos; Community</h1>
          <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto leading-relaxed">
            A group chat for every doctor on {SITE_NAME} to discuss cases, share experience and learn from one another.
          </p>
          <p className="text-xs text-muted-foreground mt-4">
            {state.memberCount} {state.memberCount === 1 ? "doctor has" : "doctors have"} joined
          </p>
          {error && <p className="text-xs text-red-600 mt-3">{error}</p>}
          <button
            onClick={join}
            disabled={joining}
            className="mt-6 px-8 py-2.5 rounded-xl bg-herb-gradient text-white text-sm font-semibold shadow-sm hover:brightness-110 transition disabled:opacity-50"
          >
            {joining ? "Joining..." : "Join Community"}
          </button>
        </div>
      </div>
    );
  }

  const last = messages[messages.length - 1];
  const threads: ChatThread[] = [
    {
      id: GROUP_ID,
      name: "Doctors’ Community",
      initials: "DC",
      lastMessage: last ? `${last.isMine ? "You" : last.senderName}: ${last.content || "📎 Attachment"}` : "Say hello to your fellow doctors",
      lastMessageTime: "",
      unread: false,
      unreadCount: 0,
    },
  ];

  const chatMessages: ChatMessage[] = messages.map((m) => ({
    id: m.id,
    content: m.content,
    sentAt: m.sentAt,
    isMine: m.isMine,
    senderName: m.senderName,
    attachment: m.attachment,
    replyTo: m.replyTo,
    reactions: m.reactions,
  }));

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-5">
      <ChatInboxShell
        title="Community"
        subtitle={`Group chat · ${SITE_NAME} doctors only`}
        threads={threads}
        threadsLoading={false}
        emptyThreadsTitle=""
        emptyThreadsSubtitle=""
        activeId={activeId}
        onSelectThread={(id) => setActiveId(id || null)}
        messages={chatMessages}
        inputValue={input}
        onInputChange={setInput}
        onSend={handleSend}
        errorMessage={error}
        sending={sending}
        headerActionLabel="Leave group"
        onHeaderAction={leave}
        composerHint="Visible to all doctors in the community"
        statusLine={`${state.memberCount} ${state.memberCount === 1 ? "member" : "members"}`}
        allowAttachments
        enableReply
        onReact={handleReact}
      />
    </div>
  );
}
