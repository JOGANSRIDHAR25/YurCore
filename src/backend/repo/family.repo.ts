import { createClient } from "@/shared/db/supabase.server";
import { AppError } from "@/shared/api/api-error";

export class FamilyRepository {
  static async getFamilyMembers(patientId: string) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("family_members")
      .select("*")
      .eq("owner_patient_id", patientId)
      .eq("is_active", true)
      .order("created_at", { ascending: true });

    if (error) throw new AppError("Error fetching family members", 500);
    return data;
  }

  /**
   * Family members need their own `patients` row (user_id left null — they
   * never sign in) so that appointments/consultations/prescriptions booked
   * on their behalf show up in the doctor's patient directory and search
   * the same way a self-registered patient would, instead of always
   * resolving back to the account owner.
   */
  static async addFamilyMember(patientId: string, member: { fullName: string; relationship: string; dob: string; gender: string; phone?: string; bloodGroup?: string; height?: number; weight?: number; }) {
    const supabase = await createClient();

    const { data: newPatient, error: patientErr } = await supabase
      .from("patients")
      .insert({
        user_id: null,
        full_name: member.fullName,
        date_of_birth: member.dob,
        gender: member.gender,
        blood_group: member.bloodGroup || null,
        height: member.height ?? null,
        weight: member.weight ?? null,
      })
      .select("id")
      .single();
    if (patientErr) throw new AppError("Error creating patient record for family member", 500);

    const { error } = await supabase.from("family_members").insert({
      owner_patient_id: patientId,
      patient_id: newPatient.id,
      full_name: member.fullName,
      relationship: member.relationship,
      date_of_birth: member.dob,
      gender: member.gender,
      phone: member.phone || null,
      blood_group: member.bloodGroup || null,
      height: member.height ?? null,
      weight: member.weight ?? null,
    });
    if (error) throw new AppError("Error adding family member", 500);
  }

  static async updateFamilyMember(id: string, member: { fullName: string; relationship: string; dob: string; gender: string; phone?: string; bloodGroup?: string; height?: number; weight?: number; }) {
    const supabase = await createClient();
    const { data: existing } = await supabase
      .from("family_members")
      .select("patient_id")
      .eq("id", id)
      .maybeSingle();

    const { error } = await supabase
      .from("family_members")
      .update({
        full_name: member.fullName,
        relationship: member.relationship,
        date_of_birth: member.dob,
        gender: member.gender,
        phone: member.phone || null,
        blood_group: member.bloodGroup || null,
        height: member.height ?? null,
        weight: member.weight ?? null,
      })
      .eq("id", id);
    if (error) throw new AppError("Error updating family member", 500);

    if (existing?.patient_id) {
      const { error: patientErr } = await supabase
        .from("patients")
        .update({
          full_name: member.fullName,
          date_of_birth: member.dob,
          gender: member.gender,
          blood_group: member.bloodGroup || null,
          height: member.height ?? null,
          weight: member.weight ?? null,
        })
        .eq("id", existing.patient_id);
      if (patientErr) throw new AppError("Error updating patient record for family member", 500);
    }
  }

  /**
   * Resolve a family member's own `patients.id`, verifying they belong to
   * the given owner so a caller can't view another account's family member
   * by guessing/passing an arbitrary familyMemberId.
   */
  static async getFamilyMemberPatientId(familyMemberId: string, ownerPatientId: string): Promise<string | null> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("family_members")
      .select("patient_id")
      .eq("id", familyMemberId)
      .eq("owner_patient_id", ownerPatientId)
      .eq("is_active", true)
      .maybeSingle();

    if (error) {
      console.error("[FamilyRepository] Error resolving family member patient id:", error.message);
      return null;
    }
    return data?.patient_id ?? null;
  }

  /** `patients.id` of every active family member under an account owner. */
  static async getActiveFamilyPatientIds(ownerPatientId: string): Promise<string[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("family_members")
      .select("patient_id")
      .eq("owner_patient_id", ownerPatientId)
      .eq("is_active", true);

    if (error) {
      console.error("[FamilyRepository] Error resolving family patient ids:", error.message);
      return [];
    }
    return (data ?? []).map((row) => row.patient_id).filter(Boolean) as string[];
  }

  static async deleteFamilyMember(id: string) {
    const supabase = await createClient();
    // Soft delete: family members can be referenced by appointments, consultations,
    // prescriptions, and health records (FK, no cascade) once they have any history,
    // so a hard delete would fail or orphan that clinical data. Deactivating keeps
    // the history intact while removing the member from the active list.
    const { error } = await supabase
      .from("family_members")
      .update({ is_active: false })
      .eq("id", id);
    if (error) throw new AppError("Error deleting family member", 500);
  }
}