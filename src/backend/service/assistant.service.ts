import "server-only";

import {
  AssistantRepository,
  type CreateAssistantInput,
  type DoctorSearchResult,
  type AssistantRecord,
  type AdminAssistantRecord,
  type AssistantStatus,
} from "../repo/assistant.repo";
import { AuthUser } from "@/shared/auth/auth.types";
import { ForbiddenError, ValidationError } from "@/shared/api/api-error";
import { createClient } from "@/shared/db/supabase.server";

const VALID_STATUSES: AssistantStatus[] = ["pending", "approved", "rejected", "suspended"];

function assertDoctor(authUser: AuthUser): void {
  if (authUser.role !== "doctor") {
    throw new ForbiddenError("Doctor access required");
  }
}

function assertAdmin(authUser: AuthUser): void {
  if (authUser.role !== "admin" && authUser.role !== "super_admin") {
    throw new ForbiddenError("Admin access required");
  }
}

async function getOwnPractitionerId(userId: string): Promise<string> {
  const supabase: any = createClient();
  const { data } = await supabase
    .from("practitioners")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data?.id) {
    throw new ForbiddenError("Practitioner profile not found");
  }
  return data.id;
}

export class AssistantService {
  static async searchDoctors(query: string): Promise<DoctorSearchResult[]> {
    if (!query || query.trim().length < 2) return [];
    return AssistantRepository.searchPractitionersByEmailOrName(query);
  }

  static async onboardAssistant(input: CreateAssistantInput): Promise<string> {
    if (!input.fullName?.trim()) throw new ValidationError("Full name is required");
    if (!input.practitionerId) throw new ValidationError("Please select the doctor you assist");
    return AssistantRepository.createAssistant(input);
  }

  static async listMyAssistants(authUser: AuthUser): Promise<AssistantRecord[]> {
    assertDoctor(authUser);
    const practitionerId = await getOwnPractitionerId(authUser.id);
    return AssistantRepository.getAssistantsForPractitioner(practitionerId);
  }

  static async updateAssistantStatus(
    authUser: AuthUser,
    assistantId: string,
    status: AssistantStatus,
    reason?: string
  ): Promise<void> {
    assertDoctor(authUser);
    if (!VALID_STATUSES.includes(status)) {
      throw new ValidationError("Invalid status");
    }
    if (status === "rejected" && !reason?.trim()) {
      throw new ValidationError("A rejection reason is required");
    }
    const practitionerId = await getOwnPractitionerId(authUser.id);
    await AssistantRepository.updateAssistantStatus(assistantId, practitionerId, status, reason);
  }

  static async adminListAssistants(authUser: AuthUser, query?: string): Promise<AdminAssistantRecord[]> {
    assertAdmin(authUser);
    return AssistantRepository.getAllAssistants(query);
  }

  static async adminCreateAssistant(authUser: AuthUser, input: CreateAssistantInput): Promise<string> {
    assertAdmin(authUser);
    if (!input.fullName?.trim()) throw new ValidationError("Full name is required");
    if (!input.email?.trim()) throw new ValidationError("Email is required");
    if (!input.practitionerId) throw new ValidationError("Please select the doctor this assistant works for");
    return AssistantRepository.createAssistant(input);
  }

  static async adminUpdateAssistantStatus(
    authUser: AuthUser,
    assistantId: string,
    status: AssistantStatus,
    reason?: string
  ): Promise<void> {
    assertAdmin(authUser);
    if (!VALID_STATUSES.includes(status)) {
      throw new ValidationError("Invalid status");
    }
    if (status === "rejected" && !reason?.trim()) {
      throw new ValidationError("A rejection reason is required");
    }
    await AssistantRepository.updateAssistantStatusByAdmin(assistantId, status, reason);
  }
}