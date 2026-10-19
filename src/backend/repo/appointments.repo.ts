import "server-only";

import { createClient } from "@/shared/db/supabase.server";

/* -------------------------------------------------------------------------- */
/*                                   Types                                    */
/* -------------------------------------------------------------------------- */

export type AppointmentVideoStatus =
  | "not_started"
  | "waiting"
  | "in_progress"
  | "ended"
  | "cancelled";

export type AppointmentDbRow = {
  id: string;
  mode: string;
  status: string;
  reason_for_visit: string | null;

  scheduled_date: string;
  scheduled_time: string;

  duration_min: number | null;
  cancellation_reason: string | null;
  cancelled_at: string | null;

  video_status: string | null;
  session_ended_at: string | null;
  missed_by: string | null;
  patient_joined_at: string | null;

  patient_id?: string | null;
  family_member_id?: string | null;
  patient?: { full_name: string | null } | { full_name: string | null }[] | null;
  family_member?:
  | { full_name: string | null; relationship: string | null }
  | { full_name: string | null; relationship: string | null }[]
  | null;

  slot:
  | {
    fee: number | null;
  }
  | {
    fee: number | null;
  }[]
  | null;

  practitioner:
  | {
    id: string;
    full_name: string | null;
    specializations: string[] | null;
    disciplines: string[] | null;
    base_video_fee: number | null;
    base_clinic_fee: number | null;
    slot_duration_min: number | null;
    buffer_min: number | null;
  }
  | {
    id: string;
    full_name: string | null;
    specializations: string[] | null;
    disciplines: string[] | null;
    base_video_fee: number | null;
    base_clinic_fee: number | null;
    slot_duration_min: number | null;
    buffer_min: number | null;
  }[]
  | null;

  consultation:
  | {
    id: string;
    rating:
    | {
      stars: number | null;
    }
    | {
      stars: number | null;
    }[]
    | null;
  }
  | {
    id: string;
    rating:
    | {
      stars: number | null;
    }
    | {
      stars: number | null;
    }[]
    | null;
  }[]
  | null;
};

export type AppointmentOwnershipRow = {
  id: string;
  patient_id: string;
  practitioner_id: string;
  doctor_profile_id: string;
  mode: string;
  status: string;
};

export type AppointmentVideoRow = {
  id: string;
  patient_id: string;
  practitioner_id: string;

  mode: string;
  status: string;

  scheduled_date: string;
  scheduled_time: string;

  video_provider: string;
  video_room_name: string | null;
  video_status: AppointmentVideoStatus;

  session_started_at: string | null;
  session_ended_at: string | null;
  duration_min: number | null;

  patient_joined_at: string | null;
  practitioner_joined_at: string | null;

  patient:
  | { full_name: string | null }
  | { full_name: string | null }[]
  | null;

  practitioner:
  | {
    user_id: string | null;
    full_name: string | null;
    specializations: string[] | null;
    disciplines: string[] | null;
    slot_duration_min: number | null;
    buffer_min: number | null;
  }
  | {
    user_id: string | null;
    full_name: string | null;
    specializations: string[] | null;
    disciplines: string[] | null;
    slot_duration_min: number | null;
    buffer_min: number | null;
  }[]
  | null;
};

type SlotAppointmentData = {
  practitioner_id: string;
  slot_date: string;
  start_time: string;
  end_time: string | null;
};

function computeSlotDurationMinutes(
  startTime: string,
  endTime: string | null,
): number {
  if (!endTime) {
    return 30;
  }

  const [startH, startM] = startTime.split(":").map(Number);
  const [endH, endM] = endTime.split(":").map(Number);

  if (
    Number.isNaN(startH) ||
    Number.isNaN(startM) ||
    Number.isNaN(endH) ||
    Number.isNaN(endM)
  ) {
    return 30;
  }

  const minutes = endH * 60 + endM - (startH * 60 + startM);

  return minutes > 0 ? minutes : 30;
}

/* -------------------------------------------------------------------------- */
/*                              Select statements                             */
/* -------------------------------------------------------------------------- */

