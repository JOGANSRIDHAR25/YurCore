import "server-only";

import { createClient } from "@/shared/db/supabase.server";

async function resolvePatientId(userId: string): Promise<string> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("patients")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("resolvePatientId error:", error);
    throw new Error("Unable to resolve patient");
  }

  if (!data?.id) {
    throw new Error("Patient profile not found");
  }

  return data.id;
}

export class FavoritesRepository {
  static async listPractitionerIds(userId: string): Promise<string[]> {
    const supabase = createClient();
    const patientId = await resolvePatientId(userId);

    const { data, error } = await supabase
      .from("favorites")
      .select("practitioner_id")
      .eq("patient_id", patientId);

    if (error) {
      console.error("[FavoritesRepository] listPractitionerIds error:", error.message);
      throw new Error("Failed to fetch favorites");
    }

    return (data ?? []).map((row) => row.practitioner_id);
  }

  static async addFavorite(userId: string, practitionerId: string): Promise<void> {
    const supabase = createClient();
    const patientId = await resolvePatientId(userId);

    const { error } = await supabase
      .from("favorites")
      .upsert(
        { patient_id: patientId, practitioner_id: practitionerId },
        { onConflict: "patient_id,practitioner_id", ignoreDuplicates: true }
      );

    if (error) {
      console.error("[FavoritesRepository] addFavorite error:", error.message);
      throw new Error("Failed to add favorite");
    }
  }

  static async removeFavorite(userId: string, practitionerId: string): Promise<void> {
    const supabase = createClient();
    const patientId = await resolvePatientId(userId);

    const { error } = await supabase
      .from("favorites")
      .delete()
      .eq("patient_id", patientId)
      .eq("practitioner_id", practitionerId);

    if (error) {
      console.error("[FavoritesRepository] removeFavorite error:", error.message);
      throw new Error("Failed to remove favorite");
    }
  }
}