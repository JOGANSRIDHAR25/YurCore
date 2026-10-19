import "server-only";

import { createClient } from "@/shared/db/supabase.server";
import {
  MISSABLE_APPOINTMENT_STATUSES,
  isArrivedClinicPatient,
  isMissableStatus,
  resolveMissedBy,
  type ClinicCloseReason,
  type MissedBy,
} from "@/shared/appointments/attendance";
import { EmailService } from "../service/email.service";

/** The appointment fields needed to decide (and record) a missed slot. */
export type MissableAppointment = {
  id: string;
  status: string;
  mode: string | null;
  patient_id: string | null;
  practitioner_id: string | null;
  scheduled_date: string;
  scheduled_time: string;
  patient_joined_at: string | null;
  practitioner_joined_at: string | null;
};

/** Columns to select wherever a MissableAppointment is read. */
export const MISSABLE_APPOINTMENT_COLUMNS =
  "id, status, mode, patient_id, practitioner_id, scheduled_date, scheduled_time, patient_joined_at, practitioner_joined_at";

function formatTime(timeStr: string): string {
  if (!timeStr) return "";
  const [h, m] = timeStr.split(":");
  const hours = parseInt(h, 10);
  const period = hours >= 12 ? "PM" : "AM";
  const h12 = hours % 12 || 12;
  return `${h12}:${m} ${period}`;
}

function missedNotificationBody(
  missedBy: MissedBy,
  practitionerName: string,
  date: string,
  time: string,
  familyMemberName?: string,
  patientLeft = false,
): string {
  const rebook = "You can book another appointment if you would like to continue your consultation.";
  const whose = familyMemberName ? `your family member ${familyMemberName}'s appointment` : "your appointment";
  const Whose = whose.charAt(0).toUpperCase() + whose.slice(1);
  if (patientLeft) {
    const who = familyMemberName ? "they" : "you";
    return `${Whose} with ${practitionerName} on ${date} at ${time} was closed because ${who} left before the consultation. ${rebook}`;
  }
  if (missedBy === "practitioner") {
    return `${practitionerName} was not available for ${whose} on ${date} at ${time}. We're sorry for the inconvenience. ${rebook}`;
  }
  if (missedBy === "both") {
    return `${Whose} with ${practitionerName} on ${date} at ${time} ended without the consultation taking place. ${rebook}`;
  }
  return `${Whose} with ${practitionerName} on ${date} at ${time} was missed. ${rebook}`;
}

type MissedNoticeRecipient = {
  userId: string;
  email?: string;
  name: string;
  /** Set when the appointment was for a family member and the notice goes to the account owner. */
  familyMemberName?: string;
};

type PatientRowWithUser = {
  user_id: string | null;
  full_name: string | null;
  user: { email?: string } | { email?: string }[] | null;
};

function emailOf(row: PatientRowWithUser | null | undefined): string | undefined {
  const user = Array.isArray(row?.user) ? row?.user[0] : row?.user;
  return user?.email;
}

export class AppointmentAttendanceRepository {
  /**
   * Flip a slot whose grace window has passed to missed ("no_show" in the DB
   * enum), recording who didn't show up, then notify the patient in-app and
   * by email. The caller decides the cutoff has passed; this only guards that
   * the appointment is still missable — never one already in session.
   *
   * The update is conditional on the status just read, so when the doctor's
   * queue and the patient's sweep race, exactly one wins and notifies.
   * Returns who missed it, or null when nothing changed.
   */
  static async markMissed(appt: MissableAppointment): Promise<MissedBy | null> {
    if (!isMissableStatus(appt.status)) return null;

    const supabase = createClient();
    const missedBy = resolveMissedBy({
      mode: appt.mode,
      patientJoinedAt: appt.patient_joined_at,
      practitionerJoinedAt: appt.practitioner_joined_at,
    });

    const { data: updated, error: updateError } = await supabase
      .from("appointments")
      .update({ status: "no_show", missed_by: missedBy, noshow_marked_at: new Date().toISOString() })
      .eq("id", appt.id)
      .eq("status", appt.status)
      .select("id");

    if (updateError) {
      console.error("[AppointmentAttendanceRepository] Error marking appointment missed:", updateError.message);
      return null;
    }
    if (!updated || updated.length === 0) return null;

    appt.status = "no_show";
    await this.notifyPatientOfMissed(appt, missedBy);
    return missedBy;
  }

