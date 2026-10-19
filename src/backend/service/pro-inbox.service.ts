import "server-only";

import { ProInboxRepository, type InboxThread } from "../repo/pro-inbox.repo";
import { AuthUser } from "@/shared/auth/auth.types";
import { resolveActingPractitionerUserId } from "@/shared/auth/resolve-practitioner-context";

export class ProInboxService {
  static async getInbox(authUser: AuthUser): Promise<InboxThread[]> {
    if (
      authUser.role !== "doctor" &&
      (authUser.role as string) !== "practitioner" &&
      authUser.role !== "assistant"
    ) {
      return [];
    }

    const practitionerId = await ProInboxRepository.getPractitionerIdFromUserId(
      await resolveActingPractitionerUserId(authUser)
    );
    if (!practitionerId) return [];

    return ProInboxRepository.getInboxForPractitioner(practitionerId);
  }
}