import { createClient } from "@/shared/db/supabase.server";

function formatTime(timeStr: string): string {
  if (!timeStr) return "";
  const [h, m] = timeStr.split(":");
  const hours = parseInt(h, 10);
  const period = hours >= 12 ? "PM" : "AM";
  const h12 = hours % 12 || 12;
  return `${h12}:${m} ${period}`;
}

const DETAILED_CONSULTATION_SELECT = `
  id,
  created_at,
  appointment_id,
  practitioners ( id, full_name, specializations, qualifications, hpr_id ),
  emr_notes (
    id,
    chief_complaint,
    history_present,
    assessment,
    objective_findings,
    plan,
    emr_attachments ( id, file_url, file_name, file_type )
  ),
  prescriptions (
    dietary_advice,
    lifestyle_advice,
    followup_date,
    prescription_items ( medicine_name, dose, frequency, anupana, duration_days, special_instructions, classical_type, time_of_intake )
  )
`;

export type SaveCompleteConsultationInput = {
  practitionerId: string;
  patientId: string;
  /** The real booked appointment being consulted, if this consultation is
   * completing an existing queue entry rather than an ad-hoc walk-in note. */
  appointmentId?: string;
  visitReason?: string;
  chiefComplaints?: string[];
  presentIllness?: string;
  diagnosis?: string;
  diseaseStage?: string;
  severity?: string;
  dosha?: string;
  vikriti?: string;
  previousHistory?: string;
  previousCalls?: string;
  paymentMethod?: "cash" | "online";
  vitals: {
    height?: string | number;
    weight?: string | number;
    [key: string]: unknown;
  };
  bloodGroup?: string;
  address?: string;
  medicines?: {
    name: string;
    dose: string;
    frequency?: string;
    duration?: string;
    instructions?: string;
    form?: string;
    timing?: string;
  }[];
  prescriptionNotes?: string;
  /** The doctor explicitly chose "No prescription needed" — advice/notes only, no medicines. */
  noPrescription?: boolean;
  followUpInstructions?: string;
  followUpDate?: string;
  upcomingCallDate?: string;
  upcomingCallTime?: string;
  upcomingCallMode?: "video" | "clinic";
  doctorNotes?: string;
  reportUrls?: string[];
  reportNames?: string[];
};

const CONSULTATION_REPORT_SELECT = `
  id,
  created_at,
  mode,
  appointment_id,
  practitioner_id,
  patients ( full_name, date_of_birth, gender, prakriti, city, user:users(mobile, email, abha:abha_links(abha_id)) ),
  practitioners ( id, full_name, specializations, qualifications, hpr_id, base_video_fee, signature_url ),
  emr_notes ( chief_complaint, history_present, assessment, objective_findings, plan ),
  prescriptions ( dietary_advice, lifestyle_advice, followup_date, prescription_items ( medicine_name, dose, frequency, anupana, duration_days, special_instructions, classical_type, time_of_intake ) )
`;