const APPOINTMENT_SELECT = `
  id,
  mode,
  status,
  reason_for_visit,
  scheduled_date,
  scheduled_time,
  duration_min,
  cancellation_reason,
  cancelled_at,
  video_status,
  session_ended_at,
  missed_by,
  patient_joined_at,
  patient_id,
  family_member_id,
  patient:patients (
    full_name
  ),
  family_member:family_members (
    full_name,
    relationship
  ),
  slot:slots (
    fee
  ),
  practitioner:practitioners (
    id,
    full_name,
    specializations,
    disciplines,
    base_video_fee,
    base_clinic_fee,
    slot_duration_min,
    buffer_min
  ),
  consultation:consultations (
    id,
    rating:ratings (
      stars
    )
  )
`;

const VIDEO_APPOINTMENT_SELECT = `
  id,
  patient_id,
  practitioner_id,
  mode,
  status,
  scheduled_date,
  scheduled_time,
  video_provider,
  video_room_name,
  video_status,
  session_started_at,
  session_ended_at,
  duration_min,
  patient_joined_at,
  practitioner_joined_at,
  patient:patients ( full_name ),
  practitioner:practitioners ( user_id, full_name, specializations, disciplines, slot_duration_min, buffer_min )
`;

/* -------------------------------------------------------------------------- */
/*                              Repository class                              */
/* -------------------------------------------------------------------------- */

export class AppointmentsRepository {
  /**
   * Resolve the patients.id value associated with an authenticated users.id.
   */
  static async getPatientIdFromUserId(
    userId: string,
  ): Promise<string | null> {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("patients")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error(
        "[AppointmentsRepository] Error resolving patient ID:",
        error.message,
      );

      throw new Error(
        "Database error while resolving the patient profile",
      );
    }

