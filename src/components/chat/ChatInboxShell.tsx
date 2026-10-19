"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { CHAT_ATTACHMENT_ACCEPT, formatFileSize, validateChatAttachment } from "@/lib/chat-attachments";

export type ChatThread = {
  id: string;
  name: string;
  initials: string;
  lastMessage: string;
  lastMessageTime: string;
  unread: boolean;
  unreadCount: number;
  /** Short label shown beside the name, e.g. "Family of sridhar" or "For sam". */
  tag?: string;
  /** Replaces the status line in the conversation header for this thread. */
  headerContext?: string;
};

export type ChatMessage = {
  id: string;
  content: string;
  sentAt: string;
  isMine: boolean;
  isRead?: boolean;
  senderName?: string;
  replyTo?: { senderName: string; content: string } | null;
  reactions?: { emoji: string; count: number; mine: boolean }[];
  attachment?: { name: string; type: string; size: number; url: string } | null;
};

interface ChatInboxShellProps {
  title: string;
  subtitle: string;
  threads: ChatThread[];
  threadsLoading: boolean;
  emptyThreadsTitle: string;
  emptyThreadsSubtitle: string;
  activeId: string | null;
  onSelectThread: (id: string) => void;
  messages: ChatMessage[];
  inputValue: string;
  onInputChange: (value: string) => void;
  onSend: (e: React.FormEvent, file: File | null, replyToId: string | null) => Promise<boolean> | boolean | void;
  errorMessage?: string | null;
  sending: boolean;
  headerActionLabel?: string;
  onHeaderAction?: () => void;
  composerHint: string;
  statusLine: string;
  allowAttachments?: boolean;
  enableReply?: boolean;
  onReact?: (messageId: string, emoji: string) => void;
}

const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "🙏", "😢"];

