import "server-only";

import { createClient } from "@/shared/db/supabase.server";
import { AppError } from "@/shared/api/api-error";
import { AuthUser } from "./auth.types";

/**
 * Resolves the users.id whose practitioners record a /pro request should act
 * against. Doctors act on their own behalf; an approved assistant acts on
 * behalf of the doctor they're linked to, so every getPractitionerIdFromUserId
 * lookup downstream transparently resolves to the doctor's practitioner row.
 */
export async function resolveActingPractitionerUserId(authUser: AuthUser): Promise<string> {
  if (authUser.role !== "assistant") {
    return authUser.id;
  }

  const supabase: any = createClient();
  const { data, error } = await supabase
    .from("assistants")
    .select("status, practitioner:practitioners ( user_id )")
    .eq("user_id", authUser.id)
    .maybeSingle();

  if (error) {
    throw new AppError("Failed to resolve assistant's linked doctor", 500);
  }

  if (!data || data.status !== "approved") {
    throw new AppError("Your access has not been approved by a doctor yet", 403);
  }

  const practitioner = Array.isArray(data.practitioner) ? data.practitioner[0] : data.practitioner;
  if (!practitioner?.user_id) {
    throw new AppError("Linked doctor could not be found", 404);
  }

  return practitioner.user_id;
}