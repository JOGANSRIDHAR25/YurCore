import { createClient } from "@/shared/db/supabase.server";

export type ConsentView = {
  id: string;
  practitionerName: string;
  practitionerInitials: string;
  action: string;
  duration: string;
  recordTypes: string[];
  expiresAt: string | null;
  createdAt: string;
};

export class ConsentRepository {
  static async getPatientIdFromUserId(userId: string): Promise<string | null> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("patients")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("[ConsentRepository] Error resolving patient_id:", error.message);
      return null;
    }
    return data?.id ?? null;
  }

  static async getGrantsForPatient(patientId: string): Promise<ConsentView[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("consent_grants")
      .select(`
        id, action, duration, record_types, expires_at, created_at,
        practitioner:practitioners ( full_name )
      `)
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[ConsentRepository] Error fetching consent grants:", error.message);
      throw new Error("Failed to fetch consent grants from database");
    }

    return (data ?? []).map((row: any) => {
      const name = row.practitioner?.full_name ?? "Unknown";
      return {
        id: row.id,
        practitionerName: name,
        practitionerInitials: name.split(" ").filter((w: string) => w).map((w: string) => w[0]).join("").slice(0, 2).toUpperCase(),
        action: row.action ?? "granted",
        duration: row.duration ?? "session_only",
        recordTypes: row.record_types ?? [],
        expiresAt: row.expires_at,
        createdAt: row.created_at ? new Date(row.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "",
      };
    });
  }

  static async getGrantById(consentId: string): Promise<{ id: string; patient_id: string } | null> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("consent_grants")
      .select("id, patient_id")
      .eq("id", consentId)
      .maybeSingle();

    if (error) {
      console.error("[ConsentRepository] Error fetching consent grant:", error.message);
      return null;
    }
    return data;
  }

  static async revoke(consentId: string): Promise<void> {
    const supabase = await createClient();
    const { error } = await supabase
      .from("consent_grants")
      .update({ action: "revoked", revoked_at: new Date().toISOString() })
      .eq("id", consentId);

    if (error) {
      console.error("[ConsentRepository] Error revoking consent:", error.message);
      throw new Error("Failed to revoke consent in database");
    }
  }
}
