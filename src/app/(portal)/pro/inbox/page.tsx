"use client";

import { SITE_NAME } from "@/shared/config/site";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { ChatInboxShell, type ChatThread, type ChatMessage } from "@/components/chat/ChatInboxShell";
import { uploadChatAttachment } from "@/lib/chat-attachments";
import type { InboxThread, MessageRow } from "./type";
import { setNavContext } from "@/lib/nav-context-client";
import { useRealtimeSignal, useRealtimeTopics } from "@/hooks/use-realtime-signal";

// New messages arrive instantly via Realtime; polling is only a safety net.
const INBOX_POLL_MS = 60000;
const THREAD_POLL_MS = 60000;

async function fetchInbox(): Promise<InboxThread[]> {
  const response = await fetch("/api/pro-inbox", { method: "GET", credentials: "include", cache: "no-store" });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.error || "Unable to load inbox");
  }
  return result.data as InboxThread[];
}

async function fetchMessages(consultationId: string): Promise<MessageRow[]> {
  const response = await fetch(`/api/message?consultationId=${consultationId}`, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.error || "Unable to load messages");
  }
  return result.data as MessageRow[];
}

async function sendMessage(
  consultationId: string,
  content: string,
  attachment?: { path: string; name: string; type: string; size: number },
  replyToId?: string | null
): Promise<void> {
  const response = await fetch("/api/message", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ consultationId, content, attachment, replyToId }),
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.error || "Unable to send message");
  }
}