  /**
   * Who should hear about a missed appointment: the patient themself, or —
   * for a family member, who has no login of their own — the account owner
   * who booked it on their behalf.
   */
  private static async resolveMissedNoticeRecipient(patientId: string): Promise<MissedNoticeRecipient | null> {
    const supabase = createClient();
    const { data: patientRow } = await supabase
      .from("patients")
      .select("user_id, full_name, user:users ( email )")
      .eq("id", patientId)
      .maybeSingle<PatientRowWithUser>();

    if (patientRow?.user_id) {
      return { userId: patientRow.user_id, email: emailOf(patientRow), name: patientRow.full_name || "Patient" };
    }

    const { data: familyRow } = await supabase
      .from("family_members")
      .select("full_name, owner_patient_id")
      .eq("patient_id", patientId)
      .limit(1)
      .maybeSingle();
    if (!familyRow?.owner_patient_id) return null;

    const { data: ownerRow } = await supabase
      .from("patients")
      .select("user_id, full_name, user:users ( email )")
      .eq("id", familyRow.owner_patient_id)
      .maybeSingle<PatientRowWithUser>();
    if (!ownerRow?.user_id) return null;

    return {
      userId: ownerRow.user_id,
      email: emailOf(ownerRow),
      name: ownerRow.full_name || "Patient",
      familyMemberName: familyRow.full_name || patientRow?.full_name || "your family member",
    };
  }

