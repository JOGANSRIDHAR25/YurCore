import { createClient } from "@/shared/db/supabase.server";

export type DoctorSearchResult = {
  id: string;
  fullName: string;
  email: string;
  specializations: string[];
};

export type AssistantStatus = "pending" | "approved" | "rejected" | "suspended";

export type AssistantRecord = {
  id: string;
  userId: string;
  practitionerId: string;
  fullName: string;
  avatarUrl: string | null;
  status: AssistantStatus;
  rejectionReason: string | null;
  createdAt: string;
  email: string | null;
  phone: string | null;
};

export type AdminAssistantRecord = AssistantRecord & {
  doctorName: string | null;
  doctorEmail: string | null;
};

export type CreateAssistantInput = {
  email: string;
  phone?: string;
  fullName: string;
  practitionerId: string;
};

export class AssistantRepository {
  static async searchPractitionersByEmailOrName(query: string): Promise<DoctorSearchResult[]> {
    const supabase: any = createClient();
    const trimmed = query.trim();
    if (!trimmed) return [];

    const { data, error } = await supabase
      .from("practitioners")
      .select(`
        id,
        full_name,
        specializations,
        user:users!practitioners_user_id_fkey ( email )
      `)
      .eq("verification_status", "verified")
      .or(`full_name.ilike.%${trimmed}%`)
      .limit(10);

    if (error) {
      console.error("[AssistantRepository] searchPractitionersByEmailOrName error:", error.message);
      throw new Error("Failed to search doctors");
    }

    const results: DoctorSearchResult[] = (data || []).map((row: any) => ({
      id: row.id,
      fullName: row.full_name ?? "",
      email: (Array.isArray(row.user) ? row.user[0]?.email : row.user?.email) ?? "",
      specializations: row.specializations ?? [],
    }));

    // Also match by email directly, since practitioners.full_name search above
    // can't reach the joined users.email column via `.or()`.
    const { data: byEmail, error: emailErr } = await supabase
      .from("users")
      .select(`
        email,
        practitioner:practitioners!practitioners_user_id_fkey ( id, full_name, specializations )
      `)
      .ilike("email", `%${trimmed}%`)
      .eq("role", "practitioner")
      .limit(10);

    if (!emailErr && byEmail) {
      for (const row of byEmail) {
        const prac = Array.isArray(row.practitioner) ? row.practitioner[0] : row.practitioner;
        if (!prac) continue;
        if (results.some((r) => r.id === prac.id)) continue;
        results.push({
          id: prac.id,
          fullName: prac.full_name ?? "",
          email: row.email ?? "",
          specializations: prac.specializations ?? [],
        });
      }
    }

    return results.slice(0, 10);
  }

  static async createAssistant(input: CreateAssistantInput): Promise<string> {
    const supabase: any = createClient();

    const { data: userIdData, error: userErr } = await supabase.rpc("upsert_user_by_email", {
      p_email: input.email,
      p_role: "assistant",
    });

    if (userErr) {
      console.error("[AssistantRepository] upsert_user_by_email error:", userErr.message);
      throw new Error(userErr.message || "Failed to create user");
    }

    const userId = userIdData as string;
    if (!userId) {
      throw new Error("Failed to resolve user ID");
    }

    if (input.phone) {
      await supabase.from("users").update({ mobile: input.phone }).eq("id", userId);
    }

    const { error: assistantErr } = await supabase.from("assistants").upsert(
      {
        user_id: userId,
        practitioner_id: input.practitionerId,
        full_name: input.fullName,
        status: "pending",
      },
      { onConflict: "user_id" }
    );

    if (assistantErr) {
      console.error("[AssistantRepository] createAssistant error:", assistantErr.message);
      throw new Error(assistantErr.message || "Failed to create assistant profile");
    }

    return userId;
  }

  static async getAssistantsForPractitioner(practitionerId: string): Promise<AssistantRecord[]> {
    const supabase: any = createClient();
    const { data, error } = await supabase
      .from("assistants")
      .select(`
        id,
        user_id,
        practitioner_id,
        full_name,
        avatar_url,
        status,
        rejection_reason,
        created_at,
        user:users ( email, mobile )
      `)
      .eq("practitioner_id", practitionerId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[AssistantRepository] getAssistantsForPractitioner error:", error.message);
      throw new Error("Failed to fetch assistants");
    }

    return (data || []).map((row: any) => this.mapRow(row));
  }

