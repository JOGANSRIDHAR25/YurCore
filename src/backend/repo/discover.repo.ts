import { createClient } from "@/shared/db/supabase.server";
import type { Practitioner } from "@/features/doctor/types/doctor.types";
import { bookingMutex, toHHMM } from "./booking.repo";
import { resolveActiveFeeRupees, resolveConsultModes } from "@/lib/fee";
import { ENABLE_VIDEO_CONSULTATION } from "@/lib/feature-flags";


export type DiscoverMetadata = {
  symptoms: string[];
  disciplineCounts: Record<string, number>;
};

export type PractitionerFilters = {
  discipline?: string;
  search?: string;
  videoAvailable?: boolean;
  under500?: boolean;
  today?: boolean;
  languages?: string[];
  sortBy?: string;
};

export type ReviewRow = {
  id: string;
  stars: number;
  text: string;
  patientName: string;
  date: string;
};

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function mapPractitioner(row: any): Practitioner {
  return {
    id: row.id,
    name: row.full_name,
    specialty: (row.specializations ?? [])[0] ?? "",
    specialties: row.specializations ?? [],
    discipline: (row.disciplines ?? [])[0] ?? "Ayurveda",
    experience: row.experience_years ?? 0,
    rating: Number(row.rating_avg ?? 0),
    reviews: row.rating_count ?? 0,
    fee: resolveActiveFeeRupees(row.base_video_fee, row.base_clinic_fee), // the fee patients actually see, given the current active consult mode(s)
    hprId: row.hpr_id ?? "",
    isVerified: row.verification_status === "verified" || row.hpr_verified === true,
    avatar: getInitials(row.full_name),
    languages: row.languages ?? [],
    consultModes: resolveConsultModes(row.base_video_fee, row.base_clinic_fee),
    nextAvailable: "Tomorrow",
    location: [row.city, row.state].filter(Boolean).join(", "),
    qualifications: row.qualifications ?? [],
    about: row.bio ?? "",
    clinicFee: Math.round((row.base_clinic_fee ?? 0) / 100),
    videoFee: Math.round((row.base_video_fee ?? 0) / 100),
    slotDuration: row.slot_duration_min ?? 20,
    bufferMin: row.buffer_min ?? 5,
    gender: row.gender ?? "",
    state: row.state ?? "",
    city: row.city ?? "",
    clinicName: row.clinic_hospital_name ?? "",
    clinicAddress: row.clinic_hospital_address ?? "",
  };
}

export class DiscoverRepository {
  static async getMetadata(): Promise<DiscoverMetadata> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("practitioners")
      .select("disciplines, specializations")
      .eq("verification_status", "verified");

    if (error || !data) {
      return { symptoms: [], disciplineCounts: {} };
    }

    const symptomsSet = new Set<string>();
    const counts: Record<string, number> = {};

    for (const row of data) {
      for (const spec of row.specializations || []) {
        symptomsSet.add(spec);
      }
      for (const disc of row.disciplines || []) {
        counts[disc] = (counts[disc] || 0) + 1;
      }
    }

