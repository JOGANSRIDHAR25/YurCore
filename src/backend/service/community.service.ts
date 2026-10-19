import "server-only";

import { CommunityRepository, type CommunityMessage } from "../repo/community.repo";
import { AuthUser } from "@/shared/auth/auth.types";
import { AppError, ForbiddenError } from "@/shared/api/api-error";
import { randomUUID } from "crypto";
import { RealtimeTopics, broadcastSignalAfterResponse } from "../realtime/realtime-signal";

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "application/pdf"];
const MAX_BYTES = 5 * 1024 * 1024;
const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "🙏", "😢"];

type AttachmentInput = { path: string; name: string; type: string; size: number };

function validateAttachmentMeta(type: string, size: number) {
  if (!ALLOWED_TYPES.includes(type)) throw new AppError("Only PNG, JPEG, WebP images and PDF documents are allowed", 400);
  if (!Number.isFinite(size) || size <= 0 || size > MAX_BYTES) throw new AppError("Attachments must be 5 MB or smaller", 400);
}

async function requireDoctor(authUser: AuthUser): Promise<string> {
  if (authUser.role !== "doctor" && (authUser.role as string) !== "practitioner") {
    throw new ForbiddenError("The community is only available to doctors");
  }
  const practitionerId = await CommunityRepository.getPractitionerIdFromUserId(authUser.id);
  if (!practitionerId) throw new AppError("Practitioner profile not found", 404);
  return practitionerId;
}

async function requireMember(authUser: AuthUser): Promise<string> {
  const practitionerId = await requireDoctor(authUser);
  if (!(await CommunityRepository.isMember(practitionerId))) {
    throw new ForbiddenError("Join the community to take part");
  }
  return practitionerId;
}

export class CommunityService {
  static async getState(authUser: AuthUser): Promise<{ isMember: boolean; memberCount: number }> {
    const practitionerId = await requireDoctor(authUser);
    const [isMember, memberCount] = await Promise.all([
      CommunityRepository.isMember(practitionerId),
      CommunityRepository.countMembers(),
    ]);
    return { isMember, memberCount };
  }

  static async join(authUser: AuthUser): Promise<void> {
    await CommunityRepository.join(await requireDoctor(authUser));
  }

  static async leave(authUser: AuthUser): Promise<void> {
    await CommunityRepository.leave(await requireDoctor(authUser));
  }

  static async listMessages(authUser: AuthUser): Promise<CommunityMessage[]> {
    return CommunityRepository.listMessages(await requireMember(authUser));
  }

  static async sendMessage(
    authUser: AuthUser,
    content: string,
    replyToId?: string | null,
    attachment?: AttachmentInput
  ): Promise<void> {
    const practitionerId = await requireMember(authUser);
    const clean = (content ?? "").trim();
    if (!clean && !attachment) throw new AppError("Message cannot be empty", 400);
    if (clean.length > 2000) throw new AppError("Message is too long", 400);

    if (attachment) {
      validateAttachmentMeta(attachment.type, attachment.size);
      if (!attachment.path?.startsWith(`${practitionerId}/`)) {
        throw new ForbiddenError("Invalid attachment");
      }
    }
    await CommunityRepository.sendMessage(practitionerId, clean, replyToId, attachment);
    broadcastSignalAfterResponse([RealtimeTopics.community()], "message");
  }

  static async react(authUser: AuthUser, messageId: string, emoji: string): Promise<void> {
    const practitionerId = await requireMember(authUser);
    if (!messageId || !REACTION_EMOJIS.includes(emoji)) throw new AppError("Invalid reaction", 400);
    await CommunityRepository.toggleReaction(practitionerId, messageId, emoji);
    broadcastSignalAfterResponse([RealtimeTopics.community()], "reaction");
  }

  static async createAttachmentUpload(
    authUser: AuthUser,
    fileName: string,
    fileType: string,
    fileSize: number
  ): Promise<{ path: string; token: string }> {
    const practitionerId = await requireMember(authUser);
    validateAttachmentMeta(fileType, Number(fileSize));
    const safeName = (fileName || "file").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
    return CommunityRepository.createAttachmentUploadTarget(`${practitionerId}/${randomUUID()}-${safeName}`);
  }
}
