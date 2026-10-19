import { createClient } from "@/shared/db/supabase.server";

export type FollowUpRow = {
  id: string;
  patientName: string;
  patientInitials: string;
  recommendedDate: string;
  isBooked: boolean;
  nudgeSent: boolean;
  patientAge: number;
};

export class FollowUpRepository {
  static async getPractitionerIdFromUserId(userId: string): Promise<string | null> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("practitioners")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("[FollowUpRepository] Error resolving practitioner_id:", error.message);
      return null;
    }
    return data?.id ?? null;
  }

  static async getFollowUpsForPractitioner(practitionerId: string): Promise<FollowUpRow[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("follow_ups")
      .select(`
        id, recommended_date, is_booked, nudge_sent_at,
        patient:patients ( full_name, date_of_birth )
      `)
      .eq("practitioner_id", practitionerId)
      .order("recommended_date", { ascending: true });

    if (error) {
      console.error("[FollowUpRepository] Error fetching follow-ups:", error.message);
      throw new Error("Failed to fetch follow-ups from database");
    }

    return (data ?? []).map((row: any) => {
      const name = row.patient?.full_name ?? "Unknown";
      let patientAge = 35;
      if (row.patient?.date_of_birth) {
        patientAge = new Date().getFullYear() - new Date(row.patient.date_of_birth).getFullYear();
      }
      return {
        id: row.id,
        patientName: name,
        patientInitials: name.split(" ").filter((w: string) => w).map((w: string) => w[0]).join("").slice(0, 2).toUpperCase(),
        recommendedDate: row.recommended_date ?? "",
        isBooked: row.is_booked ?? false,
        nudgeSent: !!row.nudge_sent_at,
        patientAge,
      };
    });
  }

  static async getFollowUpById(followUpId: string): Promise<{ id: string; practitioner_id: string } | null> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("follow_ups")
      .select("id, practitioner_id")
      .eq("id", followUpId)
      .maybeSingle();

    if (error) {
      console.error("[FollowUpRepository] Error fetching follow-up:", error.message);
      return null;
    }
    return data;
  }

  static async nudge(followUpId: string): Promise<void> {
    const supabase = await createClient();
    const { error } = await supabase
      .from("follow_ups")
      .update({ nudge_sent_at: new Date().toISOString() })
      .eq("id", followUpId);

    if (error) {
      console.error("[FollowUpRepository] Error nudging follow-up:", error.message);
      throw new Error("Failed to send nudge");
    }
  }

  static async updateRecommendedDate(followUpId: string, recommendedDate: string): Promise<void> {
    const supabase = await createClient();
    const { error } = await supabase
      .from("follow_ups")
      .update({ recommended_date: recommendedDate })
      .eq("id", followUpId);

    if (error) {
      console.error("[FollowUpRepository] Error updating follow-up date:", error.message);
      throw new Error("Failed to update follow-up date");
    }
  }
}
