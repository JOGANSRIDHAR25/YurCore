import { createClient } from "@/shared/db/supabase.server";
import { AppError } from "@/shared/api/api-error";
import {
  MISSABLE_APPOINTMENT_STATUSES,
  isArrivedClinicPatient,
  isPastMissedDeadline,
} from "@/shared/appointments/attendance";
import { AppointmentAttendanceRepository, MISSABLE_APPOINTMENT_COLUMNS } from "./appointment-attendance.repo";

export class NotificationRepository {
  /**
   * Scans a patient's own appointments — and their family members', which
   * the account owner manages — for ones whose grace window has
   * already passed while the patient and doctor were never in the
   * consultation together, and marks them missed (which also notifies the
   * patient once). Appointments already in session — or awaiting the
   * doctor's notes — are never touched. Safe to call on every page load.
   */
  static async processMissedAppointmentsForPatient(patientId: string): Promise<void> {
    const supabase = await createClient();
    const todayStr = new Date().toLocaleDateString("en-CA");

    const { data: familyMembers, error: familyError } = await supabase
      .from("family_members")
      .select("patient_id")
      .eq("owner_patient_id", patientId)
      .eq("is_active", true);

    if (familyError) {
      console.error("[NotificationRepository] Error resolving family members for missed check:", familyError.message);
    }

    const visiblePatientIds = [
      patientId,
      ...(familyMembers ?? []).map((member) => member.patient_id).filter(Boolean),
    ];

    const { data: appointments, error } = await supabase
      .from("appointments")
      .select(`
        ${MISSABLE_APPOINTMENT_COLUMNS},
        practitioner:practitioners ( slot_duration_min, buffer_min )
      `)
      .in("patient_id", visiblePatientIds)
      .lte("scheduled_date", todayStr)
      .in("status", [...MISSABLE_APPOINTMENT_STATUSES]);

    if (error) {
      console.error("[NotificationRepository] Error fetching appointments for missed check:", error.message);
      return;
    }

    for (const appt of (appointments || []) as any[]) {
      if (!appt.scheduled_date || !appt.scheduled_time) continue;

      // Same slot-duration + buffer grace window as the doctor's queue view —
      // pulled live from that appointment's own practitioner, since it varies
      // doctor to doctor and can change over time.
      const practitionerRow = Array.isArray(appt.practitioner) ? appt.practitioner[0] : appt.practitioner;
      // An arrived in-clinic patient waits until that doctor's working hours end.
      const workingEndTime =
        isArrivedClinicPatient(appt) && appt.practitioner_id
          ? await AppointmentAttendanceRepository.getWorkingEndTime(appt.practitioner_id, appt.scheduled_date)
          : null;
      const isPast = isPastMissedDeadline(appt, {
        slotDurationMin: practitionerRow?.slot_duration_min,
        bufferMin: practitionerRow?.buffer_min,
        workingEndTime,
      });
      if (!isPast) continue;

      await AppointmentAttendanceRepository.markMissed(appt);
    }
  }

  /**
   * Notify a practitioner that a patient has just entered the video
   * waiting room for one of their appointments, with a deep link they can
   * click straight into the same room.
   */
  static async notifyPatientWaitingForVideo(params: {
    practitionerUserId: string;
    patientName: string;
    appointmentId: string;
  }): Promise<void> {
    const supabase = await createClient();

    const { error } = await supabase.from("notifications").insert({
      user_id: params.practitionerUserId,
      channel: "in_app",
      title: "Patient is waiting",
      body: `${params.patientName} is waiting in the video consultation room.`,
      is_read: false,
      deep_link: `/waiting-room?appointmentId=${params.appointmentId}`,
    });

    if (error) {
      console.error(
        "[NotificationRepository] Error inserting patient-waiting notification:",
        error.message,
      );
    }
  }

  static async getNotifications(userId: string) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw new AppError("Error fetching notifications", 500);
    return data;
  }

  static async markNotificationRead(id: string) {
    const supabase = await createClient();
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", id);
    if (error) throw new AppError("Error marking notification read", 500);
  }

  static async markAllNotificationsRead(userId: string) {
    const supabase = await createClient();
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", userId)
      .eq("is_read", false);
    if (error) throw new AppError("Error marking all notifications read", 500);
  }
}