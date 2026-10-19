export type PatientInboxThread = {
  id: string;
  practitionerId: string;
  doctorName: string;
  doctorInitials: string;
  lastMessage: string;
  lastMessageTime: string;
  unread: boolean;
  unreadCount: number;
  consultationId: string;
  /** Who the conversation is about — you or one of your family members. */
  patientId?: string;
  patientName?: string;
  isFamilyMember?: boolean;
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
