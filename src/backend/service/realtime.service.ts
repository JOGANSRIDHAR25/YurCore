import "server-only";

import { MessageRepository } from "../repo/message.repo";
import { AuthUser } from "@/shared/auth/auth.types";
import { resolveActingPractitionerUserId } from "@/shared/auth/resolve-practitioner-context";
import { RealtimeTopics } from "../realtime/realtime-signal";

export type RealtimeTopicSet = { inbox: string | null; community: string | null };

export class RealtimeService {
  /** The Realtime topics this user is allowed to listen on. */
  static async getTopics(authUser: AuthUser): Promise<RealtimeTopicSet> {
    const role = authUser.role as string;

    if (role === "patient") {
      const patientId = await MessageRepository.getPatientIdFromUserId(authUser.id);
      return { inbox: patientId ? RealtimeTopics.patientInbox(patientId) : null, community: null };
    }

    if (role === "doctor" || role === "practitioner" || role === "assistant") {
      const practitionerId = await MessageRepository.getPractitionerIdFromUserId(
        await resolveActingPractitionerUserId(authUser)
      );
      return {
        inbox: practitionerId ? RealtimeTopics.practitionerInbox(practitionerId) : null,
        // Pings carry no content, so any doctor may listen; the messages API
        // still enforces membership when they refetch.
        community: role !== "assistant" && practitionerId ? RealtimeTopics.community() : null,
      };
    }

    return { inbox: null, community: null };
  }
}
