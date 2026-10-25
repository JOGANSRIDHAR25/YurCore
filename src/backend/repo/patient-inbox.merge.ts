/**
 * Pure helpers for the patient inbox: turn consultation rows (with their messages)
 * into one conversation per doctor per patient. Kept free of database imports so
 * they can be unit tested.
 */

export type InboxMessageRow = {
  content: string | null;
  sent_at: string;
  read_at: string | null;
  direction: string;
  attachment_path: string | null;
  attachment_type: string | null;
};

export type InboxConsultationRow = {
  id: string;
  created_at: string;
  practitioner_id: string;
  patient_id: string;
  /** One row at runtime; Supabase's generated types describe the join as a list. */
  practitioner?: { full_name: string | null } | { full_name: string | null }[] | null;
  messages?: InboxMessageRow[] | null;
};

export type InboxPerson = { name: string; isFamilyMember: boolean; relationship?: string };

export type MergedInboxThread = {
  /** Stable for a doctor + patient pair, so it survives new consultations. */
  id: string;
  practitionerId: string;
  doctorName: string;
  doctorInitials: string;
  lastMessage: string;
  lastMessageTime: string;
  /** ISO time of the latest message, or of the newest consultation when there are none. */
  lastActivityAt: string;
  hasMessages: boolean;
  unread: boolean;
  unreadCount: number;
  /** The newest consultation; any consultation of the pair opens the whole conversation. */
  consultationId: string;
  patientId: string;
  patientName: string;
  isFamilyMember: boolean;
  relationship?: string;
};

export const threadKey = (practitionerId: string, patientId: string) => `${practitionerId}:${patientId}`;

export function initialsOf(name: string): string {
  return name.split(" ").filter((w) => w).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

export function timeAgo(dateStr: string, now = Date.now()): string {
  const diff = now - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

function previewOf(m: InboxMessageRow): string {
  if (m.content) return m.content;
  if (m.attachment_path) return String(m.attachment_type).startsWith("image/") ? "Photo" : "Document";
  return "";
}

const ms = (iso: string) => new Date(iso).getTime();

/**
 * One conversation per doctor + patient. The preview, time and order come from the
 * latest message across all of the pair's consultations (not from the newest
 * consultation, which may have no messages yet).
 */
export function mergeInboxThreads(
  consults: InboxConsultationRow[],
  personOf: (patientId: string) => InboxPerson,
  now = Date.now(),
): MergedInboxThread[] {
  type Acc = { newest: InboxConsultationRow; last: InboxMessageRow | null; unreadCount: number };
  const byPair = new Map<string, Acc>();

  for (const c of consults) {
    const key = threadKey(c.practitioner_id, c.patient_id);
    const msgs = c.messages ?? [];
    const last = msgs.reduce<InboxMessageRow | null>((best, m) => (!best || ms(m.sent_at) > ms(best.sent_at) ? m : best), null);
    const unread = msgs.filter((m) => m.direction === "doctor_to_patient" && !m.read_at).length;
    const acc = byPair.get(key);
    if (!acc) {
      byPair.set(key, { newest: c, last, unreadCount: unread });
      continue;
    }
    if (ms(c.created_at) > ms(acc.newest.created_at)) acc.newest = c;
    if (last && (!acc.last || ms(last.sent_at) > ms(acc.last.sent_at))) acc.last = last;
    acc.unreadCount += unread;
  }

  return [...byPair.values()]
    .map(({ newest, last, unreadCount }) => {
      const doctor = Array.isArray(newest.practitioner) ? newest.practitioner[0] : newest.practitioner;
      const doctorName = doctor?.full_name ?? "Doctor";
      const person = personOf(newest.patient_id);
      const lastActivityAt = last?.sent_at ?? newest.created_at;
      return {
        id: threadKey(newest.practitioner_id, newest.patient_id),
        practitionerId: newest.practitioner_id,
        doctorName,
        doctorInitials: initialsOf(doctorName),
        lastMessage: last ? previewOf(last) : "No messages yet",
        lastMessageTime: lastActivityAt ? timeAgo(lastActivityAt, now) : "",
        lastActivityAt,
        hasMessages: Boolean(last),
        unread: unreadCount > 0,
        unreadCount,
        consultationId: newest.id,
        patientId: newest.patient_id,
        patientName: person.name,
        isFamilyMember: person.isFamilyMember,
        relationship: person.relationship,
      };
    })
    .sort((a, b) => ms(b.lastActivityAt) - ms(a.lastActivityAt));
}
