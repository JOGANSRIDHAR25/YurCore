import { createClient } from "@/shared/db/supabase.server";
import { resolveActiveFeeRupees } from "@/lib/fee";

export type SaveDoctorProfileInput = {
  email: string;
  phone?: string;
  fullName: string;
  photoUrl?: string;
  signatureUrl?: string;
  consultationFee?: number;
  specializations?: string[];
  languages?: string[];
  qualifications?: string[];
  degreeUrl?: string;
  registrationCertUrl?: string;
  hprId?: string;
  dateOfBirth?: string;
  gender?: string;
  bloodGroup?: string;
  state?: string;
  city?: string;
  clinicName?: string;
  clinicAddress?: string;
  experienceYears?: number;
};

export type EmergencyContact = { name: string; phone: string };

export type SavePatientProfileInput = {
  email: string;
  fullName: string;
  dateOfBirth?: string;
  gender?: string;
  bloodGroup?: string;
  phone: string;
  address?: string;
  abhaNumber?: string;
  ayushNumber?: string;
  emergencyContacts?: EmergencyContact[];
  allergies?: string[];
  chronicConditions?: string[];
  currentMedications?: string[];
};

export class OnboardingRepository {
  static async getDoctorProfileByUserId(userId: string): Promise<any | null> {
    const supabase: any = createClient();
    const { data, error } = await supabase
      .from("practitioners")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("[OnboardingRepository] Error loading doctor profile:", error.message);
      return null;
    }
    if (!data) return null;

