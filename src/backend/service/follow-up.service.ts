import "server-only";

import { FollowUpRepository, type FollowUpRow } from "../repo/follow-up.repo";
import { AuthUser } from "@/shared/auth/auth.types";
import { resolveActingPractitionerUserId } from "@/shared/auth/resolve-practitioner-context";
import { ForbiddenError, AppError } from "@/shared/api/api-error";

async function assertOwnership(authUser: AuthUser, followUpId: string): Promise<void> {
  const followUp = await FollowUpRepository.getFollowUpById(followUpId);
  if (!followUp) {
    throw new AppError("Follow-up not found", 404);
  }

  const practitionerId = await FollowUpRepository.getPractitionerIdFromUserId(
    await resolveActingPractitionerUserId(authUser)
  );
  if (!practitionerId || followUp.practitioner_id !== practitionerId) {
    throw new ForbiddenError("You are not authorized to update this follow-up");
  }
}

export class FollowUpService {
  static async getFollowUps(authUser: AuthUser): Promise<FollowUpRow[]> {
    if (
      authUser.role !== "doctor" &&
      (authUser.role as string) !== "practitioner" &&
      authUser.role !== "assistant"
    ) {
      return [];
    }

    const practitionerId = await FollowUpRepository.getPractitionerIdFromUserId(
      await resolveActingPractitionerUserId(authUser)
    );
    if (!practitionerId) return [];

    return FollowUpRepository.getFollowUpsForPractitioner(practitionerId);
  }

  static async nudgeFollowUp(authUser: AuthUser, followUpId: string): Promise<void> {
    await assertOwnership(authUser, followUpId);
    await FollowUpRepository.nudge(followUpId);
  }

  static async updateFollowUpDate(authUser: AuthUser, followUpId: string, recommendedDate: string): Promise<void> {
    if (!recommendedDate) {
      throw new Error("Recommended date is required");
    }
    await assertOwnership(authUser, followUpId);
    await FollowUpRepository.updateRecommendedDate(followUpId, recommendedDate);
  }
}