export type PatientInboxThread = {
  /** Stable per doctor + patient ("practitionerId:patientId"); survives new consultations. */
  id: string;
  practitionerId: string;
  doctorName: string;
  doctorInitials: string;
  lastMessage: string;
  lastMessageTime: string;
  /** ISO time of the latest message (or newest consultation when there are no messages). */
  lastActivityAt: string;
  hasMessages: boolean;
  unread: boolean;
  unreadCount: number;
  /** The newest consultation of the pair; used for loading and sending messages. */
  consultationId: string;
  /** Who the conversation is about — you or one of your family members. */
  patientId: string;
  patientName: string;
  isFamilyMember: boolean;
  relationship?: string;
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
