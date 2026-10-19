import "server-only";

import { MessageRepository, type MessageRow } from "../repo/message.repo";
import { AuthUser } from "@/shared/auth/auth.types";
import { resolveActingPractitionerUserId } from "@/shared/auth/resolve-practitioner-context";
import { ForbiddenError, AppError } from "@/shared/api/api-error";
import { randomUUID } from "crypto";
import { RealtimeTopics, broadcastSignalAfterResponse, type RealtimeEvent } from "../realtime/realtime-signal";

const ALLOWED_ATTACHMENT_TYPES = ["image/png", "image/jpeg", "image/webp", "application/pdf"];
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

export type MessageAttachmentInput = { path: string; name: string; type: string; size: number };

function validateAttachmentMeta(type: string, size: number) {
  if (!ALLOWED_ATTACHMENT_TYPES.includes(type)) {
    throw new AppError("Only PNG, JPEG, WebP images and PDF documents are allowed", 400);
  }
  if (!Number.isFinite(size) || size <= 0 || size > MAX_ATTACHMENT_BYTES) {
    throw new AppError("Attachments must be 5 MB or smaller", 400);
  }
}

type Participants = { patient_id: string; practitioner_id: string };

/**
 * Pings the conversation's participants after the response is sent — the
 * sender never waits on the Realtime round-trip.
 */
function signalParticipants(
  participants: Participants,
  event: RealtimeEvent,
  only?: "patient" | "practitioner"
): void {
  broadcastSignalAfterResponse(async () => {
    const topics: string[] = [];
    // A family member's messages land in their account owner's inbox.
    if (only !== "practitioner") {
      const inboxPatientId = await MessageRepository.getInboxOwnerPatientId(participants.patient_id);
      topics.push(RealtimeTopics.patientInbox(inboxPatientId));
    }
    if (only !== "patient") topics.push(RealtimeTopics.practitionerInbox(participants.practitioner_id));
    return topics;
  }, event);
}

async function assertParticipant(
  authUser: AuthUser,
  consultationId: string
): Promise<{ role: "patient" | "practitioner"; participants: Participants }> {
  const isPatient = authUser.role === "patient";
  const isPractitioner =
    authUser.role === "doctor" ||
    (authUser.role as string) === "practitioner" ||
    authUser.role === "assistant";
  if (!isPatient && !isPractitioner) {
    throw new ForbiddenError("You are not authorized to access this conversation");
  }

  // The consultation and the caller's own id are independent lookups.
  const [consultation, callerId] = await Promise.all([
    MessageRepository.getConsultationParticipants(consultationId),
    isPatient
      ? MessageRepository.getPatientIdFromUserId(authUser.id)
      : resolveActingPractitionerUserId(authUser).then((uid) => MessageRepository.getPractitionerIdFromUserId(uid)),
  ]);
  if (!consultation) {
    throw new AppError("Consultation not found", 404);
  }

  // An account owner reads and replies for their family members too.
  const allowed = isPatient
    ? !!callerId && (await MessageRepository.isOwnOrFamilyPatient(callerId, consultation.patient_id))
    : !!callerId && consultation.practitioner_id === callerId;
  if (!allowed) {
    throw new ForbiddenError("You are not authorized to access this conversation");
  }
  return { role: isPatient ? "patient" : "practitioner", participants: consultation };
}

export class MessageService {
  static async getMessages(authUser: AuthUser, consultationId: string): Promise<MessageRow[]> {
    if (!consultationId || consultationId.length !== 36) {
      return [];
    }
    const { role, participants } = await assertParticipant(authUser, consultationId);
    // Every consultation between this patient and practitioner is one thread.
    const consultationIds = await MessageRepository.getRelatedConsultationIdsFor(participants, consultationId);
    const marked = await MessageRepository.markRead(consultationId, role, consultationIds);
    if (marked > 0) {
      // Let the sender's screen flip its read ticks. Only fires when something
      // was actually marked, so two open screens can't ping-pong.
      signalParticipants(participants, "read", role === "patient" ? "practitioner" : "patient");
    }
    return MessageRepository.getMessagesForConsultation(consultationId, consultationIds);
  }

  static async createAttachmentUpload(
    authUser: AuthUser,
    consultationId: string,
    fileName: string,
    fileType: string,
    fileSize: number
  ): Promise<{ path: string; token: string }> {
    await assertParticipant(authUser, consultationId);
    validateAttachmentMeta(fileType, fileSize);

    const safeName = (fileName || "file").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
    return MessageRepository.createAttachmentUploadTarget(`${consultationId}/${randomUUID()}-${safeName}`);
  }

  static async sendMessage(
    authUser: AuthUser,
    consultationId: string,
    content: string,
    attachment?: MessageAttachmentInput,
    replyToId?: string | null
  ): Promise<void> {
    if (!content?.trim() && !attachment) {
      throw new Error("Message content is required");
    }

    const { role, participants } = await assertParticipant(authUser, consultationId);

    if (attachment) {
      validateAttachmentMeta(attachment.type, attachment.size);
      if (!attachment.path?.startsWith(`${consultationId}/`)) {
        throw new ForbiddenError("Invalid attachment for this conversation");
      }
    }
    const direction = role === "patient" ? "patient_to_doctor" : "doctor_to_patient";

    await MessageRepository.sendMessage({
      consultationId,
      senderUserId: authUser.id,
      direction,
      content: content?.trim() ?? "",
      attachment,
      replyToId,
    });
    signalParticipants(participants, "message");
  }
}