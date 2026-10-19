import { createClient } from "@/shared/db/supabase.server";

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
  /** Who the conversation is about — the account owner or one of their family members. */
  patientId: string;
  patientName: string;
  isFamilyMember: boolean;
  relationship?: string;
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

export class PatientInboxRepository {
  static async getPatientIdFromUserId(userId: string): Promise<string | null> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("patients")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("[PatientInboxRepository] Error resolving patient_id:", error.message);
      return null;
    }
    return data?.id ?? null;
  }

  static async getInboxForPatient(patientId: string): Promise<PatientInboxThread[]> {
    const supabase = await createClient();

    // Family members have no inbox of their own — their conversations are
    // shared with (and answered by) the account owner, so they appear here.
    const [{ data: familyRows }, { data: ownerRow }] = await Promise.all([
      supabase
        .from("family_members")
        .select("patient_id, full_name, relationship")
        .eq("owner_patient_id", patientId)
        .eq("is_active", true),
      supabase.from("patients").select("full_name").eq("id", patientId).maybeSingle(),
    ]);
    const familyByPatientId = new Map<string, { name: string; relationship?: string }>();
    for (const fm of familyRows ?? []) {
      if (fm.patient_id) familyByPatientId.set(fm.patient_id, { name: fm.full_name || "Family member", relationship: fm.relationship || undefined });
    }
    const visiblePatientIds = [patientId, ...familyByPatientId.keys()];

    const { data: consults, error } = await supabase
      .from("consultations")
      .select(`
        id, created_at, practitioner_id, patient_id,
        practitioner:practitioners ( full_name ),
        messages:bounded_messages ( content, sent_at, read_at, direction, attachment_path, attachment_type )
      `)
      .in("patient_id", visiblePatientIds)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      console.error("[PatientInboxRepository] Error fetching inbox:", error.message);
      throw new Error("Failed to fetch inbox from database");
    }

    return (consults ?? [])
      .map((c: any) => {
        const msgs = (c.messages ?? []).sort((a: any, b: any) =>
          new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime()
        );
        const last = msgs[0];
        const name = c.practitioner?.full_name ?? "Doctor";
        const sortTime = last?.sent_at ?? c.created_at;
        const unreadCount = msgs.filter((m: any) => m.direction === "doctor_to_patient" && !m.read_at).length;
        const family = familyByPatientId.get(c.patient_id);
        return {
          id: c.id,
          practitionerId: c.practitioner_id,
          doctorName: name,
          doctorInitials: name.split(" ").filter((w: string) => w).map((w: string) => w[0]).join("").slice(0, 2).toUpperCase(),
          lastMessage: last
            ? last.content || (last.attachment_path ? (String(last.attachment_type).startsWith("image/") ? "Photo" : "Document") : "")
            : "Start the conversation",
          lastMessageTime: sortTime ? timeAgo(sortTime) : "",
          unread: unreadCount > 0,
          unreadCount,
          consultationId: c.id,
          patientId: c.patient_id,
          patientName: family?.name ?? ownerRow?.full_name ?? "You",
          isFamilyMember: Boolean(family),
          relationship: family?.relationship,
          _sortTime: sortTime,
        };
      })
      .sort((a: any, b: any) => new Date(b._sortTime).getTime() - new Date(a._sortTime).getTime())
      // One thread per practitioner per person: several consultations with the
      // same doctor about the same patient are one conversation. Rows are
      // sorted newest-first, so the first row seen is the latest consultation.
      .reduce((acc: any[], t: any) => {
        const existing = acc.find((x) => x.practitionerId === t.practitionerId && x.patientId === t.patientId);
        if (existing) {
          existing.unreadCount += t.unreadCount;
          existing.unread = existing.unreadCount > 0;
        } else {
          acc.push(t);
        }
        return acc;
      }, [])
      .map(({ _sortTime, ...thread }: any) => thread);
  }
}