export function ChatInboxShell({
  title,
  subtitle,
  threads,
  threadsLoading,
  emptyThreadsTitle,
  emptyThreadsSubtitle,
  activeId,
  onSelectThread,
  messages,
  inputValue,
  onInputChange,
  onSend,
  errorMessage,
  sending,
  headerActionLabel,
  onHeaderAction,
  composerHint,
  statusLine,
  allowAttachments = true,
  enableReply = false,
  onReact,
}: ChatInboxShellProps) {
  const [search, setSearch] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const activeThread = threads.find((t) => t.id === activeId) ?? null;

  const filteredThreads = useMemo(() => {
    if (!search.trim()) return threads;
    const q = search.trim().toLowerCase();
    return threads.filter((t) => t.name.toLowerCase().includes(q) || (t.tag ?? "").toLowerCase().includes(q));
  }, [threads, search]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    setFile(null);
    setFileError(null);
    setReplyTo(null);
    setPickerFor(null);
  }, [activeId]);

  function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    e.target.value = "";
    if (!picked) return;
    const problem = validateChatAttachment(picked);
    setFileError(problem);
    setFile(problem ? null : picked);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if ((!inputValue.trim() && !file) || sending) return;
    const ok = await onSend(e, file, replyTo?.id ?? null);
    if (ok !== false) {
      setReplyTo(null);
      setFile(null);
      setFileError(null);
    }
  }

  return (
    <div className="h-[calc(100vh-8rem)] min-h-[420px] bg-background flex overflow-hidden rounded-2xl border border-border shadow-sm">
      {/* Thread list */}
      <div
        className={cn(
          "w-full lg:w-[320px] flex-shrink-0 bg-white border-r border-border flex flex-col transition-all",
          activeId ? "hidden lg:flex" : "flex"
        )}
      >
        <div className="px-5 pt-5 pb-4 border-b border-border/70">
          <h2 className="font-display text-xl font-bold text-foreground tracking-tight">{title}</h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>

          <div className="mt-3.5 relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search conversations..."
              className="w-full bg-muted/40 border border-border/70 rounded-xl pl-8 pr-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-herb-green/20 focus:border-herb-green/40 placeholder:text-muted-foreground/70 transition-shadow"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {threadsLoading ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-6 h-6 rounded-full border-2 border-herb-green border-t-transparent animate-spin" />
            </div>
          ) : threads.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <div className="w-14 h-14 rounded-2xl bg-herb-green/5 border border-herb-green/10 flex items-center justify-center mx-auto mb-4">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="text-herb-green/60">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-foreground">{emptyThreadsTitle}</p>
              <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{emptyThreadsSubtitle}</p>
            </div>
          ) : filteredThreads.length === 0 ? (
            <div className="px-6 py-10 text-center text-xs text-muted-foreground">No matches for "{search}"</div>
          ) : (
            filteredThreads.map((thread) => (
              <button
                key={thread.id}
                onClick={() => onSelectThread(thread.id)}
                className={cn(
                  "relative w-full text-left px-5 py-3.5 flex items-start gap-3 transition-colors group",
                  activeId === thread.id ? "bg-herb-green/[0.06]" : "hover:bg-muted/50"
                )}
              >
                {activeId === thread.id && (
                  <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-herb-green" />
                )}
                <div className="relative flex-shrink-0">
                  <div className="w-11 h-11 rounded-full bg-herb-gradient flex items-center justify-center shadow-sm">
                    <span className="text-white font-bold font-display text-xs">{thread.initials}</span>
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-baseline gap-2">
                    <h3 className={cn("text-[13.5px] truncate", thread.unread ? "font-bold text-foreground" : "font-semibold text-foreground/90")}>
                      {thread.name}
                    </h3>
                    <span className="text-[10px] text-muted-foreground/80 whitespace-nowrap flex-shrink-0">
                      {thread.lastMessageTime}
                    </span>
                  </div>
                  <p className={cn(
                    "text-xs truncate mt-0.5",
                    thread.unread ? "font-medium text-foreground/80" : "text-muted-foreground"
                  )}>
                    {thread.lastMessage}
                  </p>
                  {thread.tag && (
                    <span className="inline-flex items-center mt-1.5 text-[10px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full capitalize max-w-full truncate">
                      {thread.tag}
                    </span>
                  )}
                </div>
                {thread.unreadCount === 1 && (
                  <span className="w-2.5 h-2.5 rounded-full bg-herb-green flex-shrink-0 mt-2" />
                )}
                {thread.unreadCount > 1 && (
                  <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-herb-green text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-1.5">
                    {thread.unreadCount > 99 ? "99+" : thread.unreadCount}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Conversation panel */}
      {activeThread ? (
        <div className="flex-1 flex flex-col bg-[#FBFAF6]">
          <div className="px-5 py-3.5 bg-white border-b border-border flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={() => onSelectThread("")}
                className="lg:hidden p-1.5 -ml-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted flex-shrink-0"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
                </svg>
              </button>
              <div className="w-9 h-9 rounded-full bg-herb-gradient flex items-center justify-center flex-shrink-0 shadow-sm">
                <span className="text-white font-bold text-[11px] font-display">{activeThread.initials}</span>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <h2 className="text-sm font-bold text-foreground leading-tight truncate">{activeThread.name}</h2>
                  {activeThread.tag && (
                    <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full capitalize whitespace-nowrap">
                      {activeThread.tag}
                    </span>
                  )}
                </div>
                <p className="text-[10.5px] text-muted-foreground truncate">{activeThread.headerContext ?? statusLine}</p>
              </div>
            </div>

            {headerActionLabel && onHeaderAction && (
              <button
                onClick={onHeaderAction}
                className="text-[11.5px] font-semibold text-herb-green bg-herb-green/[0.08] hover:bg-herb-green/[0.14] px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
              >
                {headerActionLabel}
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-3.5">
            <div className="flex justify-center mb-2">
              <span className="text-[10px] font-medium text-muted-foreground/80 bg-white border border-border/60 px-3 py-1 rounded-full shadow-sm">
                🔒 End-to-end encrypted · ABDM compliant
              </span>
            </div>

            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center px-6">
                <div className="w-12 h-12 rounded-2xl bg-white border border-border shadow-sm flex items-center justify-center mb-3">
                  <span className="text-lg">👋</span>
                </div>
                <p className="text-sm font-semibold text-foreground">Start the conversation</p>
                <p className="text-xs text-muted-foreground mt-1">Send the first message — it's bounded to this consultation only.</p>
              </div>
            ) : (
              messages.map((msg, i) => {
                const isImage = !!msg.attachment?.type.startsWith("image/");
                const imageOnly = isImage && !msg.content && !msg.replyTo;
                const showActions = enableReply || !!onReact;
                return (
                <div key={msg.id ?? i} className={cn("flex w-full", msg.isMine ? "justify-end" : "justify-start")}>
                  <div className={cn("flex max-w-[78%] lg:max-w-[58%]", msg.isMine ? "flex-row-reverse" : "flex-row")}>
                    <div className={cn("flex flex-col", msg.isMine ? "items-end" : "items-start")}>
                      {!msg.isMine && msg.senderName && (
                        <span className="text-[11px] font-semibold text-herb-green mb-1 px-1">{msg.senderName}</span>
                      )}
                      <div className={cn("relative group/msg flex items-center gap-1.5", msg.isMine ? "flex-row-reverse" : "flex-row")}>
                      <div
                        className={cn(
                          "text-[13.5px] leading-relaxed",
                          imageOnly
                            ? "p-0 bg-transparent"
                            : cn(
                                "shadow-sm",
                                isImage ? "p-1.5" : "px-4 py-2.5",
                                msg.isMine
                                  ? "bg-herb-green text-white rounded-2xl rounded-br-md"
                                  : "bg-white border border-border text-foreground rounded-2xl rounded-bl-md"
                              )
                        )}
                      >
                        {msg.replyTo && (
                          <div
                            className={cn(
                              "mb-1.5 rounded-lg border-l-[3px] px-2.5 py-1.5 text-xs",
                              msg.isMine ? "bg-white/15 border-white/60" : "bg-muted/60 border-herb-green"
                            )}
                          >
                            <p className={cn("font-semibold text-[11px]", msg.isMine ? "text-white" : "text-herb-green")}>
                              {msg.replyTo.senderName}
                            </p>
                            <p className={cn("line-clamp-2", msg.isMine ? "text-white/80" : "text-muted-foreground")}>
                              {msg.replyTo.content}
                            </p>
                          </div>
                        )}
                        {msg.attachment && (
                          msg.attachment.type.startsWith("image/") ? (
                            <a href={msg.attachment.url} target="_blank" rel="noreferrer" className={cn("block", !imageOnly && "mb-1")}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={msg.attachment.url}
                                alt={msg.attachment.name}
                                className={cn(
                                  "max-h-64 max-w-full object-cover",
                                  imageOnly ? "rounded-2xl shadow-md ring-1 ring-black/5" : "rounded-xl"
                                )}
                              />
                            </a>
                          ) : (
                            <a
                              href={msg.attachment.url}
                              target="_blank"
                              rel="noreferrer"
                              className={cn(
                                "flex items-center gap-2.5 rounded-xl px-3 py-2 mb-1.5 border",
                                msg.isMine ? "bg-white/10 border-white/20" : "bg-muted/50 border-border"
                              )}
                            >
                              <span className="text-lg">📄</span>
                              <span className="min-w-0">
                                <span className="block text-xs font-semibold truncate max-w-[180px]">{msg.attachment.name}</span>
                                <span className={cn("block text-[10px]", msg.isMine ? "text-white/70" : "text-muted-foreground")}>
                                  {formatFileSize(msg.attachment.size)} · PDF
                                </span>
                              </span>
                            </a>
                          )
                        )}
                        {msg.content && (
                          <span className={cn("block", isImage && "px-2.5 pb-1 pt-0.5")}>{msg.content}</span>
                        )}
                      </div>
                      {showActions && (
                        <div className="relative flex items-center gap-0.5 opacity-0 group-hover/msg:opacity-100 focus-within:opacity-100 transition-opacity">
                          {onReact && (
                            <button
                              type="button"
                              onClick={() => setPickerFor(pickerFor === msg.id ? null : msg.id)}
                              title="React"
                              className="w-7 h-7 rounded-full bg-white border border-border shadow-sm text-sm hover:bg-muted"
                            >
                              😊
                            </button>
                          )}
                          {enableReply && (
                            <button
                              type="button"
                              onClick={() => setReplyTo(msg)}
                              title="Reply"
                              className="w-7 h-7 rounded-full bg-white border border-border shadow-sm text-xs text-muted-foreground hover:bg-muted"
                            >
                              ↩
                            </button>
                          )}
                          {pickerFor === msg.id && onReact && (
                            <div
                              className={cn(
                                "absolute bottom-9 z-20 flex gap-1 bg-white border border-border rounded-full shadow-lg px-2 py-1.5",
                                msg.isMine ? "right-0" : "left-0"
                              )}
                            >
                              {REACTION_EMOJIS.map((emoji) => (
                                <button
                                  key={emoji}
                                  type="button"
                                  onClick={() => {
                                    onReact(msg.id, emoji);
                                    setPickerFor(null);
                                  }}
                                  className="text-lg hover:scale-125 transition-transform"
                                >
                                  {emoji}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                      </div>
                      {msg.reactions && msg.reactions.length > 0 && (
                        <div className={cn("flex flex-wrap gap-1 -mt-1.5 mb-0.5", msg.isMine ? "justify-end" : "justify-start")}>
                          {msg.reactions.map((r) => (
                            <button
                              key={r.emoji}
                              type="button"
                              onClick={() => onReact?.(msg.id, r.emoji)}
                              className={cn(
                                "flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] bg-white shadow-sm",
                                r.mine ? "border-herb-green/50 bg-herb-green/[0.06]" : "border-border"
                              )}
                            >
                              <span>{r.emoji}</span>
                              <span className="text-muted-foreground">{r.count}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      <span className="text-[10px] text-muted-foreground/80 mt-1 px-1 flex items-center gap-1">
                        {msg.sentAt}
                        {msg.isMine && (
                          <span className={msg.isRead ? "text-herb-green" : "text-muted-foreground/60"} title={msg.isRead ? "Read" : "Sent"}>
                            {msg.isRead ? "✓✓" : "✓"}
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="px-4 py-3.5 bg-white border-t border-border flex-shrink-0">
            {replyTo && (
              <div className="mb-2 flex items-start gap-2 bg-muted/50 border-l-[3px] border-herb-green rounded-lg px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold text-herb-green">
                    Replying to {replyTo.isMine ? "yourself" : replyTo.senderName ?? "message"}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {replyTo.content || (replyTo.attachment ? "📎 Attachment" : "")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setReplyTo(null)}
                  className="text-muted-foreground hover:text-foreground text-base leading-none"
                  aria-label="Cancel reply"
                >
                  ×
                </button>
              </div>
            )}
            {(file || fileError || errorMessage) && (
              <div className="mb-2 flex flex-col gap-1.5">
                {file && (
                  <div className="flex items-center gap-2 bg-muted/50 border border-border rounded-xl px-3 py-2 w-fit max-w-full">
                    <span>{file.type.startsWith("image/") ? "🖼️" : "📄"}</span>
                    <span className="text-xs font-medium truncate max-w-[220px]">{file.name}</span>
                    <span className="text-[10px] text-muted-foreground">{formatFileSize(file.size)}</span>
                    <button
                      type="button"
                      onClick={() => setFile(null)}
                      className="text-muted-foreground hover:text-foreground text-sm leading-none"
                      aria-label="Remove attachment"
                    >
                      ×
                    </button>
                  </div>
                )}
                {(fileError || errorMessage) && (
                  <p className="text-[11px] text-red-600">{fileError || errorMessage}</p>
                )}
              </div>
            )}
            <form onSubmit={submit} className="flex items-center gap-2.5">
              <input
                ref={fileInputRef}
                type="file"
                accept={CHAT_ATTACHMENT_ACCEPT}
                onChange={handleFilePick}
                className="hidden"
              />
              {allowAttachments && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={sending}
                title="Attach a photo or PDF"
                className="w-10 h-10 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors flex-shrink-0 disabled:opacity-40"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                </svg>
              </button>
              )}
              <input
                type="text"
                value={inputValue}
                onChange={(e) => onInputChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void submit(e);
                  }
                }}
                placeholder={file ? "Add a caption (optional)..." : "Type a message..."}
                className="flex-1 bg-muted/40 border border-border/70 rounded-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-herb-green/25 focus:border-herb-green/40 placeholder:text-muted-foreground/70 transition-shadow"
              />
              <button
                type="submit"
                disabled={(!inputValue.trim() && !file) || sending}
                className="w-10 h-10 rounded-full bg-herb-gradient text-white flex items-center justify-center transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 flex-shrink-0 shadow-sm"
              >
                {sending ? (
                  <div className="w-3.5 h-3.5 rounded-full border-2 border-white/60 border-t-transparent animate-spin" />
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="ml-0.5">
                    <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                )}
              </button>
            </form>
            <p className="text-[10px] text-muted-foreground/80 mt-1.5 text-center">{composerHint}</p>
          </div>
        </div>
      ) : (
        <div className="hidden lg:flex flex-1 items-center justify-center bg-[#FBFAF6]">
          <div className="text-center text-muted-foreground">
            <div className="w-16 h-16 rounded-2xl bg-white border border-border shadow-sm flex items-center justify-center mx-auto mb-4">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <p className="font-semibold text-foreground text-sm">Select a conversation</p>
            <p className="text-xs mt-1">Choose a thread from the list to start chatting</p>
          </div>
        </div>
      )}
    </div>
  );
}
