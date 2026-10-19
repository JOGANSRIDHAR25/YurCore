import { createClient } from "@/shared/db/supabase.server";

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

export const CHAT_ATTACHMENT_BUCKET = "chat-attachments";

async function signAttachmentPaths(supabase: any, paths: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (paths.length === 0) return result;
  const { data, error } = await supabase.storage.from(CHAT_ATTACHMENT_BUCKET).createSignedUrls(paths, 3600);
  if (error) {
    console.error("[MessageRepository] Error signing attachment URLs:", error.message);
    return result;
  }
  for (const item of data ?? []) {
    if (item?.path && item?.signedUrl) result.set(item.path, item.signedUrl);
  }
  return result;
}

export class MessageRepository {
  static async getPatientIdFromUserId(userId: string): Promise<string | null> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("patients")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("[MessageRepository] Error resolving patient_id:", error.message);
      return null;
    }
    return data?.id ?? null;
  }

  static async getPractitionerIdFromUserId(userId: string): Promise<string | null> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("practitioners")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("[MessageRepository] Error resolving practitioner_id:", error.message);
      return null;
    }
    return data?.id ?? null;
  }

  static async getConsultationParticipants(consultationId: string): Promise<{ patient_id: string; practitioner_id: string } | null> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("consultations")
      .select("patient_id, practitioner_id")
      .eq("id", consultationId)
      .maybeSingle();

    if (error) {
      console.error("[MessageRepository] Error fetching consultation:", error.message);
      return null;
    }
    return data;
  }

  /**
   * The account that reads a patient's messages: the patient themself, or —
   * for a family member (no login) — their account owner. Returns patients.id.
   */
  static async getInboxOwnerPatientId(patientId: string): Promise<string> {
    const supabase = await createClient();
    const { data } = await supabase
      .from("family_members")
      .select("owner_patient_id")
      .eq("patient_id", patientId)
      .limit(1)
      .maybeSingle();
    return data?.owner_patient_id ?? patientId;
  }

  /** Whether patientId is the owner themself or one of their active family members. */
  static async isOwnOrFamilyPatient(ownerPatientId: string, patientId: string): Promise<boolean> {
    if (ownerPatientId === patientId) return true;
    const supabase = await createClient();
    const { data } = await supabase
      .from("family_members")
      .select("id")
      .eq("owner_patient_id", ownerPatientId)
      .eq("patient_id", patientId)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    return Boolean(data);
  }

  static async getRelatedConsultationIds(consultationId: string): Promise<string[]> {
    const participants = await this.getConsultationParticipants(consultationId);
    if (!participants) return [consultationId];
    return this.getRelatedConsultationIdsFor(participants, consultationId);
  }

  /** Same as getRelatedConsultationIds when the participants are already known. */
  static async getRelatedConsultationIdsFor(
    participants: { patient_id: string; practitioner_id: string },
    consultationId: string
  ): Promise<string[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("consultations")
      .select("id")
      .eq("patient_id", participants.patient_id)
      .eq("practitioner_id", participants.practitioner_id);
    if (error || !data?.length) return [consultationId];
    return data.map((r: any) => r.id);
  }

  static async getMessagesForConsultation(consultationId: string, relatedIds?: string[]): Promise<MessageRow[]> {
    const supabase = await createClient();
    const consultationIds = relatedIds ?? (await this.getRelatedConsultationIds(consultationId));
    const { data, error } = await supabase
      .from("bounded_messages")
      .select("id, consultation_id, direction, content, sent_at, read_at, attachment_path, attachment_name, attachment_type, attachment_size, reply_to_id")
      .in("consultation_id", consultationIds)
      .order("sent_at", { ascending: true });

    if (error) {
      console.error("[MessageRepository] Error fetching messages:", error.message);
      throw new Error("Failed to fetch messages from database");
    }

    const byId = new Map<string, any>((data ?? []).map((r: any) => [r.id, r]));

    // One storage call signs every attachment in the thread.
    const signedUrlByPath = await signAttachmentPaths(
      supabase,
      (data ?? []).map((r: any) => r.attachment_path).filter(Boolean)
    );

    return (data ?? []).map((row: any) => {
        let attachment: MessageRow["attachment"] = null;
        if (row.attachment_path) {
          attachment = {
            name: row.attachment_name ?? "Attachment",
            type: row.attachment_type ?? "",
            size: row.attachment_size ?? 0,
            url: signedUrlByPath.get(row.attachment_path) ?? "",
          };
        }
        return {
          id: row.id,
          consultationId: row.consultation_id,
          senderName: row.direction === "patient_to_doctor" ? "You" : "Doctor",
          direction: row.direction,
          content: row.content ?? "",
          sentAt: row.sent_at ? new Date(row.sent_at).toLocaleString("en-IN") : "",
          isRead: !!row.read_at,
          attachment,
          replyTo: row.reply_to_id
            ? (() => {
                const target = byId.get(row.reply_to_id);
                return {
                  direction: target?.direction ?? "",
                  content: target ? target.content || (target.attachment_path ? "📎 Attachment" : "") : "",
                };
              })()
            : null,
        };
      });
  }

  static async markRead(
    consultationId: string,
    readerRole: "patient" | "practitioner",
    relatedIds?: string[]
  ): Promise<number> {
    const supabase = await createClient();
    const consultationIds = relatedIds ?? (await this.getRelatedConsultationIds(consultationId));
    const directionToMark = readerRole === "patient" ? "doctor_to_patient" : "patient_to_doctor";

    const { data, error } = await supabase
      .from("bounded_messages")
      .update({ read_at: new Date().toISOString() })
      .in("consultation_id", consultationIds)
      .eq("direction", directionToMark)
      .is("read_at", null)
      .select("id");

    if (error) {
      console.error("[MessageRepository] Error marking messages read:", error.message);
      return 0;
    }
    return data?.length ?? 0;
  }

  static async sendMessage(params: {
    consultationId: string;
    senderUserId: string;
    direction: "doctor_to_patient" | "patient_to_doctor";
    content: string;
    attachment?: { path: string; name: string; type: string; size: number };
    replyToId?: string | null;
  }): Promise<void> {
    const supabase = await createClient();
    const { error } = await supabase.from("bounded_messages").insert({
      consultation_id: params.consultationId,
      sender_user_id: params.senderUserId,
      direction: params.direction,
      content: params.content,
      reply_to_id: params.replyToId || null,
      ...(params.attachment
        ? {
            attachment_path: params.attachment.path,
            attachment_name: params.attachment.name,
            attachment_type: params.attachment.type,
            attachment_size: params.attachment.size,
          }
        : {}),
    });

    if (error) {
      console.error("[MessageRepository] Error sending message:", error.message);
      throw new Error("Failed to send message");
    }
  }

  static async createAttachmentUploadTarget(path: string): Promise<{ path: string; token: string }> {
    const supabase = await createClient();
    const { data, error } = await supabase.storage
      .from(CHAT_ATTACHMENT_BUCKET)
      .createSignedUploadUrl(path);

    if (error || !data) {
      console.error("[MessageRepository] Error creating upload URL:", error?.message);
      throw new Error("Failed to prepare attachment upload");
    }
    return { path: data.path, token: data.token };
  }
}
