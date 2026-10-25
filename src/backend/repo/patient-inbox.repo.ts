import { createClient } from "@/shared/db/supabase.server";
import { mergeInboxThreads, type InboxConsultationRow, type MergedInboxThread } from "./patient-inbox.merge";

export type PatientInboxThread = MergedInboxThread;

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

    // One conversation per doctor per person, previewed by its latest message.
    return mergeInboxThreads((consults ?? []) as unknown as InboxConsultationRow[], (pid) => {
      const family = familyByPatientId.get(pid);
      return family
        ? { name: family.name, isFamilyMember: true, relationship: family.relationship }
        : { name: ownerRow?.full_name ?? "You", isFamilyMember: false };
    });
  }
}