export default function InboxPage() {
  const router = useRouter();
  const [threads, setThreads] = useState<InboxThread[]>([]);
  const [inboxLoading, setInboxLoading] = useState(true);
  const [messages, setMessages] = useState<MessageRow[]>([]);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const loadInbox = useCallback(async (): Promise<void> => {
    try {
      const data = await fetchInbox();
      setThreads(data);
    } catch (err) {
      console.error("Failed to load inbox:", err);
    } finally {
      setInboxLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadInbox();
    const interval = setInterval(loadInbox, INBOX_POLL_MS);
    return () => clearInterval(interval);
  }, [loadInbox]);

  const activeThread = threads.find((t) => t.id === activeId) ?? null;

  const activeConsultationRef = useRef<string | null>(null);
  activeConsultationRef.current = activeThread?.consultationId ?? null;

  const loadMessages = useCallback(async (consultationId: string): Promise<void> => {
    try {
      const data = await fetchMessages(consultationId);
      // A late response for a thread the user already left must not replace the open one.
      if (activeConsultationRef.current && activeConsultationRef.current !== consultationId) return;
      setMessages(data);
    } catch (err) {
      console.error("Failed to load messages:", err);
    }
  }, []);

  useEffect(() => {
    if (!activeThread?.consultationId) {
      setMessages([]);
      return;
    }
    setMessages([]);
    void loadMessages(activeThread.consultationId);
    const interval = setInterval(() => loadMessages(activeThread.consultationId), THREAD_POLL_MS);
    return () => clearInterval(interval);
  }, [activeThread?.consultationId, loadMessages]);

  const { inbox: inboxTopic } = useRealtimeTopics();
  useRealtimeSignal(
    inboxTopic,
    useCallback(() => {
      void loadInbox();
      if (activeConsultationRef.current) void loadMessages(activeConsultationRef.current);
    }, [loadInbox, loadMessages])
  );

  async function handleSend(e: React.FormEvent, file: File | null, replyToId: string | null): Promise<boolean> {
    e.preventDefault();
    if ((!message.trim() && !file) || !activeThread || sending) return false;
    const content = message.trim();
    const consultationId = activeThread.consultationId;
    setSendError(null);

    // Refresh the thread and the inbox together once the server has the message.
    const refresh = () => Promise.all([loadMessages(consultationId), loadInbox()]);

    if (!file) {
      // Text: show it instantly and let the user keep typing while it sends.
      const tempId = `pending-${Date.now()}`;
      const replyTarget = replyToId ? messages.find((m) => m.id === replyToId) : undefined;
      setMessages((prev) => [
        ...prev,
        {
          id: tempId,
          consultationId,
          senderName: "You",
          direction: "doctor_to_patient",
          content,
          sentAt: "Sending…",
          isRead: false,
          attachment: null,
          replyTo: replyTarget ? { direction: replyTarget.direction, content: replyTarget.content } : null,
        },
      ]);
      setMessage("");
      sendMessage(consultationId, content, undefined, replyToId)
        .then(refresh)
        .catch((err) => {
          console.error("Failed to send message:", err);
          setMessages((prev) => prev.filter((m) => m.id !== tempId));
          setMessage((current) => current || content);
          setSendError(err instanceof Error ? err.message : "Failed to send message");
        });
      return true;
    }

    setSending(true);
    try {
      const attachment = await uploadChatAttachment(consultationId, file);
      await sendMessage(consultationId, content, attachment, replyToId);
      setMessage("");
      await refresh();
      return true;
    } catch (err) {
      console.error("Failed to send message:", err);
      setSendError(err instanceof Error ? err.message : "Failed to send message");
      return false;
    } finally {
      setSending(false);
    }
  }

  async function handleViewIntake() {
    if (!activeThread) return;
    await setNavContext("patient", { patientId: activeThread.patientId });
    router.push("/pro/patient");
  }

  const chatThreads: ChatThread[] = threads.map((t) => ({
    id: t.id,
    name: t.patientName,
    initials: t.patientInitials,
    lastMessage: t.lastMessage,
    lastMessageTime: t.lastMessageTime,
    unread: t.unread,
    unreadCount: t.unreadCount,
    ...(t.familyOf
      ? {
          tag: `Family of ${t.familyOf.name}`,
          headerContext: `${t.familyOf.relationship ? `${t.familyOf.relationship} of ` : "Family member of "}${t.familyOf.name} · replies come from ${t.familyOf.name}'s account`,
        }
      : {}),
  }));

  const incomingSender = activeThread?.familyOf
    ? `${activeThread.familyOf.name} (for ${activeThread.patientName})`
    : activeThread?.patientName;

  const chatMessages: ChatMessage[] = messages.map((m) => ({
    id: m.id,
    content: m.content,
    sentAt: m.sentAt,
    attachment: m.attachment,
    isRead: m.isRead,
    // A family member has no login — their account owner writes on their behalf.
    senderName: m.direction === "doctor_to_patient" ? "You" : incomingSender,
    replyTo: m.replyTo
      ? {
          senderName: m.replyTo.direction === "doctor_to_patient" ? "You" : incomingSender ?? "Message",
          content: m.replyTo.content,
        }
      : null,
    isMine: m.direction === "doctor_to_patient",
  }));

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-5">
      <ChatInboxShell
        title="Inbox"
        subtitle="Bounded messaging · ABDM compliant"
        threads={chatThreads}
        threadsLoading={inboxLoading}
        emptyThreadsTitle="No conversations yet"
        emptyThreadsSubtitle="Secure post-consultation chat channels will appear here once you initiate messages or patients consult you."
        activeId={activeId}
        onSelectThread={(id) => setActiveId(id || null)}
        messages={chatMessages}
        inputValue={message}
        onInputChange={setMessage}
        onSend={handleSend}
        errorMessage={sendError}
        enableReply
        sending={sending}
        headerActionLabel="View Intake"
        onHeaderAction={handleViewIntake}
        composerHint={
          activeThread?.familyOf
            ? `About ${activeThread.patientName} · delivered to ${activeThread.familyOf.name}'s ${SITE_NAME} account (account owner)`
            : `Visible to patient in their ${SITE_NAME} app`
        }
        statusLine="Active patient · Bounded channel · Encrypted"
      />
    </div>
  );
}