  private static async notifyPatientOfMissed(
    appt: MissableAppointment,
    missedBy: MissedBy,
    patientLeft = false,
  ): Promise<void> {
    if (!appt.patient_id) return;
    const supabase = createClient();

    const [recipient, { data: practitionerRow }] = await Promise.all([
      this.resolveMissedNoticeRecipient(appt.patient_id),
      appt.practitioner_id
        ? supabase.from("practitioners").select("full_name, user:users!practitioners_user_id_fkey ( email )").eq("id", appt.practitioner_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    if (!recipient) {
      console.warn("[AppointmentAttendanceRepository] No recipient found for missed-appointment notice:", appt.id);
      return;
    }

    const practitionerName = (practitionerRow as { full_name?: string } | null)?.full_name || "your practitioner";
    const practitionerUser = (practitionerRow as { user?: { email?: string } | { email?: string }[] | null } | null)?.user;
    const practitionerEmail = Array.isArray(practitionerUser) ? practitionerUser[0]?.email : practitionerUser?.email;
    const formattedDate = new Date(`${appt.scheduled_date}T00:00:00`).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    const apptTime = formatTime(appt.scheduled_time);

    const { error: notifError } = await supabase.from("notifications").insert({
      user_id: recipient.userId,
      channel: "in_app",
      title: patientLeft ? "Appointment Closed" : "Appointment Missed",
      body: missedNotificationBody(missedBy, practitionerName, formattedDate, apptTime, recipient.familyMemberName, patientLeft),
      reference_id: appt.id,
      reference_type: "appointment",
      is_read: false,
    });

    if (notifError) {
      console.error("[AppointmentAttendanceRepository] Error inserting missed appointment notification:", notifError.message);
    }

    // Emails to both sides run in parallel and never fail the status change.
    await Promise.all([
      recipient.email
        ? EmailService.sendAppointmentMissed(recipient.email, {
            patientName: recipient.name,
            practitionerName,
            date: formattedDate,
            time: apptTime,
            missedBy,
            familyMemberName: recipient.familyMemberName,
            patientLeft,
          })
        : Promise.resolve(
            console.warn("[AppointmentAttendanceRepository] Patient has no email for missed-appointment notice:", appt.id),
          ),
      practitionerEmail
        ? EmailService.sendAppointmentMissedToPractitioner(practitionerEmail, {
            practitionerName: practitionerName.replace(/^Dr\.?\s*/i, ""),
            patientName: recipient.familyMemberName || recipient.name,
            date: formattedDate,
            time: apptTime,
            mode: appt.mode,
            missedBy,
            patientLeft,
          })
        : Promise.resolve(),
    ]);
  }

  /**
   * Record that one side has arrived for a video consultation (opened the
   * waiting room / call). The first arrival moves the slot to checked_in;
   * once both sides have arrived it becomes in_session, after which it can
   * no longer be marked missed. Safe to call on every poll — it only writes
   * when something changes, and re-checks the "both arrived" promotion each
   * time so two simultaneous first arrivals still end up in_session.
   */
  static async recordVideoArrival(appointmentId: string, side: "patient" | "practitioner"): Promise<void> {
    const supabase = createClient();
    const { data: appt, error } = await supabase
      .from("appointments")
      .select("id, status, patient_joined_at, practitioner_joined_at, checked_in_at, session_started_at")
      .eq("id", appointmentId)
      .maybeSingle();

    if (error || !appt) {
      if (error) console.error("[AppointmentAttendanceRepository] Error reading attendance:", error.message);
      return;
    }
    if (!isMissableStatus(appt.status)) return;

    const now = new Date().toISOString();
    const joinedColumn = side === "patient" ? "patient_joined_at" : "practitioner_joined_at";
    const patientJoinedAt = side === "patient" ? appt.patient_joined_at ?? now : appt.patient_joined_at;
    const practitionerJoinedAt = side === "practitioner" ? appt.practitioner_joined_at ?? now : appt.practitioner_joined_at;
    const bothArrived = Boolean(patientJoinedAt && practitionerJoinedAt);

    const updates: Record<string, string> = {};
    if (!appt[joinedColumn]) updates[joinedColumn] = now;
    if (!appt.checked_in_at) updates.checked_in_at = now;
    if (bothArrived) {
      updates.status = "in_session";
      if (!appt.session_started_at) updates.session_started_at = now;
    } else if (appt.status !== "checked_in") {
      updates.status = "checked_in";
    }

    if (Object.keys(updates).length === 0) return;

    const { error: updateError } = await supabase
      .from("appointments")
      .update(updates)
      .eq("id", appointmentId)
      .eq("status", appt.status);

    if (updateError) {
      console.error("[AppointmentAttendanceRepository] Error recording arrival:", updateError.message);
    }
  }

  /**
   * "HH:MM:SS" at which the practitioner's working hours end on a given
   * date — that date's calendar override if there is one, otherwise their
   * weekly schedule. Null when unknown (no schedule, holiday or leave).
   */
  static async getWorkingEndTime(practitionerId: string, date: string): Promise<string | null> {
    const supabase = createClient();

    const { data: calendarRow, error: calendarError } = await supabase
      .from("calendar_availability")
      .select("working_end, is_holiday, is_leave")
      .eq("practitioner_id", practitionerId)
      .eq("date", date)
      .limit(1)
      .maybeSingle();

    if (calendarError) {
      console.error("[AppointmentAttendanceRepository] Error reading calendar availability:", calendarError.message);
    }
    if (calendarRow) {
      if (calendarRow.is_holiday || calendarRow.is_leave) return null;
      return calendarRow.working_end ?? null;
    }

    const [year, month, day] = date.split("-").map(Number);
    const jsDay = new Date(year, month - 1, day).getDay();
    const dayOfWeek = jsDay === 0 ? 6 : jsDay - 1;

    const { data: scheduleRow, error: scheduleError } = await supabase
      .from("availability_schedules")
      .select("end_time")
      .eq("practitioner_id", practitionerId)
      .eq("day_of_week", dayOfWeek)
      .eq("is_active", true)
      .order("end_time", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (scheduleError) {
      console.error("[AppointmentAttendanceRepository] Error reading weekly schedule:", scheduleError.message);
    }
    return scheduleRow?.end_time ?? null;
  }

  /**
   * Staff close an arrived in-clinic appointment that won't be seen today:
   * the doctor isn't available (missed by the practitioner) or the patient
   * left before being seen (missed by the patient). Notifies the patient.
   * Returns false when the appointment isn't an arrived clinic one.
   */
  static async closeArrivedClinicAppointment(
    appointmentId: string,
    practitionerId: string,
    reason: ClinicCloseReason,
  ): Promise<boolean> {
    const supabase = createClient();
    const { data: appt, error } = await supabase
      .from("appointments")
      .select(MISSABLE_APPOINTMENT_COLUMNS)
      .eq("id", appointmentId)
      .eq("practitioner_id", practitionerId)
      .maybeSingle<MissableAppointment>();

    if (error) {
      console.error("[AppointmentAttendanceRepository] Error reading clinic appointment:", error.message);
      return false;
    }
    if (!appt || !isArrivedClinicPatient(appt)) return false;

    const missedBy: MissedBy = reason === "patient_left" ? "patient" : "practitioner";
    const { data: updated, error: updateError } = await supabase
      .from("appointments")
      .update({ status: "no_show", missed_by: missedBy, noshow_marked_at: new Date().toISOString() })
      .eq("id", appointmentId)
      .eq("status", "checked_in")
      .select("id");

    if (updateError) {
      console.error("[AppointmentAttendanceRepository] Error closing clinic appointment:", updateError.message);
      return false;
    }
    if (!updated || updated.length === 0) return false;

    await this.notifyPatientOfMissed(appt, missedBy, reason === "patient_left");
    return true;
  }

  /**
   * Reception (or the doctor) marks an in-clinic patient as arrived for
   * today's appointment: checked_in, with the patient's arrival time. From
   * here the patient waits for the doctor and is no longer missed at the slot
   * cutoff (only when the doctor's working hours end, or when closed by hand). Returns false when the appointment isn't one that can be marked.
   */
  static async markClinicArrived(appointmentId: string, practitionerId: string): Promise<boolean> {
    const supabase = createClient();
    const { data: appt, error } = await supabase
      .from("appointments")
      .select("id, status, mode, scheduled_date, patient_joined_at, checked_in_at")
      .eq("id", appointmentId)
      .eq("practitioner_id", practitionerId)
      .maybeSingle();

    if (error) {
      console.error("[AppointmentAttendanceRepository] Error reading clinic appointment:", error.message);
      return false;
    }
    if (!appt || appt.mode !== "clinic") return false;
    if (appt.scheduled_date !== new Date().toLocaleDateString("en-CA")) return false;
    if (appt.status === "checked_in" && appt.patient_joined_at) return true;
    if (!isMissableStatus(appt.status)) return false;

    const now = new Date().toISOString();
    const { data: updated, error: updateError } = await supabase
      .from("appointments")
      .update({
        status: "checked_in",
        patient_joined_at: appt.patient_joined_at ?? now,
        checked_in_at: appt.checked_in_at ?? now,
      })
      .eq("id", appointmentId)
      .in("status", [...MISSABLE_APPOINTMENT_STATUSES])
      .select("id");

    if (updateError) {
      console.error("[AppointmentAttendanceRepository] Error marking clinic patient arrived:", updateError.message);
      return false;
    }
    return Boolean(updated && updated.length > 0);
  }

  /**
   * The doctor has started an in-clinic consultation from their queue — the
   * patient is physically there, so both sides are present: in_session.
   * Returns false when the appointment isn't one this doctor can start.
   */
  static async startClinicConsult(appointmentId: string, practitionerId: string): Promise<boolean> {
    const supabase = createClient();
    const { data: appt, error } = await supabase
      .from("appointments")
      .select("id, status, mode, patient_joined_at, practitioner_joined_at, checked_in_at, session_started_at")
      .eq("id", appointmentId)
      .eq("practitioner_id", practitionerId)
      .maybeSingle();

    if (error) {
      console.error("[AppointmentAttendanceRepository] Error reading clinic appointment:", error.message);
      return false;
    }
    if (!appt || appt.mode !== "clinic") return false;
    if (appt.status === "in_session") return true;
    if (!isMissableStatus(appt.status)) return false;

    const now = new Date().toISOString();
    const { data: updated, error: updateError } = await supabase
      .from("appointments")
      .update({
        status: "in_session",
        patient_joined_at: appt.patient_joined_at ?? now,
        practitioner_joined_at: appt.practitioner_joined_at ?? now,
        checked_in_at: appt.checked_in_at ?? now,
        session_started_at: appt.session_started_at ?? now,
      })
      .eq("id", appointmentId)
      .in("status", [...MISSABLE_APPOINTMENT_STATUSES])
      .select("id");

    if (updateError) {
      console.error("[AppointmentAttendanceRepository] Error starting clinic consult:", updateError.message);
      return false;
    }
    return Boolean(updated && updated.length > 0);
  }
}