  static async getAssistantByUserId(userId: string): Promise<AssistantRecord | null> {
    const supabase: any = createClient();
    const { data, error } = await supabase
      .from("assistants")
      .select(`
        id,
        user_id,
        practitioner_id,
        full_name,
        avatar_url,
        status,
        rejection_reason,
        created_at,
        user:users ( email, mobile )
      `)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("[AssistantRepository] getAssistantByUserId error:", error.message);
      throw new Error("Failed to fetch assistant profile");
    }
    if (!data) return null;

    return this.mapRow(data);
  }

  static async getLinkedDoctorName(practitionerId: string): Promise<string | null> {
    const supabase: any = createClient();
    const { data } = await supabase
      .from("practitioners")
      .select("full_name")
      .eq("id", practitionerId)
      .maybeSingle();
    return data?.full_name ?? null;
  }

  static async updateAssistantStatus(
    assistantId: string,
    practitionerId: string,
    status: AssistantStatus,
    reason?: string
  ): Promise<void> {
    const supabase: any = createClient();
    const { data, error } = await supabase
      .from("assistants")
      .update({
        status,
        rejection_reason: status === "approved" ? null : reason || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", assistantId)
      .eq("practitioner_id", practitionerId)
      .select("id")
      .maybeSingle();

    if (error) {
      console.error("[AssistantRepository] updateAssistantStatus error:", error.message);
      throw new Error("Failed to update assistant status");
    }
    if (!data) {
      throw new Error("Assistant not found for this doctor");
    }
  }

  /** Admin variant — not scoped to a specific doctor's own practitioner_id. */
  static async updateAssistantStatusByAdmin(
    assistantId: string,
    status: AssistantStatus,
    reason?: string
  ): Promise<void> {
    const supabase: any = createClient();
    const { data, error } = await supabase
      .from("assistants")
      .update({
        status,
        rejection_reason: status === "approved" ? null : reason || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", assistantId)
      .select("id")
      .maybeSingle();

    if (error) {
      console.error("[AssistantRepository] updateAssistantStatusByAdmin error:", error.message);
      throw new Error("Failed to update assistant status");
    }
    if (!data) {
      throw new Error("Assistant not found");
    }
  }

  static async getAllAssistants(query?: string): Promise<AdminAssistantRecord[]> {
    const supabase: any = createClient();
    const { data, error } = await supabase
      .from("assistants")
      .select(`
        id,
        user_id,
        practitioner_id,
        full_name,
        avatar_url,
        status,
        rejection_reason,
        created_at,
        user:users ( email, mobile ),
        practitioner:practitioners ( full_name, user:users!practitioners_user_id_fkey ( email ) )
      `)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[AssistantRepository] getAllAssistants error:", error.message);
      throw new Error("Failed to fetch assistants");
    }

    const rows: AdminAssistantRecord[] = (data || []).map((row: any) => {
      const practitioner = Array.isArray(row.practitioner) ? row.practitioner[0] : row.practitioner;
      const doctorUser = practitioner ? (Array.isArray(practitioner.user) ? practitioner.user[0] : practitioner.user) : null;
      return {
        ...this.mapRow(row),
        doctorName: practitioner?.full_name ?? null,
        doctorEmail: doctorUser?.email ?? null,
      };
    });

    const trimmed = query?.trim().toLowerCase();
    if (!trimmed) return rows;

    return rows.filter(
      (r) =>
        r.fullName.toLowerCase().includes(trimmed) ||
        r.email?.toLowerCase().includes(trimmed) ||
        r.doctorName?.toLowerCase().includes(trimmed) ||
        r.doctorEmail?.toLowerCase().includes(trimmed)
    );
  }

  private static mapRow(row: any): AssistantRecord {
    const user = Array.isArray(row.user) ? row.user[0] : row.user;
    return {
      id: row.id,
      userId: row.user_id,
      practitionerId: row.practitioner_id,
      fullName: row.full_name ?? "",
      avatarUrl: row.avatar_url ?? null,
      status: row.status,
      rejectionReason: row.rejection_reason ?? null,
      createdAt: row.created_at,
      email: user?.email ?? null,
      phone: user?.mobile ?? null,
    };
  }
}