import type { PatientInboxThread } from "./type";

export type DoctorGroup = {
  practitionerId: string;
  doctorName: string;
  doctorInitials: string;
  /** Patient conversations with this doctor, latest message first. */
  threads: PatientInboxThread[];
  unreadCount: number;
  lastActivityAt: string;
};

const ms = (iso: string) => new Date(iso).getTime() || 0;

/** Matches the doctor's name, the patient's name or the relationship (case-insensitive). */
export function matchesSearch(thread: PatientInboxThread, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [thread.doctorName, thread.patientName, thread.relationship ?? "", thread.isFamilyMember ? "family" : "you"]
    .some((field) => field.toLowerCase().includes(q));
}

/**
 * Groups conversations by doctor: each doctor once, with one row per patient.
 * Groups are ordered by their most recent activity, rows by their latest message.
 */
export function groupThreadsByDoctor(threads: PatientInboxThread[], query = ""): DoctorGroup[] {
  const groups = new Map<string, DoctorGroup>();
  for (const t of threads) {
    if (!matchesSearch(t, query)) continue;
    let g = groups.get(t.practitionerId);
    if (!g) {
      g = { practitionerId: t.practitionerId, doctorName: t.doctorName, doctorInitials: t.doctorInitials, threads: [], unreadCount: 0, lastActivityAt: t.lastActivityAt };
      groups.set(t.practitionerId, g);
    }
    g.threads.push(t);
    g.unreadCount += t.unreadCount;
    if (ms(t.lastActivityAt) > ms(g.lastActivityAt)) g.lastActivityAt = t.lastActivityAt;
  }
  for (const g of groups.values()) g.threads.sort((a, b) => ms(b.lastActivityAt) - ms(a.lastActivityAt));
  return [...groups.values()].sort((a, b) => ms(b.lastActivityAt) - ms(a.lastActivityAt));
}

/** "You · Your consultation" or "Family member · Son". */
export function patientRoleLabel(thread: PatientInboxThread): string {
  if (!thread.isFamilyMember) return "Your consultation";
  return thread.relationship ? `Family member · ${thread.relationship}` : "Family member";
}