export class ConsultationRepository {
  static async getPatientIdFromUserId(userId: string): Promise<string | null> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("patients")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("[ConsultationRepository] Error resolving patient_id:", error.message);
      return null;
    }
    return data?.id ?? null;
  }

  static async getPractitionerIdFromUserId(userId: string): Promise<string | null> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("practitioners")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("[ConsultationRepository] Error resolving practitioner_id:", error.message);
      return null;
    }
    return data?.id ?? null;
  }

  // `patientId` is already resolved to the right identity by the caller —
  // either the account owner's own patients.id, or (for a family member)
  // their own patients.id, since family members get real patients rows of
  // their own. No family_member_id filtering needed here.
  static async getDetailedConsultationsForPatient(patientId: string): Promise<any[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("consultations")
      .select(DETAILED_CONSULTATION_SELECT)
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[ConsultationRepository] Error fetching detailed consultations:", error.message);
      throw new Error("Failed to fetch consultations from database");
    }

    return data ?? [];
  }

  /** Completed consultations and prescriptions across a set of patients (account owner + family). */
  static async getRecordCountsForPatients(patientIds: string[]): Promise<{ consultations: number; prescriptions: number }> {
    if (patientIds.length === 0) return { consultations: 0, prescriptions: 0 };
    const supabase = await createClient();
    const [consultations, prescriptions] = await Promise.all([
      supabase.from("consultations").select("id", { count: "exact", head: true }).in("patient_id", patientIds),
      supabase.from("prescriptions").select("id", { count: "exact", head: true }).in("patient_id", patientIds),
    ]);

    if (consultations.error || prescriptions.error) {
      console.error(
        "[ConsultationRepository] Error counting patient records:",
        consultations.error?.message || prescriptions.error?.message,
      );
    }
    return { consultations: consultations.count ?? 0, prescriptions: prescriptions.count ?? 0 };
  }

  /**
   * For a family member's patients.id: the account owner's email and name
   * (family members have no login/email of their own). Null otherwise.
   */
  static async getFamilyOwnerEmailRecipient(patientId: string): Promise<{ email: string; name: string } | null> {
    const supabase = await createClient();
    const { data: familyRow } = await supabase
      .from("family_members")
      .select("owner_patient_id")
      .eq("patient_id", patientId)
      .limit(1)
      .maybeSingle();
    if (!familyRow?.owner_patient_id) return null;

    const { data: owner } = await supabase
      .from("patients")
      .select("full_name, user:users ( email )")
      .eq("id", familyRow.owner_patient_id)
      .maybeSingle();
    const ownerUser: any = owner ? (Array.isArray(owner.user) ? owner.user[0] : owner.user) : null;
    if (!ownerUser?.email) return null;
    return { email: ownerUser.email, name: owner?.full_name || "Patient" };
  }

  static async getConsultationOwner(consultationId: string): Promise<{ patient_id: string; practitioner_id: string } | null> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("consultations")
      .select("patient_id, practitioner_id")
      .eq("id", consultationId)
      .maybeSingle();

    if (error) {
      console.error("[ConsultationRepository] Error fetching consultation owner:", error.message);
      return null;
    }
    return data;
  }

  static async getConsultationReportData(consultationId: string): Promise<any | null> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("consultations")
      .select(CONSULTATION_REPORT_SELECT)
      .eq("id", consultationId)
      .single();

    if (error) {
      console.error("[ConsultationRepository] Error fetching consultation report:", error.message);
      return null;
    }
    return data;
  }

  /** Accepts either a user_id or the row's own id directly, falling back to the raw input. */
  static async resolvePractitionerId(id: string): Promise<string> {
    const supabase = await createClient();
    const { data } = await supabase.from("practitioners").select("id").eq("user_id", id).maybeSingle();
    return data?.id ?? id;
  }

  /** Accepts either a user_id or the row's own id directly, falling back to the raw input. */
  static async resolvePatientId(id: string): Promise<string> {
    const supabase = await createClient();
    const { data } = await supabase.from("patients").select("id").eq("user_id", id).maybeSingle();
    return data?.id ?? id;
  }

  static async saveCompleteConsultation(payload: SaveCompleteConsultationInput): Promise<{ consultationId: string; prescriptionId: string; patientId: string }> {
    const supabase = await createClient();
    const practId = await this.resolvePractitionerId(payload.practitionerId);
    const patId = await this.resolvePatientId(payload.patientId);

    // 1 & 2. Resolve the appointment being consulted.
    // If this consultation is completing a real booked appointment (the doctor
    // clicked "Consult" from their queue), reuse it and mark it completed so
    // its original scheduled date/time is preserved everywhere it's displayed
    // — instead of fabricating a brand-new appointment at a mock time.
    // Saving the consultation is the only step that completes an appointment:
    // an in-session / awaiting-notes one moves to completed here.
    let apt: { id: string } | null = null;

    if (payload.appointmentId) {
      const { data: existingAppt, error: fetchErr } = await supabase
        .from("appointments")
        .select("id, session_started_at, session_ended_at")
        .eq("id", payload.appointmentId)
        .eq("practitioner_id", practId)
        .eq("patient_id", patId)
        .maybeSingle();

      if (fetchErr) {
        console.error("[ConsultationRepository] Error looking up existing appointment:", fetchErr.message);
      }

      if (existingAppt) {
        const { error: updateErr } = await supabase
          .from("appointments")
          .update({
            status: "completed",
            // In-clinic consults have no call to end — close the session here.
            session_ended_at: existingAppt.session_started_at
              ? existingAppt.session_ended_at ?? new Date().toISOString()
              : existingAppt.session_ended_at,
          })
          .eq("id", existingAppt.id);

        if (updateErr) throw new Error("Appointment update failed: " + updateErr.message);
        apt = existingAppt;
      }
    }

    if (!apt) {
      // Fallback for ad-hoc records with no real booked appointment (e.g. walk-ins):
      // synthesize a same-day slot + appointment to satisfy foreign keys.
      const { data: slot, error: slotErr } = await supabase
        .from("slots")
        .insert({
          practitioner_id: practId,
          mode: "video",
          slot_date: new Date().toISOString().split("T")[0],
          start_time: "10:00:00",
          end_time: "10:30:00",
          fee: 0,
          status: "completed",
        })
        .select("id")
        .single();

      if (slotErr) throw new Error("Slot insertion failed: " + slotErr.message);

      const { data: newAppt, error: aptErr } = await supabase
        .from("appointments")
        .insert({
          slot_id: slot.id,
          practitioner_id: practId,
          patient_id: patId,
          mode: "video",
          status: "completed",
          scheduled_date: new Date().toISOString().split("T")[0],
          scheduled_time: "10:00:00",
        })
        .select("id")
        .single();

      if (aptErr) throw new Error("Appointment insertion failed: " + aptErr.message);
      apt = newAppt;
    }

    // 3. Create consultation
    const { data: consult, error: consultErr } = await supabase
      .from("consultations")
      .insert({
        appointment_id: apt.id,
        practitioner_id: practId,
        patient_id: patId,
        mode: "video",
        is_complete: true,
      })
      .select("id")
      .single();

    if (consultErr) throw new Error("Consultation insertion failed: " + consultErr.message);

    // 4. Create emr_notes
    const { data: emrData, error: emrErr } = await supabase
      .from("emr_notes")
      .insert({
        consultation_id: consult.id,
        practitioner_id: practId,
        patient_id: patId,
        chief_complaint: JSON.stringify(payload.chiefComplaints || []),
        history_present: payload.presentIllness || "",
        assessment: JSON.stringify({
          diagnosis: payload.diagnosis,
          diseaseStage: payload.diseaseStage,
          severity: payload.severity,
          dosha: payload.dosha,
          vikriti: payload.vikriti,
          visitReason: payload.visitReason,
          previousHistory: payload.previousHistory,
          previousCalls: payload.previousCalls,
          paymentMethod: payload.paymentMethod,
        }),
        objective_findings: JSON.stringify({
          vitals: payload.vitals,
        }),
        plan: payload.followUpInstructions || payload.doctorNotes || "",
      })
      .select("id")
      .single();

    if (emrErr) throw new Error("EMR notes insertion failed: " + emrErr.message);

    // 4.5 Insert EMR attachments if any reports were uploaded
    if (payload.reportUrls && payload.reportUrls.length > 0 && emrData) {
      const { data: practUser } = await supabase
        .from("practitioners")
        .select("user_id")
        .eq("id", practId)
        .single();

      const uploaderUserId = practUser?.user_id || payload.practitionerId || "00000000-0000-0000-0000-000000000001";

      const attachments = payload.reportUrls.map((url: string, idx: number) => ({
        emr_note_id: emrData.id,
        file_url: url,
        file_name: payload.reportNames?.[idx] || "Report",
        file_type: url.split(".").pop() || "pdf",
        uploaded_by: uploaderUserId,
      }));

      const { error: attachErr } = await supabase.from("emr_attachments").insert(attachments);

      if (attachErr) {
        console.error("[ConsultationRepository] EMR attachments insertion error:", attachErr.message);
      }
    }

    // Update patient's profile details (height, weight, blood group, address)
    const heightVal = parseInt(String(payload.vitals.height)) || null;
    const weightVal = parseFloat(String(payload.vitals.weight)) || null;
    const bloodGroupVal = payload.bloodGroup || null;
    const addressVal = payload.address || null;

    await supabase
      .from("patients")
      .update({
        height: heightVal,
        weight: weightVal,
        blood_group: bloodGroupVal,
        address: addressVal,
      })
      .eq("id", patId);

    const { data: patRow } = await supabase
      .from("patients")
      .select("user_id")
      .eq("id", patId)
      .single();

    if (patRow?.user_id) {
      await supabase
        .from("patient_profiles")
        .update({
          height: heightVal,
          weight: weightVal,
          blood_group: bloodGroupVal,
          address: addressVal,
        })
        .eq("user_id", patRow.user_id);
    } else {
      // Family members have no `user_id`/`patient_profiles` row — the doctor's
      // save is the only place their height/weight/blood group ever get
      // recorded, so mirror it onto their family_members row too.
      await supabase
        .from("family_members")
        .update({
          height: heightVal,
          weight: weightVal,
          blood_group: bloodGroupVal,
        })
        .eq("patient_id", patId);
    }

    // 5. Create prescription
    const { data: rx, error: rxErr } = await supabase
      .from("prescriptions")
      .insert({
        consultation_id: consult.id,
        practitioner_id: practId,
        patient_id: patId,
        status: "finalized",
        dietary_advice: payload.prescriptionNotes || "",
        lifestyle_advice: payload.followUpInstructions || "",
        followup_date: payload.followUpDate ? new Date(payload.followUpDate).toISOString().split("T")[0] : null,
      })
      .select("id")
      .single();

    if (rxErr) throw new Error("Prescription insertion failed: " + rxErr.message);

    // 6. Create prescription items (none when the doctor chose "No prescription needed")
    if (!payload.noPrescription && payload.medicines && payload.medicines.length > 0) {
      const itemsToInsert = payload.medicines
        .map((m, idx: number) => ({
          prescription_id: rx.id,
          medicine_name: m.name,
          dose: m.dose,
          frequency: m.frequency || "",
          anupana: null,
          duration_days: parseInt(String(m.duration)) || 0,
          special_instructions: m.instructions,
          sort_order: idx,
          classical_type: m.form,
          time_of_intake: m.timing,
        }))
        .filter((m) => m.medicine_name);

      if (itemsToInsert.length > 0) {
        const { error: itemsErr } = await supabase.from("prescription_items").insert(itemsToInsert);
        if (itemsErr) throw new Error("Prescription items failed: " + itemsErr.message);
      }
    }

    // 7. Handle future slot and notifications
    if (payload.upcomingCallDate && payload.upcomingCallTime) {
      // Parse upcomingCallTime which might be "11:05 AM"
      const match = payload.upcomingCallTime.match(/(\d+):(\d+)\s*(am|pm)?/i);
      if (match) {
        let hour = parseInt(match[1], 10);
        const min = parseInt(match[2], 10);
        const mod = match[3]?.toLowerCase();
        if (mod === 'pm' && hour < 12) hour += 12;
        if (mod === 'am' && hour === 12) hour = 0;

        const endHourVal = hour + (min + 30 >= 60 ? 1 : 0);
        const endMinVal = (min + 30) % 60;

        const hourStr = String(hour).padStart(2, '0');
        const minStr = String(min).padStart(2, '0');
        const endHourStr = String(endHourVal).padStart(2, '0');
        const endMinStr = String(endMinVal).padStart(2, '0');
        const scheduledTime = `${hourStr}:${minStr}:00`;

        // Guard against duplicate bookings: skip if this doctor already has a
        // non-cancelled appointment at this exact date/time (e.g. the consultation
        // was saved more than once with the same upcoming call selected).
        const { data: existingAppt } = await supabase
          .from("appointments")
          .select("id")
          .eq("practitioner_id", practId)
          .eq("scheduled_date", payload.upcomingCallDate)
          .eq("scheduled_time", scheduledTime)
          .neq("status", "cancelled")
          .maybeSingle();

        if (!existingAppt) {
          const { data: futureSlot, error: futureSlotErr } = await supabase
            .from("slots")
            .insert({
              practitioner_id: practId,
              mode: payload.upcomingCallMode || "video",
              slot_date: payload.upcomingCallDate,
              start_time: scheduledTime,
              end_time: `${endHourStr}:${endMinStr}:00`,
              fee: 0,
              status: "booked", // prevent others from booking
            })
            .select("id")
            .single();

          if (!futureSlotErr && futureSlot) {
            const { data: futureAppt, error: futureApptErr } = await supabase
              .from("appointments")
              .insert({
                slot_id: futureSlot.id,
                practitioner_id: practId,
                doctor_profile_id: practId,
                patient_id: patId,
                mode: payload.upcomingCallMode || "video",
                status: "scheduled",
                scheduled_date: payload.upcomingCallDate,
                scheduled_time: scheduledTime,
              })
              .select("id")
              .single();

            if (!futureApptErr && futureAppt) {
              // Appointments are successfully created.
              // Notifications are handled by the frontend injecting them based on prescriptions text prefix.
            }
          }
        }
      }
    }

    return { consultationId: consult.id, prescriptionId: rx.id, patientId: patId };
  }

  static async getUpcomingCallsForPatient(patientId: string): Promise<any[]> {
    const resolvedId = await this.resolvePatientId(patientId);
    return this.getUpcomingCallsFromPrescriptions("patient_id", resolvedId);
  }

  static async getUpcomingCallsForPractitioner(practitionerId: string): Promise<any[]> {
    const resolvedId = await this.resolvePractitionerId(practitionerId);
    return this.getUpcomingCallsFromPrescriptions("practitioner_id", resolvedId);
  }

  private static async getUpcomingCallsFromPrescriptions(idField: "patient_id" | "practitioner_id", id: string): Promise<any[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("prescriptions")
      .select(`
        id, created_at, lifestyle_advice,
        patient:patients ( id, full_name, user:users ( mobile ) ),
        practitioner:practitioners ( id, full_name )
      `)
      .eq(idField, id)
      .like("lifestyle_advice", "%[Upcoming Session Fixed:%")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[ConsultationRepository] Error fetching upcoming calls:", error.message);
      throw new Error("Failed to fetch upcoming calls from database");
    }

    // Family members have no `users` row (no login), so their phone lives on
    // family_members instead — look it up by patient_id, same as elsewhere.
    const patientIds = Array.from(new Set((data ?? []).map((r: any) => r.patient?.id).filter(Boolean)));
    const phoneByPatientId: Record<string, string> = {};
    if (patientIds.length > 0) {
      const { data: familyMembers } = await supabase
        .from("family_members")
        .select("patient_id, phone")
        .in("patient_id", patientIds);
      for (const fm of familyMembers ?? []) {
        if (fm.patient_id && fm.phone) phoneByPatientId[fm.patient_id] = fm.phone;
      }
    }

    const get24H = (t: string) => {
      const match = t.match(/(\d+):(\d+)\s*(am|pm)?/i);
      if (!match) return "00:00:00";
      let h = parseInt(match[1]);
      const m = match[2];
      const mod = match[3]?.toLowerCase();
      if (mod === 'pm' && h < 12) h += 12;
      if (mod === 'am' && h === 12) h = 0;
      return `${h.toString().padStart(2, '0')}:${m}:00`;
    };

    const upcomingCalls: any[] = [];

    (data || []).forEach((rx: any) => {
      const match = rx.lifestyle_advice?.match(/\[Upcoming Session Fixed: (.*?) at (.*?)\]/);
      if (match) {
        const date = match[1];
        const time = match[2];
        const sessionTime = new Date(`${date}T${get24H(time)}`).getTime();
        // A fixed session with no parseable date should still surface (better to
        // show it than silently drop it), but once its scheduled time has
        // actually passed it's stale and must not keep appearing as "upcoming".
        if (!isNaN(sessionTime) && sessionTime < Date.now()) return;

        upcomingCalls.push({
          id: rx.id,
          createdAt: rx.created_at,
          date,
          time,
          patientId: rx.patient?.id,
          patientName: rx.patient?.full_name || "Unknown",
          patientPhone: (rx.patient?.id && phoneByPatientId[rx.patient.id]) || rx.patient?.user?.mobile || "",
          practitionerId: rx.practitioner?.id,
          practitionerName: rx.practitioner?.full_name || "Unknown",
        });
      }
    });

    return upcomingCalls
      .sort((a, b) => {
        const dateA = new Date(`${a.date}T${get24H(a.time)}`).getTime();
        const dateB = new Date(`${b.date}T${get24H(b.time)}`).getTime();
        return (isNaN(dateA) ? 0 : dateA) - (isNaN(dateB) ? 0 : dateB);
      })
      .map((call) => {
        let displayTime = call.time;
        if (!displayTime.toLowerCase().includes("am") && !displayTime.toLowerCase().includes("pm")) {
          const match = displayTime.match(/(\d+):(\d+)/);
          if (match) {
            let h = parseInt(match[1]);
            const m = match[2];
            const mod = h >= 12 ? 'PM' : 'AM';
            h = h % 12 || 12;
            displayTime = `${h}:${m} ${mod}`;
          }
        }

        let displayDate = call.date;
        try {
          const d = new Date(call.date);
          if (!isNaN(d.getTime())) {
            displayDate = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
          }
        } catch (e) { }

        return {
          ...call,
          date: displayDate, // Formatted e.g., 28 Jul 2026
          rawDate: call.date, // Original YYYY-MM-DD
          time: displayTime,
          isoDateTime: `${call.date}T${get24H(call.time)}`
        };
      });
  }

  static async getPatientIntakeDetails(id: string, appointmentId?: string | null): Promise<any> {
    const supabase = await createClient();

    let cleanId = id;
    if (id === "p1") cleanId = "c0000000-0000-0000-0000-000000000001";
    else if (id === "p2") cleanId = "c0000000-0000-0000-0000-000000000002";
    else if (id === "p3") cleanId = "c0000000-0000-0000-0000-000000000003";
    else if (id === "p4") cleanId = "c0000000-0000-0000-0000-000000000004";

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(cleanId)) {
      throw new Error("Invalid UUID");
    }

    // 1. Fetch Patient
    const { data: dbPat, error: patError } = await supabase
      .from("patients")
      .select(`
        id,
        full_name,
        date_of_birth,
        gender,
        user_id,
        height,
        weight,
        blood_group,
        address,
        user:users (
          mobile,
          email
        )
      `)
      .eq("id", cleanId)
      .single();

    if (patError || !dbPat) {
      throw new Error("Error fetching patient");
    }

    // Fetch from patient_profiles if exists
    const { data: dbProfile } = await supabase
      .from("patient_profiles")
      .select("address, phone, height, weight, blood_group")
      .eq("user_id", dbPat.user_id)
      .maybeSingle();

    // 2. Fetch ABHA link
    const { data: dbAbha } = await supabase
      .from("abha_links")
      .select("abha_id, abha_address")
      .eq("user_id", dbPat.user_id)
      .maybeSingle();

    // 3. Fetch today's appointment or latest appointment for today's details
    const today = new Date().toISOString().split("T")[0];
    const { data: dbAppts } = await supabase
      .from("appointments")
      .select(`
        id,
        mode,
        scheduled_date,
        scheduled_time,
        reason_for_visit,
        status
      `)
      .eq("patient_id", cleanId)
      .order("scheduled_date", { ascending: false })
      .order("scheduled_time", { ascending: false });

    const todayAppt = (appointmentId && dbAppts?.find((a: any) => a.id === appointmentId))
      || dbAppts?.find((a: any) => a.scheduled_date === today)
      || dbAppts?.[0];

    // A family member has no `users` row of their own (they never sign in),
    // so their contact number and declared relationship live on
    // `family_members` instead — everything else (name, dob, gender, height,
    // weight, blood group) is kept in sync on their own `patients` row by
    // family.repo.ts, so it's read the same way as a self-registered patient.
    const { data: familyMember } = await supabase
      .from("family_members")
      .select("relationship, phone")
      .eq("patient_id", cleanId)
      .maybeSingle();

    const dob = dbPat.date_of_birth;
    let age = 0;
    if (dob) {
      const birthDate = new Date(dob);
      age = new Date().getFullYear() - birthDate.getFullYear();
    }

    const genderRaw = dbPat.gender;

    const patient = {
      name: dbPat.full_name || "Unknown",
      relationship: familyMember?.relationship || null,
      age,
      gender: genderRaw ? genderRaw.charAt(0).toUpperCase() + genderRaw.slice(1) : "Unknown",
      phone: familyMember?.phone || dbProfile?.phone || (Array.isArray(dbPat.user) ? dbPat.user[0]?.mobile : (dbPat.user as any)?.mobile) || "",
      abha: dbAbha ? `${dbAbha.abha_id} (${dbAbha.abha_address || ""})` : null,
      reason: todayAppt?.reason_for_visit || "Routine check-up",
      mode: (todayAppt?.mode === "video" ? "video" : "clinic") as "video" | "clinic",
      time: todayAppt ? formatTime(todayAppt.scheduled_time) : "N/A",
      symptoms: todayAppt?.reason_for_visit ? [todayAppt.reason_for_visit] : [],
      duration: todayAppt ? "Scheduled" : "N/A",
      height: dbProfile?.height || dbPat.height || null,
      weight: dbProfile?.weight || dbPat.weight || null,
      bloodGroup: dbProfile?.blood_group || dbPat.blood_group || "",
      address: dbProfile?.address || dbPat.address || "Bangalore, India",
    };

    // 4. Fetch Consultations, EMR Notes, and Prescriptions
    const { data: dbConsults } = await supabase
      .from("consultations")
      .select(`
        id,
        mode,
        created_at,
        appointment:appointments (
          id,
          scheduled_date,
          scheduled_time
        ),
        practitioner:practitioners (
          id,
          full_name,
          qualifications,
          specializations
        ),
        emr_note:emr_notes (
          id,
          chief_complaint,
          history_present,
          past_medical_hx,
          family_history,
          allergies,
          current_medications,
          objective_findings,
          assessment,
          plan,
          emr_attachments (
            id,
            file_url,
            file_name,
            file_type
          )
        ),
        prescriptions (
          id,
          dietary_advice,
          lifestyle_advice,
          physical_activity,
          followup_date,
          prescription_items (
            id,
            medicine_name,
            dose,
            frequency,
            duration_days,
            anupana,
            special_instructions,
            classical_type,
            time_of_intake
          )
        )
      `)
      .eq("patient_id", cleanId)
      .order("created_at", { ascending: false });

    let visits: any[] = [];
    let vitalsHistory: any[] = [];
    const medHistory: any = {
      allergies: [], medications: [], pmh: [], surgeries: [], family: [],
      social: { occupation: "", marital: "", tobacco: "", alcohol: "", diet: "", exercise: "" },
      immunizations: [],
    };
    let careTeam: any[] = [];

    if (dbConsults && dbConsults.length > 0) {
      visits = dbConsults.map((c: any) => {
        const dateStr = c.appointment?.scheduled_date
          ? new Date(c.appointment.scheduled_date).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })
          : new Date(c.created_at).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });

        const timeStr = c.appointment?.scheduled_time ? formatTime(c.appointment.scheduled_time) : "N/A";

        const medications = c.prescriptions?.[0]?.prescription_items?.map((item: any) => ({
          id: item.id,
          name: item.medicine_name,
          form: item.classical_type || "Tablet",
          dose: item.dose,
          timing: item.anupana || item.time_of_intake || "After Food",
          duration: item.duration_days ? `${item.duration_days} Days` : "",
          instructions: item.special_instructions || "",
        })) || [];

        // Parse SOAP
        const emr = c.emr_note || {};
        const soap = {
          S: emr.history_present || "No subjective notes",
          O: emr.objective_findings || "No objective notes",
          A: emr.assessment || "No assessment notes",
          P: emr.plan || "No plan notes",
        };

        // Parse assessment JSON for specific fields
        let parsedAssessment = {
          diagnosis: "",
          diseaseStage: "",
          severity: "",
          dosha: "",
          vikriti: "",
          visitReason: "",
          previousHistory: "",
          previousCalls: "",
        };
        if (emr.assessment) {
          try {
            if (emr.assessment.trim().startsWith("{")) {
              parsedAssessment = JSON.parse(emr.assessment);
            } else {
              parsedAssessment.diagnosis = emr.assessment;
            }
          } catch {
            parsedAssessment.diagnosis = emr.assessment;
          }
        }

        // Parse chief complaint JSON array
        let chiefComplaintsArray: string[] = [];
        if (emr.chief_complaint) {
          try {
            if (emr.chief_complaint.trim().startsWith("[")) {
              chiefComplaintsArray = JSON.parse(emr.chief_complaint);
            } else {
              chiefComplaintsArray = [emr.chief_complaint];
            }
          } catch {
            chiefComplaintsArray = [emr.chief_complaint];
          }
        }

        // Parse vitals if they are inside objective findings as text/json
        let vitals = null;
        if (emr.objective_findings) {
          try {
            if (emr.objective_findings.trim().startsWith("{")) {
              const parsed = JSON.parse(emr.objective_findings);
              const vData = parsed.vitals || parsed;
              if (vData.bpSys || vData.pulse || vData.weight || vData.height) {
                vitals = {
                  bpSys: vData.bpSys || "",
                  bpDia: vData.bpDia || "",
                  pulse: vData.pulse || "",
                  temp: vData.temp || "",
                  spo2: vData.spo2 || "",
                  rr: vData.rr || "",
                  weight: vData.weight || "",
                  height: vData.height || "",
                };
              }
            }
          } catch {
            // Malformed objective_findings JSON - leave vitals as null
          }
        }

        const docName = c.practitioner?.full_name || "Unknown Practitioner";
        const initials = docName.split(" ").filter((w: string) => w).map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();

        return {
          id: c.id,
          date: dateStr,
          time: timeStr,
          duration: "20 min",
          mode: c.mode || "clinic",
          doctor: docName,
          specialty: c.practitioner?.specializations?.[0] || "Ayurveda",
          doctorInitials: initials,
          isYou: false,
          chiefComplaints: chiefComplaintsArray,
          chiefComplaint: chiefComplaintsArray.join(", ") || "Routine consultation",
          soap,
          visitReason: parsedAssessment.visitReason || "",
          previousHistory: parsedAssessment.previousHistory || "",
          previousCalls: parsedAssessment.previousCalls || "",
          diagnosis: parsedAssessment.diagnosis || "Routine check-up",
          vitals,
          medications,
          investigations: [],
          referrals: [],
          followUpDate: c.prescriptions?.[0]?.followup_date || null,
          followUpInstructions: c.prescriptions?.[0]?.lifestyle_advice || "",
          type: "initial" as const,
          attachments: emr.emr_attachments || [],
        };
      });

      const vitalsList = visits
        .filter((v) => v.vitals)
        .map((v) => ({
          date: v.date,
          doctor: v.doctor,
          doctorInitials: v.doctorInitials,
          isYou: v.isYou,
          ...v.vitals!,
        }));

      if (vitalsList.length > 0) {
        vitalsHistory = vitalsList;
      }

      const activeMeds = visits.flatMap((v) =>
        v.medications.map((m: any) => {
          const sysVal = m.system;
          const system = ["Ayurveda", "Naturopathy", "Siddha", "Homeopathy", "Allopathic", "OTC"].includes(sysVal) ? sysVal : "Ayurveda";
          return {
            name: m.name,
            dose: m.dose,
            frequency: m.frequency,
            system,
            prescribedBy: v.doctor,
            since: v.date,
            active: true,
          };
        })
      );

      if (activeMeds.length > 0) {
        medHistory.medications = activeMeds;
      }

      careTeam = Array.from(new Set(visits.map((v) => v.doctor))).map((name) => {
        const visit = visits.find((v) => v.doctor === name)!;
        return {
          id: visit.id,
          name,
          initials: visit.doctorInitials,
          specialty: visit.specialty,
          qualification: "Registered Practitioner",
          hprId: "HPR-VERIFIED",
          since: visits[visits.length - 1].date,
          lastVisit: visit.date,
          nextFollowUp: visit.followUpDate || "N/A",
          totalRx: visit.medications.length,
          isYou: visit.isYou,
        };
      });
    }

    return { patient, visits, vitalsHistory, medHistory, careTeam };
  }
}