    return {
      symptoms: Array.from(symptomsSet).slice(0, 30),
      disciplineCounts: counts,
    };
  }

  static async searchPractitioners(filters?: PractitionerFilters): Promise<Practitioner[]> {
    const supabase = await createClient();
    let query = supabase
      .from("practitioners")
      .select("*")
      .eq("verification_status", "verified");

    if (filters?.discipline) {
      query = query.contains("disciplines", [filters.discipline]);
    }

    if (filters?.search) {
      const s = `%${filters.search}%`;
      query = query.or(`full_name.ilike.${s},specializations.cs.{${filters.search}}`);
    }

    // While video consultation is feature-flagged off, in-clinic is the fee patients
    // actually pay — filter/sort on that column instead of the dormant video fee.
    const feeColumn = ENABLE_VIDEO_CONSULTATION ? "base_video_fee" : "base_clinic_fee";

    if (filters?.videoAvailable) {
      query = query.gt(feeColumn, 0);
    }

    if (filters?.under500) {
      // 500 INR in paise is 50000 paise
      query = query.lt(feeColumn, 50000);
    }

    if (filters?.languages && filters.languages.length > 0) {
      query = query.contains("languages", filters.languages);
    }

    if (filters?.today) {
      const todayStr = new Date().toISOString().split("T")[0];
      const { data: slotsData, error: slotsError } = await supabase
        .from("slots")
        .select("practitioner_id")
        .eq("slot_date", todayStr)
        .eq("status", "open");

      if (!slotsError && slotsData) {
        const practitionerIds = Array.from(new Set(slotsData.map((s: any) => s.practitioner_id).filter(Boolean)));
        if (practitionerIds.length > 0) {
          query = query.in("id", practitionerIds);
        } else {
          return [];
        }
      } else {
        return [];
      }
    }

    if (filters?.sortBy === "rating") {
      query = query.order("rating_avg", { ascending: false });
    } else if (filters?.sortBy === "fee-low-high") {
      query = query.order(feeColumn, { ascending: true });
    } else if (filters?.sortBy === "experience") {
      query = query.order("experience_years", { ascending: false });
    } else {
      query = query.order("rating_avg", { ascending: false });
    }

    const { data, error } = await query;
    if (error) {
      console.error("[DiscoverRepository] Error searching practitioners:", error.message);
      throw new Error("Failed to fetch practitioners from database");
    }

    return (data ?? []).map(mapPractitioner);
  }

  static async getPractitionerById(id: string): Promise<Practitioner | null> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("practitioners")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) return null;
    return mapPractitioner(data);
  }

  /** Public lookup: accepts either a user_id or a practitioner_id directly, falling back to the raw input. */
  static async resolvePractitionerId(id: string): Promise<string> {
    const supabase = await createClient();
    const { data } = await supabase
      .from("practitioners")
      .select("id")
      .eq("user_id", id)
      .maybeSingle();
    return data?.id ?? id;
  }

  static async getReviews(practitionerIdParam: string): Promise<ReviewRow[]> {
    const supabase = await createClient();
    const resolvedPractId = await this.resolvePractitionerId(practitionerIdParam);
    const { data, error } = await supabase
      .from("ratings")
      .select(`id, stars, review_text, created_at, patient:patients ( full_name )`)
      .eq("practitioner_id", resolvedPractId)
      .eq("is_visible", true)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      console.error("[DiscoverRepository] Error fetching reviews:", error.message);
      throw new Error("Failed to fetch reviews from database");
    }

    return (data ?? []).map((row: any) => ({
      id: row.id,
      stars: row.stars ?? 5,
      text: row.review_text ?? "",
      patientName: row.patient?.full_name ?? "Patient",
      date: row.created_at ? new Date(row.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "",
    }));
  }

  // -------------------------------------------------------------------------
  // "New doctor" (doctor_profiles) discovery + booking — a newer, parallel
  // schema alongside the legacy `practitioners` table above.
  // -------------------------------------------------------------------------

  static async getNewDoctors(filters?: {
    specialty?: string;
    language?: string;
    mode?: "video" | "clinic";
    city?: string;
    ratingMin?: number;
    feeMax?: number;
    search?: string;
  }): Promise<any[]> {
    const supabase = await createClient();
    const { data: doctors, error } = await supabase
      .from("practitioners")
      .select(`
        *,
        user:users!practitioners_user_id_fkey (email, mobile)
      `)
      .eq("verification_status", "verified");

    if (error) {
      console.error("[DiscoverRepository] Error discovering new doctors:", error.message);
      throw new Error("Failed to fetch doctors from database");
    }

    let filtered = (doctors || []).map((d: any) => ({
      ...d,
      is_active: d.verification_status === "verified",
      consultation_fee: resolveActiveFeeRupees(d.base_video_fee, d.base_clinic_fee),
      consult_modes: resolveConsultModes(d.base_video_fee, d.base_clinic_fee),
      verifications: [{ status: d.verification_status, hpr_id: d.hpr_id }],
      state: d.state ?? "",
      city: d.city ?? "",
      clinic_name: d.clinic_hospital_name ?? "",
      clinic_address: d.clinic_hospital_address ?? "",
    }));

    if (filters?.specialty) {
      filtered = filtered.filter((d) => d.specializations?.some((s: string) => s.toLowerCase() === filters.specialty?.toLowerCase()));
    }

    if (filters?.language) {
      filtered = filtered.filter((d) => d.languages?.some((l: string) => l.toLowerCase() === filters.language?.toLowerCase()));
    }

    if (filters?.feeMax) {
      filtered = filtered.filter((d) => d.consultation_fee <= filters.feeMax!);
    }

    if (filters?.search) {
      const s = filters.search.toLowerCase();
      filtered = filtered.filter(
        (d) => d.full_name?.toLowerCase().includes(s) || d.specializations?.some((sp: string) => sp.toLowerCase().includes(s))
      );
    }

    return filtered;
  }

  static async getDoctorSignedUrl(path: string): Promise<string | null> {
    const supabase = await createClient();
    // Remove bucket name prefix from path if included
    const cleanPath = path.replace(/^doctor-documents\//, "");
    const { data, error } = await supabase.storage.from("doctor-documents").createSignedUrl(cleanPath, 3600);
    if (error) {
      console.error("[DiscoverRepository] Error creating signed url:", error.message);
      return null;
    }
    return data?.signedUrl || null;
  }

  static async getDoctorSlotsFromTemplates(doctorId: string, dateStr: string): Promise<any[]> {
    const supabase = await createClient();
    const dayOfWeek = new Date(dateStr).getDay();

    const { data: templates, error: tempErr } = await supabase
      .from("doctor_availability_templates")
      .select("*")
      .eq("doctor_id", doctorId)
      .eq("day_of_week", dayOfWeek)
      .eq("is_active", true);

    if (tempErr) {
      console.error("[DiscoverRepository] Error fetching templates:", tempErr.message);
      return [];
    }

    // Appointments can be booked through either the legacy flow (sets only
    // `practitioner_id`) or this newer flow (sets both `doctor_profile_id`
    // and `practitioner_id`) — check both columns so a slot booked through
    // either path is correctly hidden here, regardless of which one created it.
    const [{ data: bookedByProfile }, { data: bookedByPractitioner }] = await Promise.all([
      supabase
        .from("appointments")
        .select("scheduled_time")
        .eq("doctor_profile_id", doctorId)
        .eq("scheduled_date", dateStr)
        .neq("status", "cancelled"),
      supabase
        .from("appointments")
        .select("scheduled_time")
        .eq("practitioner_id", doctorId)
        .eq("scheduled_date", dateStr)
        .neq("status", "cancelled"),
    ]);

    const bookedTimes = new Set(
      [...(bookedByProfile ?? []), ...(bookedByPractitioner ?? [])].map((b) => b.scheduled_time?.slice(0, 5)),
    );

    // Check upcoming calls in prescriptions
    const { data: upcomingPrescriptions, error: ucErr } = await supabase
      .from("prescriptions")
      .select("lifestyle_advice")
      .eq("practitioner_id", doctorId)
      .like("lifestyle_advice", `%[Upcoming Session Fixed: ${dateStr} at %`);

    if (!ucErr && upcomingPrescriptions) {
      upcomingPrescriptions.forEach((rx: any) => {
        if (!rx.lifestyle_advice) return;
        const regex = new RegExp(`\\[Upcoming Session Fixed: ${dateStr} at (.*?)\\]`, "g");
        let match;
        while ((match = regex.exec(rx.lifestyle_advice)) !== null) {
          const timeVal = match[1].slice(0, 5); // Ensure "HH:MM"
          bookedTimes.add(timeVal);
        }
      });
    }

    const slots: any[] = [];

    for (const t of templates || []) {
      const duration = t.slot_duration_minutes || 30;
      const [startH, startM] = t.start_time.split(":").map(Number);
      const [endH, endM] = t.end_time.split(":").map(Number);

      let currentMin = startH * 60 + startM;
      const endMin = endH * 60 + endM;

      while (currentMin + duration <= endMin) {
        const h = Math.floor(currentMin / 60);
        const m = currentMin % 60;
        const timeString = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;

        if (!bookedTimes.has(timeString)) {
          const displayHour = h % 12 === 0 ? 12 : h % 12;
          const ampm = h >= 12 ? "PM" : "AM";
          const displayTime = `${displayHour}:${String(m).padStart(2, "0")} ${ampm}`;

          slots.push({
            id: `${t.id}_${timeString}`,
            startTime: displayTime,
            timeValue: timeString,
            mode: t.consultation_mode,
          });
        }
        currentMin += duration;
      }
    }

    // Deduplicate slots by timeValue — merge modes from duplicate times
    const mergedMap: Map<string, any> = new Map();
    for (const slot of slots) {
      if (mergedMap.has(slot.timeValue)) {
        const existing = mergedMap.get(slot.timeValue);
        if (!existing.modes.includes(slot.mode)) {
          existing.modes.push(slot.mode);
        }
      } else {
        mergedMap.set(slot.timeValue, {
          ...slot,
          modes: [slot.mode],
        });
      }
    }

    return Array.from(mergedMap.values());
  }

  static async getNewDoctorAvailableDates(doctorId: string): Promise<string[]> {
    const supabase = await createClient();
    const { data: templates, error } = await supabase
      .from("doctor_availability_templates")
      .select("day_of_week")
      .eq("doctor_id", doctorId)
      .eq("is_active", true);

    if (error || !templates) return [];

    const activeDays = new Set(templates.map((t) => t.day_of_week));
    const dates: string[] = [];
    const today = new Date();

    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(today.getDate() + i);
      if (activeDays.has(d.getDay())) {
        dates.push(d.toISOString().split("T")[0]);
      }
    }
    return dates;
  }

  static async bookNewDoctorAppointment(params: {
    userId: string;
    doctorProfileId: string;
    mode: "video" | "clinic";
    reason: string;
    date: string;
    time: string;
    familyMemberId?: string;
  }): Promise<{ id: string }> {
    const supabase = await createClient();

    const { data: patientProfile, error: patErr } = await supabase
      .from("patient_profiles")
      .select("id")
      .eq("user_id", params.userId)
      .single();

    if (patErr || !patientProfile) {
      throw new Error("Patient profile not found. Please complete onboarding first.");
    }

    const ownerPatientId = await this.resolvePatientIdForBooking(params.userId);
    const resolvedPatientId = await this.resolveFamilyMemberPatientId(ownerPatientId, params.familyMemberId);

    const formattedTime = toHHMM(params.time);
    const lockKey = `${params.doctorProfileId}_${params.date}_${formattedTime}`;
    const release = await bookingMutex.acquire(lockKey);

    try {
      // Validate if slot is already taken by appointment or upcoming call
      const { data: existingAppt } = await supabase
        .from("appointments")
        .select("id")
        .eq("doctor_profile_id", params.doctorProfileId)
        .eq("scheduled_date", params.date)
        .eq("scheduled_time", formattedTime)
        .neq("status", "cancelled")
        .maybeSingle();

      if (existingAppt) {
        throw new Error("Slot no longer available.");
      }

      const { data: existingUpcoming } = await supabase
        .from("prescriptions")
        .select("id")
        .eq("practitioner_id", params.doctorProfileId)
        .like("lifestyle_advice", `%[Upcoming Session Fixed: ${params.date} at ${formattedTime}]%`)
        .limit(1)
        .maybeSingle();

      if (existingUpcoming) {
        throw new Error("Slot no longer available.");
      }

      const { data: inserted, error: apptError } = await supabase.from("appointments").insert({
        patient_profile_id: patientProfile.id,
        patient_id: resolvedPatientId,
        doctor_profile_id: params.doctorProfileId,
        practitioner_id: params.doctorProfileId,
        family_member_id: params.familyMemberId || null,
        mode: params.mode,
        status: "scheduled",
        reason_for_visit: params.reason,
        scheduled_date: params.date,
        scheduled_time: formattedTime,
        duration_min: 30,
      }).select("id").single();

      if (apptError) {
        console.error("[DiscoverRepository] bookNewDoctorAppointment error:", apptError.message);
        throw apptError;
      }
      return { id: inserted.id };
    } finally {
      release();
    }
  }


  private static async resolvePatientIdForBooking(userId: string): Promise<string> {
    const supabase = await createClient();
    const { data } = await supabase.from("patients").select("id").eq("user_id", userId).maybeSingle();
    return data?.id ?? userId;
  }

  /**
   * When booking on behalf of a family member, the appointment must be
   * attributed to their own `patients` row (not the account owner's) so
   * the doctor's patient directory/prescriptions/EMR find them correctly.
   * Ownership is verified against the owner's resolved patient id.
   */
  private static async resolveFamilyMemberPatientId(ownerPatientId: string, familyMemberId?: string): Promise<string> {
    if (!familyMemberId) return ownerPatientId;

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("family_members")
      .select("patient_id")
      .eq("id", familyMemberId)
      .eq("owner_patient_id", ownerPatientId)
      .eq("is_active", true)
      .maybeSingle();

    if (error) {
      console.error("[DiscoverRepository] resolveFamilyMemberPatientId error:", error.message);
      throw new Error("Unable to resolve family member");
    }
    if (!data?.patient_id) {
      throw new Error("Family member is not set up for booking yet");
    }
    return data.patient_id;
  }
}