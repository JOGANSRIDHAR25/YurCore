/**
 * Attendance rules for an appointment's lifecycle:
 *
 *   scheduled ──(one side arrives)──► checked_in ──(both arrived)──► in_session
 *        │                                │                            │ (call ends)
 *        └──── slot + buffer passes ──────┴──► no_show (missed)        ▼
 *                                                             awaiting notes
 *                                                                      │ (doctor saves)
 *                                                                      ▼
 *                                                                  completed
 *
 * Once both sides have been in the consultation together (in_session) the
 * appointment can never be marked missed — only completed by the doctor.
 *
 * In-clinic visits: reception marks the patient arrived (checked_in), then the
 * doctor starts the consult (in_session). An arrived clinic patient waits for
 * the doctor past the slot cutoff — they are only missed (by the doctor) once
 * the doctor's working hours for that day are over, or when staff close the
 * appointment by hand (doctor not available / patient left).
 */

import { getAppointmentCutoffMs, isAppointmentPastCutoff } from "./missed-cutoff";

/** How long after the doctor's working hours end an arrived clinic patient is still kept waiting. */
export const CLINIC_WAIT_GRACE_MIN = 30;

/** Why staff closed an arrived in-clinic appointment by hand. */
export type ClinicCloseReason = "doctor_unavailable" | "patient_left";

export type MissedBy = "patient" | "practitioner" | "both";

/** DB statuses from which a slot may still be flipped to missed at its cutoff. */
export const MISSABLE_APPOINTMENT_STATUSES = ["scheduled", "checked_in", "rescheduled"] as const;

export function isMissableStatus(status: string | null | undefined): boolean {
  return (MISSABLE_APPOINTMENT_STATUSES as readonly string[]).includes(status ?? "");
}

/** A clinic patient who has been marked arrived and is waiting for the doctor to start. */
export function isArrivedClinicPatient(appt: {
  mode: string | null | undefined;
  status: string | null | undefined;
  patient_joined_at: string | null | undefined;
}): boolean {
  return appt.mode === "clinic" && appt.status === "checked_in" && Boolean(appt.patient_joined_at);
}

/**
 * Whether a still-missable appointment should be flipped to missed now.
 * Normally that's once its slot + buffer window has passed. An arrived
 * clinic patient is instead given until the doctor's working hours for that
 * day end (+ CLINIC_WAIT_GRACE_MIN) — or, when those hours aren't known,
 * until the day itself is over.
 */
export function isPastMissedDeadline(
  appt: {
    mode: string | null | undefined;
    status: string | null | undefined;
    patient_joined_at: string | null | undefined;
    scheduled_date: string;
    scheduled_time: string | null | undefined;
  },
  options: {
    slotDurationMin?: number | null;
    bufferMin?: number | null;
    /** "HH:MM[:SS]" end of the doctor's working hours on the appointment's date, when known. */
    workingEndTime?: string | null;
    now?: Date;
  } = {},
): boolean {
  if (!isMissableStatus(appt.status)) return false;

  const now = options.now ?? new Date();
  const today = now.toLocaleDateString("en-CA");

  if (isArrivedClinicPatient(appt)) {
    if (appt.scheduled_date < today) return true;
    if (appt.scheduled_date > today || !options.workingEndTime) return false;

    // Zero-length slot from the working-end time = the moment working hours end.
    const workingEndMs = getAppointmentCutoffMs(appt.scheduled_date, options.workingEndTime, 0, CLINIC_WAIT_GRACE_MIN);
    // Never earlier than the slot's own window (e.g. a slot booked outside the usual hours).
    const slotCutoffMs = appt.scheduled_time
      ? getAppointmentCutoffMs(appt.scheduled_date, appt.scheduled_time, options.slotDurationMin, options.bufferMin)
      : 0;
    return now.getTime() > Math.max(workingEndMs, slotCutoffMs);
  }

  if (!appt.scheduled_time) return appt.scheduled_date < today;

  return isAppointmentPastCutoff(
    appt.scheduled_date,
    appt.scheduled_time,
    options.slotDurationMin,
    options.bufferMin,
    now.getTime(),
  );
}

/**
 * A missed appointment the patient had arrived for but left before being
 * seen (closed by staff as "patient left") — as opposed to never turning up.
 */
export function didPatientLeave(
  missedBy: string | null | undefined,
  patientJoinedAt: string | null | undefined,
): boolean {
  return missedBy === "patient" && Boolean(patientJoinedAt);
}

/** Who didn't show up, from the join timestamps recorded on the appointment. */
export function resolveMissedBy(input: {
  mode: string | null | undefined;
  patientJoinedAt: string | null | undefined;
  practitionerJoinedAt: string | null | undefined;
}): MissedBy {
  if (input.patientJoinedAt && !input.practitionerJoinedAt) return "practitioner";
  if (input.practitionerJoinedAt && !input.patientJoinedAt) return "patient";
  // A clinic visit has no digital join — the doctor checks the patient in by
  // starting the consult, so a clinic slot nobody started is a patient no-show.
  if (input.mode === "clinic") return "patient";
  return "both";
}

export function isMissedBy(value: unknown): value is MissedBy {
  return value === "patient" || value === "practitioner" || value === "both";
}

/** The consultation happened (video call ended) but the doctor hasn't saved notes yet. */
export function isAwaitingNotes(
  status: string | null | undefined,
  videoStatus: string | null | undefined,
  sessionEndedAt: string | null | undefined,
): boolean {
  return status === "in_session" && (videoStatus === "ended" || Boolean(sessionEndedAt));
}

/** Doctor-facing reason for a missed slot. */
export const MISSED_BY_LABEL_FOR_DOCTOR: Record<MissedBy, string> = {
  patient: "Patient didn't join",
  practitioner: "You didn't join",
  both: "No one joined",
};

/** Patient-facing reason for a missed slot. */
export const MISSED_BY_LABEL_FOR_PATIENT: Record<MissedBy, string> = {
  patient: "You didn't join",
  practitioner: "Doctor didn't join",
  both: "No one joined",
};
