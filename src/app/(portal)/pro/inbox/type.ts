export type InboxThread = {
  id: string;
  patientId: string;
  patientName: string;
  patientInitials: string;
  lastMessage: string;
  lastMessageTime: string;
  unread: boolean;
  unreadCount: number;
  consultationId: string;
  /** Set when the patient is a family member: the account owner who reads and replies for them. */
  familyOf?: { patientId: string; name: string; relationship?: string } | null;
};

export type MessageRow = {
  id: string;
  consultationId: string;
  senderName: string;
  direction: string;
  content: string;
  sentAt: string;
  isRead: boolean;
  attachment?: { name: string; type: string; size: number; url: string } | null;
  replyTo?: { direction: string; content: string } | null;
};