    // Return in compatible shape expected by frontend
    return {
      ...data,
      consultation_fee: resolveActiveFeeRupees(data.base_video_fee, data.base_clinic_fee),
      is_active: data.verification_status === "verified",
      verifications: [
        {
          id: data.id,
          status: data.verification_status,
          rejection_reason: data.rejection_reason,
          degree_url: data.degree_url,
          registration_cert_url: data.registration_cert_url,
          hpr_id: data.hpr_id,
        },
      ],
    };
  }

  static async saveDoctorProfileAndVerification(p: SaveDoctorProfileInput): Promise<string> {
    const supabase: any = createClient();

    // 1. Resolve or create the users row
    const { data: userIdData, error: userErr } = await supabase
      .rpc("upsert_user_by_email", {
        p_email: p.email,
        p_role: "practitioner",
      });

    if (userErr) {
      console.error("[OnboardingRepository] upsert_user_by_email error:", userErr.message);
      throw new Error(userErr.message || "Failed to create user");
    }

    const userId = userIdData as string;
    if (!userId) {
      throw new Error("Failed to resolve user ID");
    }

    // Update phone if provided
    if (p.phone) {
      await supabase.from("users").update({ mobile: p.phone }).eq("id", userId);
    }

    // 2. Upsert directly into practitioners table. blood_group is no longer
    // collected on the doctor profile form — only touch it if this caller
    // actually sent a value, so an existing one (set some other way) is
    // never silently wiped by a routine profile save.
    const practitionerRow: Record<string, unknown> = {
      user_id: userId,
      full_name: p.fullName,
      photo_url: p.photoUrl || null,
      signature_url: p.signatureUrl || null,
      degree_url: p.degreeUrl || null,
      registration_cert_url: p.registrationCertUrl || null,
      hpr_id: p.hprId || null,
      date_of_birth: p.dateOfBirth || null,
      gender: p.gender || null,
      state: p.state || null,
      city: p.city || null,
      clinic_hospital_name: p.clinicName || null,
      clinic_hospital_address: p.clinicAddress || null,
      // experience_years is NOT NULL in the practitioners table. The quick
      // onboarding flow only collects name + phone, so default to 0 here —
      // Profile → Create Profile fills in the real figure afterwards.
      experience_years: p.experienceYears ?? 0,
      specializations: p.specializations || [],
      disciplines: ["Ayurveda"],
      languages: p.languages || [],
      qualifications: p.qualifications && p.qualifications.length ? p.qualifications : ["BAMS"],
      // Onboarding/profile-completion only ever collects one generic fee (there's no
      // separate video/clinic input while video consultations are feature-flagged off),
      // so mirror it into both columns. The Availability page is the one place that
      // later splits these into distinct video/clinic amounts.
      base_video_fee: (p.consultationFee || 0) * 100, // paise
      base_clinic_fee: (p.consultationFee || 0) * 100, // paise
      verification_status: "pending",
    };
    if (p.bloodGroup !== undefined) practitionerRow.blood_group = p.bloodGroup || null;

    const { error: pracErr } = await supabase
      .from("practitioners")
      .upsert(
        practitionerRow,
        { onConflict: "user_id" }
      );

    if (pracErr) {
      console.error("[OnboardingRepository] Error saving practitioner profile:", pracErr.message);
      throw new Error(pracErr.message || "Failed to save practitioner profile");
    }

    return userId;
  }

  static async getPatientProfileByUserId(userId: string): Promise<any | null> {
    const supabase: any = createClient();
    const { data, error } = await supabase
      .from("patients")
      .select(`
        *,
        family_members!owner_patient_id (*)
      `)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("[OnboardingRepository] Error loading patient profile:", error.message);
      return null;
    }
    return data;
  }

  static async savePatientProfile(p: SavePatientProfileInput): Promise<string> {
    const supabase: any = createClient();

    // 1. Resolve or create the users row
    const { data: userIdData, error: userErr } = await supabase
      .rpc("upsert_user_by_email", {
        p_email: p.email,
        p_role: "patient",
      });

    if (userErr) {
      console.error("[OnboardingRepository] upsert_user_by_email error:", userErr.message);
      throw new Error(userErr.message || "Failed to create user");
    }

    const userId = userIdData as string;
    if (!userId) {
      throw new Error("Failed to resolve user ID");
    }

    await supabase
      .from("users")
      .update({ role: "patient", abha_number: p.abhaNumber || null, mobile: p.phone || null })
      .eq("id", userId);

    // 2. Upsert patient profile. Only fields this caller actually provided are
    // included — omitting a key (rather than sending an empty/default value)
    // means an existing value already saved for that field is left untouched,
    // so e.g. saving from the Create Profile form (which no longer collects
    // clinical details) can never wipe out allergies/conditions/medications
    // that were captured elsewhere.
    const patientRow: Record<string, unknown> = {
      user_id: userId,
      full_name: p.fullName,
      // date_of_birth and gender are NOT NULL in the patients table. The quick
      // onboarding flow only collects name + phone, so seed sentinel placeholders
      // here — neither is a value real forms ever submit, so they're safe to
      // detect and hide until Profile → Create Profile fills in the real ones.
      date_of_birth: p.dateOfBirth || "1970-01-01",
      gender: p.gender || "prefer_not_to_say",
    };
    if (p.bloodGroup !== undefined) patientRow.blood_group = p.bloodGroup || null;
    if (p.address !== undefined) patientRow.address = p.address || null;
    if (p.abhaNumber !== undefined) patientRow.abha_number = p.abhaNumber || null;
    if (p.ayushNumber !== undefined) patientRow.ayush_number = p.ayushNumber || null;
    if (p.emergencyContacts !== undefined) patientRow.emergency_contacts = p.emergencyContacts;
    if (p.allergies !== undefined) patientRow.allergies = p.allergies;
    if (p.chronicConditions !== undefined) patientRow.chronic_conditions = p.chronicConditions;
    if (p.currentMedications !== undefined) patientRow.current_medications = p.currentMedications;

    // emergency_contacts and ayush_number are recent additions — if either
    // hasn't been migrated onto this database yet, PostgREST reports a
    // schema-cache miss naming the missing column. Retry with that one
    // column stripped so the rest of the profile (DOB/gender/blood group/
    // address, all NOT NULL-critical or otherwise required) still saves
    // instead of the whole request failing on one optional field.
    let row = patientRow;
    let error: { message: string } | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      ({ error } = await supabase.from("patients").upsert(row, { onConflict: "user_id" }));
      if (!error) break;

      const missingColumn = ["emergency_contacts", "ayush_number"].find(
        (col) => error!.message?.includes(col) && col in row
      );
      if (!missingColumn) break;

      console.warn(`[OnboardingRepository] ${missingColumn} column missing — retrying without it`);
      const { [missingColumn]: _omit, ...rest } = row;
      row = rest;
    }

    if (error) {
      console.error("[OnboardingRepository] Error saving patient profile:", error.message);
      throw error;
    }

    return userId;
  }

  static async getVerificationQueue(): Promise<any[]> {
    const supabase: any = createClient();
    const { data, error } = await supabase
      .from("practitioners")
      .select(`
        id,
        user_id,
        full_name,
        photo_url,
        signature_url,
        degree_url,
        registration_cert_url,
        hpr_id,
        verification_status,
        rejection_reason,
        base_video_fee,
        base_clinic_fee,
        specializations,
        languages,
        qualifications,
        created_at,
        user:users!practitioners_user_id_fkey (
          email,
          mobile
        )
      `)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[OnboardingRepository] Error fetching verification queue:", error.message);
      throw new Error("Failed to fetch verification queue from database");
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      doctor_id: row.id,
      degree_url: row.degree_url,
      registration_cert_url: row.registration_cert_url,
      hpr_id: row.hpr_id,
      status: row.verification_status,
      rejection_reason: row.rejection_reason,
      created_at: row.created_at,
      doctor: {
        id: row.id,
        user_id: row.user_id,
        full_name: row.full_name,
        photo_url: row.photo_url,
        signature_url: row.signature_url,
        consultation_fee: resolveActiveFeeRupees(row.base_video_fee, row.base_clinic_fee),
        specializations: row.specializations ?? [],
        languages: row.languages ?? [],
        qualifications: row.qualifications ?? [],
        user: row.user,
      },
    }));
  }

  static async getDoctorRowForVerification(doctorId: string): Promise<any | null> {
    const supabase: any = createClient();
    const { data, error } = await supabase
      .from("practitioners")
      .select(`
        id,
        full_name,
        qualifications,
        specializations,
        languages,
        base_video_fee,
        base_clinic_fee,
        degree_url,
        registration_cert_url,
        signature_url,
        user:users!practitioners_user_id_fkey ( mobile )
      `)
      .eq("id", doctorId)
      .maybeSingle();

    if (error) {
      console.error("[OnboardingRepository] Error loading doctor row for verification:", error.message);
      return null;
    }
    return data;
  }

  static async verifyDoctor(
    verificationId: string,
    doctorId: string,
    status: "verified" | "rejected",
    reviewerId: string,
    reason?: string
  ): Promise<void> {
    const supabase: any = createClient();

    const targetId = doctorId || verificationId;
    const updates: Record<string, any> = {
      verification_status: status,
      rejection_reason: reason || null,
    };

    const { data: prac, error: updateErr } = await supabase
      .from("practitioners")
      .update(updates)
      .eq("id", targetId)
      .select("user_id")
      .maybeSingle();

    if (updateErr) {
      console.error("[OnboardingRepository] Error updating practitioner verification:", updateErr.message);
      throw updateErr;
    }

    if (prac?.user_id) {
      await supabase
        .from("users")
        .update({ role: "practitioner" })
        .eq("id", prac.user_id);
    }
  }
}