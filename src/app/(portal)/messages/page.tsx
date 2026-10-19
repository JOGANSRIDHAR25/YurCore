"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { ChatInboxShell, type ChatThread, type ChatMessage } from "@/components/chat/ChatInboxShell";
import { uploadChatAttachment } from "@/lib/chat-attachments";
import type { PatientInboxThread, MessageRow } from "./type";
import { setNavContext } from "@/lib/nav-context-client";
import { useRealtimeSignal, useRealtimeTopics } from "@/hooks/use-realtime-signal";

// New messages arrive instantly via Realtime; polling is only a safety net.
const INBOX_POLL_MS = 60000;
const THREAD_POLL_MS = 60000;

async function fetchInbox(): Promise<PatientInboxThread[]> {
  const response = await fetch("/api/patient-inbox", { method: "GET", credentials: "include", cache: "no-store" });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.error || "Unable to load messages");
  }
  return result.data as PatientInboxThread[];
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

export default function MessagesPage() {
  const router = useRouter();
  const [threads, setThreads] = useState<PatientInboxThread[]>([]);
  const [inboxLoading, setInboxLoading] = useState(true);
  const [messages, setMessages] = useState<MessageRow[]>([]);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const activeThread = threads.find((t) => t.id === activeId) ?? null;

  const loadInbox = useCallback(async () => {
    try {
      const data = await fetchInbox();
      setThreads(data);
    } catch (err) {
      console.error("Failed to load messages inbox:", err);
    } finally {
      setInboxLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadInbox();
    const interval = setInterval(loadInbox, INBOX_POLL_MS);
    return () => clearInterval(interval);
  }, [loadInbox]);

  const activeConsultationRef = useRef<string | null>(null);
  activeConsultationRef.current = activeThread?.consultationId ?? null;

  const loadMessages = useCallback(async (consultationId: string) => {
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
    if ((!inputText.trim() && !file) || !activeThread || sending) return false;
    const content = inputText.trim();
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
          direction: "patient_to_doctor",
          content,
          sentAt: "Sending…",
          isRead: false,
          attachment: null,
          replyTo: replyTarget ? { direction: replyTarget.direction, content: replyTarget.content } : null,
        },
      ]);
      setInputText("");
      sendMessage(consultationId, content, undefined, replyToId)
        .then(refresh)
        .catch((err) => {
          console.error("Failed to send message:", err);
          setMessages((prev) => prev.filter((m) => m.id !== tempId));
          setInputText((current) => current || content);
          setSendError(err instanceof Error ? err.message : "Failed to send message");
        });
      return true;
    }

    setSending(true);
    try {
      const attachment = await uploadChatAttachment(consultationId, file);
      await sendMessage(consultationId, content, attachment, replyToId);
      setInputText("");
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

  async function handleViewDoctor() {
    if (!activeThread) return;
    await setNavContext("doctor", { doctorId: activeThread.practitionerId });
    router.push("/doctor");
  }

  const chatThreads: ChatThread[] = threads.map((t) => ({
    id: t.id,
    name: t.doctorName,
    initials: t.doctorInitials,
    lastMessage: t.lastMessage,
    lastMessageTime: t.lastMessageTime,
    unread: t.unread,
    unreadCount: t.unreadCount,
    // Family members share this inbox — label whose conversation it is.
    ...(t.isFamilyMember
      ? {
          tag: `For ${t.patientName}`,
          headerContext: `About ${t.patientName}${t.relationship ? ` (${t.relationship})` : ""} · family member`,
        }
      : {}),
  }));

  const chatMessages: ChatMessage[] = messages.map((m) => ({
    id: m.id,
    content: m.content,
    sentAt: m.sentAt,
    attachment: m.attachment,
    isRead: m.isRead,
    senderName: m.direction === "patient_to_doctor" ? "You" : activeThread?.doctorName,
    replyTo: m.replyTo
      ? {
          senderName: m.replyTo.direction === "patient_to_doctor" ? "You" : activeThread?.doctorName ?? "Message",
          content: m.replyTo.content,
        }
      : null,
    isMine: m.direction === "patient_to_doctor",
  }));

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-5">
      <ChatInboxShell
        title="Messages"
        subtitle="Bounded messaging · ABDM compliant"
        threads={chatThreads}
        threadsLoading={inboxLoading}
        emptyThreadsTitle="No conversations yet"
        emptyThreadsSubtitle="Once you complete a consultation, you can chat with your doctor here."
        activeId={activeId}
        onSelectThread={(id) => setActiveId(id || null)}
        messages={chatMessages}
        inputValue={inputText}
        onInputChange={setInputText}
        onSend={handleSend}
        errorMessage={sendError}
        enableReply
        sending={sending}
        headerActionLabel="View Doctor"
        onHeaderAction={handleViewDoctor}
        composerHint={
          activeThread?.isFamilyMember
            ? `You're writing on behalf of ${activeThread.patientName} · visible to your doctor`
            : "Visible to your doctor in their practitioner portal"
        }
        statusLine="Encrypted · ABDM compliant"
      />
    </div>
  );
}