    return data?.id ?? null;
  }

  /**
   * Resolve the practitioners.id value associated with an authenticated
   * users.id.
   */
  static async getDoctorIdFromUserId(
    userId: string,
  ): Promise<string | null> {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("practitioners")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error(
        "[AppointmentsRepository] Error resolving practitioner ID:",
        error.message,
      );

      throw new Error(
        "Database error while resolving the practitioner profile",
      );
    }

    return data?.id ?? null;
  }

  /**
   * Alias using the database entity's correct name.
   */
  static async getPractitionerIdFromUserId(
    userId: string,
  ): Promise<string | null> {
    return this.getDoctorIdFromUserId(userId);
  }

  /**
   * Whether the account owner (ownerPatientId) may act on an appointment
   * booked under appointmentPatientId: their own, or one of their active
   * family members' (family members have no login — the owner joins,
   * cancels and follows up on their behalf).
   */
  static async isOwnOrFamilyPatient(
    ownerPatientId: string,
    appointmentPatientId: string,
  ): Promise<boolean> {
    if (ownerPatientId === appointmentPatientId) {
      return true;
    }

    const supabase = await createClient();

    const { data, error } = await supabase
      .from("family_members")
      .select("id")
      .eq("owner_patient_id", ownerPatientId)
      .eq("patient_id", appointmentPatientId)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error(
        "[AppointmentsRepository] Error checking family member ownership:",
        error.message,
      );

      throw new Error(
        "Database error while checking family member access",
      );
    }

    return Boolean(data);
  }

  /**
   * Fetch appointments belonging to a patient, including appointments
   * booked for that patient's family members (dependents share the
   * account owner's portal view but have their own patients.id).
   */
  static async getAppointmentsForPatient(
    patientId: string,
  ): Promise<AppointmentDbRow[]> {
    const supabase = await createClient();

    const { data: familyMembers, error: familyMembersError } = await supabase
      .from("family_members")
      .select("patient_id")
      .eq("owner_patient_id", patientId)
      .eq("is_active", true);

    if (familyMembersError) {
      console.error(
        "[AppointmentsRepository] Error resolving family members:",
        familyMembersError.message,
      );

      throw new Error(
        "Database error while resolving family member profiles",
      );
    }

    const visiblePatientIds = [
      patientId,
      ...(familyMembers ?? []).map((member) => member.patient_id),
    ];

    const { data, error } = await supabase
      .from("appointments")
      .select(APPOINTMENT_SELECT)
      .in("patient_id", visiblePatientIds)
      .order("scheduled_date", { ascending: false })
      .order("scheduled_time", { ascending: false });

    if (error) {
      console.error(
        "[AppointmentsRepository] Error fetching patient appointments:",
        error.message,
      );

      throw new Error(
        "Failed to fetch patient appointments from the database",
      );
    }

    return (data ?? []) as unknown as AppointmentDbRow[];
  }

  /**
   * Fetch appointments belonging to a practitioner.
   *
   * practitioner_id is used because the appointments table has a foreign key
   * from appointments.practitioner_id to practitioners.id.
   */
  static async getAppointmentsForDoctor(
    practitionerId: string,
  ): Promise<AppointmentDbRow[]> {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("appointments")
      .select(APPOINTMENT_SELECT)
      .eq("practitioner_id", practitionerId)
      .order("scheduled_date", { ascending: false })
      .order("scheduled_time", { ascending: false });

    if (error) {
      console.error(
        "[AppointmentsRepository] Error fetching practitioner appointments:",
        error.message,
      );

      throw new Error(
        "Failed to fetch practitioner appointments from the database",
      );
    }

    return (data ?? []) as unknown as AppointmentDbRow[];
  }

  /**
   * Fetch all appointments for admin and super-admin users.
   */
  static async getAllAppointments(): Promise<
    AppointmentDbRow[]
  > {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("appointments")
      .select(APPOINTMENT_SELECT)
      .order("scheduled_date", { ascending: false })
      .order("scheduled_time", { ascending: false });

    if (error) {
      console.error(
        "[AppointmentsRepository] Error fetching all appointments:",
        error.message,
      );

      throw new Error(
        "Failed to fetch appointments from the database",
      );
    }

    return (data ?? []) as unknown as AppointmentDbRow[];
  }

  /**
   * Fetch the appointment information required for ownership validation.
   */
  static async getAppointmentById(
    appointmentId: string,
  ): Promise<AppointmentOwnershipRow | null> {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("appointments")
      .select(`
        id,
        patient_id,
        practitioner_id,
        doctor_profile_id,
        mode,
        status
      `)
      .eq("id", appointmentId)
      .maybeSingle();

    if (error) {
      console.error(
        "[AppointmentsRepository] Error fetching appointment by ID:",
        error.message,
      );

      throw new Error(
        "Database error while fetching appointment details",
      );
    }

    if (!data) {
      return null;
    }

    /*
     * doctor_profile_id is retained for compatibility with your existing
     * service. When it is null, practitioner_id is used as the fallback.
     */
    return {
      id: data.id,
      patient_id: data.patient_id,
      practitioner_id: data.practitioner_id,
      doctor_profile_id:
        data.doctor_profile_id ?? data.practitioner_id,
      mode: data.mode,
      status: data.status,
    };
  }

  /**
   * Cancel an existing appointment.
   */
  static async cancelAppointment(
    appointmentId: string,
    reason: string,
  ): Promise<void> {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("appointments")
      .update({
        status: "cancelled",
        cancellation_reason: reason,
        cancelled_at: new Date().toISOString(),
        video_status: "cancelled",
      })
      .eq("id", appointmentId)
      .neq("status", "cancelled")
      .select("id")
      .maybeSingle();

    if (error) {
      console.error(
        "[AppointmentsRepository] Error cancelling appointment:",
        error.message,
      );

      throw new Error(
        "Failed to update the appointment cancellation state",
      );
    }

    if (!data) {
      throw new Error(
        "Appointment was not found or is already cancelled",
      );
    }
  }

  /**
   * Notify the practitioner that a patient cancelled their appointment.
   * Best-effort — failures are logged but never block the cancellation itself.
   */
  static async notifyPractitionerOfCancellation(
    appointmentId: string,
  ): Promise<void> {
    const supabase = await createClient();

    const { data: appt, error } = await supabase
      .from("appointments")
      .select(`
        scheduled_date,
        scheduled_time,
        patients ( full_name ),
        practitioners ( user_id )
      `)
      .eq("id", appointmentId)
      .maybeSingle();

    if (error || !appt) {
      console.error(
        "[AppointmentsRepository] Error fetching appointment for cancellation notice:",
        error?.message,
      );
      return;
    }

    const practitioner = Array.isArray(appt.practitioners) ? appt.practitioners[0] : appt.practitioners;
    const practitionerUserId = (practitioner as { user_id?: string } | null)?.user_id;
    if (!practitionerUserId) return;

    const patientRow = Array.isArray(appt.patients) ? appt.patients[0] : appt.patients;
    const patientName = (patientRow as { full_name?: string } | null)?.full_name || "A patient";

    const formattedDate = appt.scheduled_date
      ? new Date(`${appt.scheduled_date}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
      : "";
    const timeStr = appt.scheduled_time || "";
    const [hr, min] = timeStr.split(":");
    let formattedTime = timeStr;
    if (hr && min) {
      const h = parseInt(hr, 10);
      const period = h >= 12 ? "PM" : "AM";
      const h12 = h % 12 || 12;
      formattedTime = `${h12}:${min} ${period}`;
    }

    const { error: notifError } = await supabase.from("notifications").insert({
      user_id: practitionerUserId,
      title: "Appointment Cancelled",
      body: `${patientName} cancelled their appointment scheduled on ${formattedDate} at ${formattedTime}.`,
      type: "appointment_cancelled",
      is_read: false,
    });

    if (notifError) {
      console.error(
        "[AppointmentsRepository] Error inserting cancellation notification:",
        notifError.message,
      );
    }
  }

  /**
   * Fetch the data needed to compose a booking/cancellation email for an
   * appointment: patient email/name, practitioner name, schedule and fee.
   */
  static async getAppointmentEmailDetails(appointmentId: string): Promise<{
    patientEmail: string;
    patientName: string;
    /** Set when the appointment is for a family member — the email goes to the account owner (patientName). */
    familyMemberName?: string;
    practitionerName: string;
    scheduledDate: string;
    scheduledTime: string;
    mode: string;
    feePaise: number | null;
  } | null> {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("appointments")
      .select(`
        mode,
        scheduled_date,
        scheduled_time,
        patient_id,
        patient:patients ( full_name, user:users ( email ) ),
        practitioner:practitioners ( full_name ),
        slot:slots ( fee )
      `)
      .eq("id", appointmentId)
      .maybeSingle();

    if (error || !data) {
      console.error(
        "[AppointmentsRepository] Error fetching appointment email details:",
        error?.message,
      );
      return null;
    }

    const patient = Array.isArray(data.patient) ? data.patient[0] : data.patient;
    const practitioner = Array.isArray(data.practitioner) ? data.practitioner[0] : data.practitioner;
    const slot = Array.isArray(data.slot) ? data.slot[0] : data.slot;
    const patientUser = patient ? (Array.isArray(patient.user) ? patient.user[0] : patient.user) : null;

    let patientEmail: string | undefined = patientUser?.email;
    let patientName: string = patient?.full_name || "Patient";
    let familyMemberName: string | undefined;

    // Family members have no login/email of their own — the account owner
    // who booked on their behalf receives the email, naming the member.
    if (!patientEmail && data.patient_id) {
      const { data: familyRow } = await supabase
        .from("family_members")
        .select("full_name, owner_patient_id")
        .eq("patient_id", data.patient_id)
        .limit(1)
        .maybeSingle();

      const { data: owner } = familyRow?.owner_patient_id
        ? await supabase
            .from("patients")
            .select("full_name, user:users ( email )")
            .eq("id", familyRow.owner_patient_id)
            .maybeSingle()
        : { data: null };
      const ownerUser: any = owner ? (Array.isArray(owner.user) ? owner.user[0] : owner.user) : null;
      if (ownerUser?.email) {
        patientEmail = ownerUser.email;
        patientName = owner?.full_name || "Patient";
        familyMemberName = familyRow?.full_name || patient?.full_name || undefined;
      }
    }

    if (!patientEmail) {
      return null;
    }

    return {
      patientEmail,
      patientName,
      familyMemberName,
      practitionerName: practitioner?.full_name || "Practitioner",
      scheduledDate: data.scheduled_date,
      scheduledTime: data.scheduled_time,
      mode: data.mode,
      feePaise: slot?.fee ?? null,
    };
  }

  /**
   * Create an appointment using the selected slot.
   */
  static async createAppointment(
    patientId: string,
    slotId: string,
    mode: string,
    reasonForVisit?: string,
  ): Promise<{ id: string }> {
    const supabase = await createClient();

    const { data: slotData, error: slotError } =
      await supabase
        .from("slots")
        .select(`
          practitioner_id,
          slot_date,
          start_time,
          end_time
        `)
        .eq("id", slotId)
        .maybeSingle();

    if (slotError) {
      console.error(
        "[AppointmentsRepository] Error fetching selected slot:",
        slotError.message,
      );

      throw new Error(
        "Database error while validating the selected slot",
      );
    }

    if (!slotData) {
      throw new Error(
        "Selected appointment slot does not exist",
      );
    }

    const slot = slotData as SlotAppointmentData;

    if (!slot.practitioner_id) {
      throw new Error(
        "The selected slot is not assigned to a practitioner",
      );
    }

    if (!slot.slot_date || !slot.start_time) {
      throw new Error(
        "The selected slot does not contain a valid date and time",
      );
    }

    /*
     * Optional protection against booking the same slot more than once.
     * Cancelled appointments do not block the slot.
     */
    const { data: existingAppointment, error: conflictError } =
      await supabase
        .from("appointments")
        .select("id")
        .eq("slot_id", slotId)
        .not("status", "in", '("cancelled","no_show")')
        .limit(1)
        .maybeSingle();

    if (conflictError) {
      console.error(
        "[AppointmentsRepository] Error checking slot availability:",
        conflictError.message,
      );

      throw new Error(
        "Database error while checking slot availability",
      );
    }

    if (existingAppointment) {
      throw new Error(
        "The selected appointment slot has already been booked",
      );
    }

    const { data, error } = await supabase
      .from("appointments")
      .insert({
        slot_id: slotId,
        patient_id: patientId,

        /*
         * practitioner_id is mandatory in your appointments schema.
         */
        practitioner_id: slot.practitioner_id,

        /*
         * Retained for compatibility with your current application.
         * Remove this assignment later if doctor_profile_id represents
         * a different table in your final database design.
         */
        doctor_profile_id: slot.practitioner_id,

        scheduled_date: slot.slot_date,
        scheduled_time: slot.start_time,
        duration_min: computeSlotDurationMinutes(
          slot.start_time,
          slot.end_time,
        ),

        mode,
        status: "scheduled",
        reason_for_visit: reasonForVisit?.trim() || null,

        video_provider: "jitsi",
        video_status: "not_started",
      })
      .select("id")
      .single();

    if (error) {
      console.error(
        "[AppointmentsRepository] Error creating appointment:",
        error.message,
      );

      if (
        error.code === "23505" ||
        error.message.toLowerCase().includes("duplicate")
      ) {
        throw new Error(
          "The selected appointment slot has already been booked",
        );
      }

      throw new Error(
        "Database error while registering the appointment",
      );
    }

    return {
      id: data.id,
    };
  }

  /**
   * Resolve which practitioner a slot belongs to, so a caller can verify
   * ownership before letting that slot be used to book on someone's behalf.
   */
  static async getSlotPractitionerId(
    slotId: string,
  ): Promise<string | null> {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("slots")
      .select("practitioner_id")
      .eq("id", slotId)
      .maybeSingle();

    if (error) {
      console.error(
        "[AppointmentsRepository] Error resolving slot practitioner:",
        error.message,
      );

      throw new Error(
        "Database error while validating the selected slot",
      );
    }

    return (data as { practitioner_id: string | null } | null)
      ?.practitioner_id ?? null;
  }

  /**
   * Verify a patients.id row exists (used when a practitioner books a
   * follow-up on behalf of a patient they've been treating).
   */
  static async patientExists(
    patientId: string,
  ): Promise<boolean> {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("patients")
      .select("id")
      .eq("id", patientId)
      .maybeSingle();

    if (error) {
      console.error(
        "[AppointmentsRepository] Error checking patient existence:",
        error.message,
      );

      throw new Error(
        "Database error while validating the patient",
      );
    }

    return Boolean(data);
  }

  /* ------------------------------------------------------------------------ */
  /*                         Jitsi video-call methods                          */
  /* ------------------------------------------------------------------------ */

  /**
   * Fetch all database information required to prepare a Jitsi session.
   */
  static async getVideoAppointmentById(
    appointmentId: string,
  ): Promise<AppointmentVideoRow> {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("appointments")
      .select(VIDEO_APPOINTMENT_SELECT)
      .eq("id", appointmentId)
      .maybeSingle();

    if (error) {
      console.error(
        "[AppointmentsRepository] Error fetching video appointment:",
        error.message,
      );

      throw new Error(
        "Database error while fetching the video appointment",
      );
    }

    if (!data) {
      throw new Error("Appointment not found");
    }

    return data as AppointmentVideoRow;
  }

  /**
   * Save the generated Jitsi room only when the appointment does not already
   * have a room.
   *
   * The null condition helps prevent the patient and practitioner from
   * generating different rooms at the same time.
   */
  static async createJitsiRoomIfMissing(
    appointmentId: string,
    generatedRoomName: string,
  ): Promise<AppointmentVideoRow> {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("appointments")
      .update({
        video_provider: "jitsi",
        video_room_name: generatedRoomName,
        video_status: "waiting",
      })
      .eq("id", appointmentId)
      .is("video_room_name", null)
      .select(VIDEO_APPOINTMENT_SELECT)
      .maybeSingle();

    if (error) {
      console.error(
        "[AppointmentsRepository] Error creating Jitsi room:",
        error.message,
      );

      if (
        error.code === "23505" ||
        error.message.toLowerCase().includes("duplicate")
      ) {
        throw new Error(
          "A duplicate Jitsi room name was generated",
        );
      }

      throw new Error(
        "Database error while creating the video room",
      );
    }

    /*
     * Another participant may have created the room between the initial
     * read and this update. Return the room already saved in the database.
     */
    if (!data) {
      const existingAppointment =
        await this.getVideoAppointmentById(appointmentId);

      if (!existingAppointment.video_room_name) {
        throw new Error(
          "Unable to create the video consultation room",
        );
      }

      return existingAppointment;
    }

    return data as AppointmentVideoRow;
  }

  /**
   * Update the Jitsi call status and appointment timing fields.
   */
  static async updateVideoStatus(
    appointmentId: string,
    videoStatus: AppointmentVideoStatus,
  ): Promise<AppointmentVideoRow> {
    const currentAppointment =
      await this.getVideoAppointmentById(appointmentId);

    /*
     * Make repeated Jitsi browser events idempotent.
     */
    if (currentAppointment.video_status === videoStatus) {
      return currentAppointment;
    }

    const now = new Date();

    const updates: {
      video_status: AppointmentVideoStatus;
      session_started_at?: string;
      session_ended_at?: string;
      duration_min?: number | null;
    } = {
      video_status: videoStatus,
    };

    if (
      videoStatus === "in_progress" &&
      !currentAppointment.session_started_at
    ) {
      updates.session_started_at = now.toISOString();
    }

    if (videoStatus === "ended") {
      updates.session_ended_at = now.toISOString();

      if (currentAppointment.session_started_at) {
        const startedAt = new Date(
          currentAppointment.session_started_at,
        );

        if (!Number.isNaN(startedAt.getTime())) {
          updates.duration_min = Math.max(
            1,
            Math.ceil(
              (now.getTime() - startedAt.getTime()) /
              60_000,
            ),
          );
        }
      } else {
        updates.duration_min = null;
      }
    }

    const supabase = await createClient();

    const { data, error } = await supabase
      .from("appointments")
      .update(updates)
      .eq("id", appointmentId)
      .select(VIDEO_APPOINTMENT_SELECT)
      .single();

    if (error) {
      console.error(
        "[AppointmentsRepository] Error updating video status:",
        error.message,
      );

      throw new Error(
        "Database error while updating the video consultation",
      );
    }

    return data as AppointmentVideoRow;
  }

  /**
   * Mark the video room as waiting.
   */
  static async markVideoWaiting(
    appointmentId: string,
  ): Promise<AppointmentVideoRow> {
    return this.updateVideoStatus(
      appointmentId,
      "waiting",
    );
  }

  /**
   * Mark the video consultation as started.
   */
  static async markVideoStarted(
    appointmentId: string,
  ): Promise<AppointmentVideoRow> {
    return this.updateVideoStatus(
      appointmentId,
      "in_progress",
    );
  }

  /**
   * Mark the video consultation as completed.
   */
  static async markVideoEnded(
    appointmentId: string,
  ): Promise<AppointmentVideoRow> {
    return this.updateVideoStatus(
      appointmentId,
      "ended",
    );
  }

  /**
   * Mark the video consultation as cancelled.
   */
  static async markVideoCancelled(
    appointmentId: string,
  ): Promise<AppointmentVideoRow> {
    return this.updateVideoStatus(
      appointmentId,
      "cancelled",
    );
  }
}