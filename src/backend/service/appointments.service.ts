import { SITE_NAME, SITE_SHORT_CODE } from "@/shared/config/site";
import "server-only";

import { randomUUID, createHmac } from "crypto";
import { z } from "zod";

import {
  AppointmentsRepository,
  type AppointmentDbRow,
  type AppointmentVideoRow,
  type AppointmentVideoStatus,
} from "../repo/appointments.repo";
import { EmailService } from "./email.service";
import { NotificationRepository } from "../repo/notification.repo";
import { AppointmentAttendanceRepository } from "../repo/appointment-attendance.repo";

import type { AuthUser } from "@/shared/auth/auth.types";
import { resolveActingPractitionerUserId } from "@/shared/auth/resolve-practitioner-context";
import { AppError } from "@/shared/api/api-error";
import { resolveActiveFeeRupees } from "@/lib/fee";
import { getAppointmentCutoffMs, isAppointmentPastCutoff } from "@/shared/appointments/missed-cutoff";
import {
  didPatientLeave,
  isArrivedClinicPatient,
  isAwaitingNotes,
  isMissableStatus,
  isMissedBy,
  isPastMissedDeadline,
  type ClinicCloseReason,
  type MissedBy,
} from "@/shared/appointments/attendance";

/* -------------------------------------------------------------------------- */
/*                                   Types                                    */
/* -------------------------------------------------------------------------- */

export type AppointmentStatus =
  | "scheduled"
  | "checked_in"
  | "in_session"
  | "completed"
  | "cancelled"
  | "no_show"
  | "rescheduled";

export type AppointmentMode = "video" | "clinic";

export type AppointmentRow = {
  id: string;
  doctor: string;
  practitionerId: string;
  consultationId?: string;
  initials: string;
  specialty: string;
  date: string;
  dateRaw: string;
  timeRaw: string;
  mode: AppointmentMode;
  status: "upcoming" | "past" | "cancelled";
  pastOutcome?: "completed" | "missed" | "awaiting_notes";
  /** For a missed appointment: who didn't show up. */
  missedBy?: MissedBy;
  /** Missed in-clinic visit where the patient had arrived but left before being seen. */
  patientLeft?: boolean;
  /** Both sides have joined and the consultation is happening right now. */
  inSession?: boolean;
  /** In-clinic: the patient has been marked arrived and is waiting for the doctor. */
  arrived?: boolean;
  fee: string;
  duration?: string;
  rating?: number;
  hasPrescription?: boolean;
  reason?: string;
  refunded?: boolean;
  reminder: boolean;
  /** e.g. "7:00 PM" — when this slot's grace window (duration + buffer) ends, for upcoming appointments only. */
  expiresAtLabel?: string;
  /** Who the appointment is for — the account owner or one of their family members. */
  bookedFor?: {
    name: string;
    isFamilyMember: boolean;
    relationship?: string;
  };
};

export type JitsiVideoSession = {
  appointmentId: string;
  provider: "jitsi";
  domain: string;
  roomName: string;
  displayName: string;
  participantRole: string;
  scheduledDate: string;
  scheduledTime: string;
  videoStatus: AppointmentVideoStatus;
  jwt?: string;

  /** The name/specialty of the *other* participant, for waiting-room display. */
  otherPartyName: string;
  otherPartyInitials: string;
  otherPartySpecialty?: string;
};

/* -------------------------------------------------------------------------- */
/*                              Validation schemas                            */
/* -------------------------------------------------------------------------- */

export const createAppointmentSchema = z.object({
  slotId: z.string().uuid("Invalid slot ID format"),

  reasonForVisit: z
    .string()
    .trim()
    .max(1000, "Reason description is too long")
    .optional(),

  mode: z.enum(["video", "clinic"]),
});

export const createFollowUpAppointmentSchema = z.object({
  patientId: z.string().uuid("Invalid patient ID format"),

  slotId: z.string().uuid("Invalid slot ID format"),

  mode: z.enum(["video", "clinic"]),

  reasonForVisit: z
    .string()
    .trim()
    .max(1000, "Reason description is too long")
    .optional(),
});

export const cancelAppointmentSchema = z.object({
  appointmentId: z
    .string()
    .uuid("Invalid appointment ID format"),

  reason: z
    .string()
    .trim()
    .min(
      5,
      "Cancellation reason must be at least 5 characters long",
    )
    .max(500, "Cancellation reason is too long"),
});

/**
 * Preserved for any existing /appointments/[id] route.
 */
export const appointmentIdParamSchema = z.object({
  id: z.string().uuid("Invalid appointment route ID format"),
});

/**
 * Used by /appointments/[appointmentId]/video.
 */
export const videoAppointmentIdParamSchema = z.object({
  appointmentId: z
    .string()
    .uuid("Invalid video appointment ID format"),
});

export const closeClinicAppointmentSchema = z.object({
  reason: z.enum(["doctor_unavailable", "patient_left"]),
});

export const updateVideoStatusSchema = z.object({
  status: z.enum([
    "waiting",
    "in_progress",
    "ended",
    "cancelled",
  ]),
});

export type CreateAppointmentInput = z.infer<
  typeof createAppointmentSchema
>;

export type CancelAppointmentInput = z.infer<
  typeof cancelAppointmentSchema
>;

export type CreateFollowUpAppointmentInput = z.infer<
  typeof createFollowUpAppointmentSchema
>;

export type UpdateVideoStatusInput = z.infer<
  typeof updateVideoStatusSchema
>;

/* -------------------------------------------------------------------------- */
/*                              Helper functions                              */
/* -------------------------------------------------------------------------- */

function getRole(authUser: AuthUser): string {
  return String(authUser.role);
}

function isPatientRole(authUser: AuthUser): boolean {
  return getRole(authUser) === "patient";
}

function isPractitionerRole(authUser: AuthUser): boolean {
  const role = getRole(authUser);

  return role === "doctor" || role === "practitioner" || role === "assistant";
}

function isAdminRole(authUser: AuthUser): boolean {
  const role = getRole(authUser);

  return role === "admin" || role === "super_admin";
}

function getAuthUserDisplayName(authUser: AuthUser): string {
  const userWithProfileFields = authUser as AuthUser & {
    name?: string;
    fullName?: string;
    full_name?: string;
  };

  const resolvedName =
    userWithProfileFields.name?.trim() ||
    userWithProfileFields.fullName?.trim() ||
    userWithProfileFields.full_name?.trim();

  if (resolvedName) {
    return resolvedName;
  }

  if (isPatientRole(authUser)) {
    return "Patient";
  }

  if (isPractitionerRole(authUser)) {
    return "Practitioner";
  }

  return `${SITE_NAME} User`;
}

function initialsFrom(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase() || SITE_SHORT_CODE;
}

/**
 * Resolve the display name/specialty/initials of the *other* participant
 * on a video appointment, for whichever side (patient or practitioner)
 * is currently requesting the session.
 */
function resolveOtherParty(
  appointment: AppointmentVideoRow,
  requestingRole: "patient" | "practitioner" | "admin",
): {
  name: string;
  initials: string;
  specialty?: string;
} {
  if (requestingRole === "practitioner") {
    const patient = getFirst(appointment.patient);
    const name = patient?.full_name?.trim() || "Patient";

    return { name, initials: initialsFrom(name) };
  }

  const practitioner = getFirst(appointment.practitioner);
  const name = practitioner?.full_name?.trim() || "Your Practitioner";

  const specialty = [
    ...(practitioner?.specializations ?? []),
    ...(practitioner?.disciplines ?? []),
  ][0];

  return { name, initials: initialsFrom(name), specialty };
}

/**
 * How early either side may join the video room, relative to the
 * scheduled start time.
 */
const JOIN_WINDOW_MINUTES_BEFORE = 15;

function assertWithinJoinWindow(
  appointment: AppointmentVideoRow,
): void {
  // Once the call has actually started, always allow rejoining
  // regardless of the clock (network drops, tab refreshes, etc.).
  if (
    appointment.video_status === "in_progress" ||
    appointment.video_status === "waiting"
  ) {
    return;
  }

  const scheduledStart = new Date(
    `${appointment.scheduled_date}T${appointment.scheduled_time || "00:00:00"}`,
  ).getTime();

  if (Number.isNaN(scheduledStart)) {
    return;
  }

  const earliestJoin =
    scheduledStart - JOIN_WINDOW_MINUTES_BEFORE * 60_000;

  if (Date.now() < earliestJoin) {
    throw new AppError(
      `This video consultation opens ${JOIN_WINDOW_MINUTES_BEFORE} minutes before the scheduled time`,
      403,
    );
  }
}

/**
 * Sign a Jitsi-compatible JWT (HS256) when self-hosted-Jitsi credentials
 * are configured. Returns undefined for the default public meet.jit.si
 * setup, which has no JWT auth to satisfy.
 */
function signJitsiJwt(params: {
  appId: string;
  appSecret: string;
  roomName: string;
  userId: string;
  displayName: string;
  email?: string;
  isModerator: boolean;
}): string {
  const base64url = (input: Buffer | string): string =>
    Buffer.from(input)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

  const header = { alg: "HS256", typ: "JWT" };

  const nowSeconds = Math.floor(Date.now() / 1000);

  const payload = {
    aud: "jitsi",
    iss: params.appId,
    sub: params.appId,
    room: params.roomName,
    iat: nowSeconds,
    nbf: nowSeconds - 10,
    // Valid for 4 hours — comfortably covers a consultation plus buffer.
    exp: nowSeconds + 4 * 60 * 60,
    context: {
      user: {
        id: params.userId,
        name: params.displayName,
        email: params.email || "",
        moderator: params.isModerator,
      },
    },
  };

  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const signature = base64url(
    createHmac("sha256", params.appSecret)
      .update(signingInput)
      .digest(),
  );

  return `${signingInput}.${signature}`;
}

function normalizeJitsiDomain(domain?: string): string {
  const value = domain?.trim() || "meet.jit.si";

  return value
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "");
}

function getFirst<T>(
  value: T | T[] | null | undefined,
): T | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value ?? undefined;
}

function formatTime(timeStr?: string | null): string {
  if (!timeStr) {
    return "12:00 AM";
  }

  const [hourPart = "0", minutePart = "00"] =
    timeStr.split(":");

  const hour = Number.parseInt(hourPart, 10);

  if (Number.isNaN(hour)) {
    return timeStr;
  }

  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;

  return `${hour12
    .toString()
    .padStart(2, "0")}:${minutePart} ${period}`;
}

function formatDisplayDate(dateStr?: string | null): string {
  if (!dateStr) return "";
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatFee(feePaise: number | null): string | undefined {
  if (feePaise === null || feePaise === undefined) return undefined;
  return `₹${Math.round(feePaise / 100)}`;
}

/* -------------------------------------------------------------------------- */
/*                               Service class                                */
/* -------------------------------------------------------------------------- */

export class AppointmentsService {
  /**
   * Return appointments according to the authenticated user's role.
   */
  static async getAppointmentsForUser(
    authUser: AuthUser,
  ): Promise<AppointmentRow[]> {
    let rawData: AppointmentDbRow[] = [];
    let ownerPatientId: string | undefined;

    if (isPatientRole(authUser)) {
      const patientId =
        await AppointmentsRepository.getPatientIdFromUserId(
          authUser.id,
        );

      if (!patientId) {
        return [];
      }
      ownerPatientId = patientId;

      rawData =
        await AppointmentsRepository.getAppointmentsForPatient(
          patientId,
        );
    } else if (isPractitionerRole(authUser)) {
      const practitionerId =
        await AppointmentsRepository.getPractitionerIdFromUserId(
          await resolveActingPractitionerUserId(authUser),
        );

      if (!practitionerId) {
        return [];
      }

      rawData =
        await AppointmentsRepository.getAppointmentsForDoctor(
          practitionerId,
        );
    } else if (isAdminRole(authUser)) {
      rawData =
        await AppointmentsRepository.getAllAppointments();
    } else {
      return [];
    }

    return this.mapDbRowsToUI(rawData, ownerPatientId);
  }

  /**
   * Create an appointment for the authenticated patient.
   *
   * This endpoint does not accept a target patient ID, so only patients can
   * use it safely. Admin booking should use a separate endpoint that accepts
   * and validates a patient ID.
   */
  static async createAppointment(
    authUser: AuthUser,
    slotId: string,
    mode: AppointmentMode,
    reasonForVisit?: string,
  ): Promise<{ id: string }> {
    if (!isPatientRole(authUser)) {
      throw new AppError(
        "Only a registered patient can book an appointment through this endpoint",
        403,
      );
    }

    const patientId =
      await AppointmentsRepository.getPatientIdFromUserId(
        authUser.id,
      );

    if (!patientId) {
      throw new AppError(
        "A valid patient profile is required to schedule an appointment",
        400,
      );
    }

    const appointment =
      await AppointmentsRepository.createAppointment(
        patientId,
        slotId,
        mode,
        reasonForVisit,
      );

    const emailDetails =
      await AppointmentsRepository.getAppointmentEmailDetails(
        appointment.id,
      );

    if (emailDetails) {
      await EmailService.sendAppointmentBooked(
        emailDetails.patientEmail,
        {
          patientName: emailDetails.patientName,
          familyMemberName: emailDetails.familyMemberName,
          practitionerName: emailDetails.practitionerName,
          date: formatDisplayDate(emailDetails.scheduledDate),
          time: formatTime(emailDetails.scheduledTime),
          mode: emailDetails.mode === "clinic" ? "clinic" : "video",
          fee: formatFee(emailDetails.feePaise),
        },
      );
    }

    return {
      id: appointment.id,
    };
  }

  /**
   * A practitioner books a follow-up appointment on behalf of a specific
   * patient they're currently treating (e.g. "fix a follow-up slot" from
   * the patient consult screen). Unlike createAppointment, the patient is
   * supplied explicitly rather than resolved from the caller's own auth.
   */
  static async createFollowUpAppointment(
    authUser: AuthUser,
    patientId: string,
    slotId: string,
    mode: AppointmentMode,
    reasonForVisit?: string,
  ): Promise<{ id: string }> {
    if (!isPractitionerRole(authUser) && !isAdminRole(authUser)) {
      throw new AppError(
        "Only a practitioner can schedule a follow-up appointment",
        403,
      );
    }

    const patientExists =
      await AppointmentsRepository.patientExists(patientId);

    if (!patientExists) {
      throw new AppError("Patient not found", 404);
    }

    if (!isAdminRole(authUser)) {
      const practitionerId =
        await AppointmentsRepository.getPractitionerIdFromUserId(
          await resolveActingPractitionerUserId(authUser),
        );

      const slotPractitionerId =
        await AppointmentsRepository.getSlotPractitionerId(
          slotId,
        );

      if (
        !practitionerId ||
        !slotPractitionerId ||
        slotPractitionerId !== practitionerId
      ) {
        throw new AppError(
          "You can only book follow-up slots from your own availability",
          403,
        );
      }
    }

    const appointment =
      await AppointmentsRepository.createAppointment(
        patientId,
        slotId,
        mode,
        reasonForVisit,
      );

    const emailDetails =
      await AppointmentsRepository.getAppointmentEmailDetails(
        appointment.id,
      );

    if (emailDetails) {
      await EmailService.sendAppointmentBooked(
        emailDetails.patientEmail,
        {
          patientName: emailDetails.patientName,
          familyMemberName: emailDetails.familyMemberName,
          practitionerName: emailDetails.practitionerName,
          date: formatDisplayDate(emailDetails.scheduledDate),
          time: formatTime(emailDetails.scheduledTime),
          mode: emailDetails.mode === "clinic" ? "clinic" : "video",
          fee: formatFee(emailDetails.feePaise),
        },
      );
    }

    return { id: appointment.id };
  }

  /**
   * Cancel an appointment after validating ownership.
   */
  static async cancelAppointment(
    authUser: AuthUser,
    appointmentId: string,
    reason: string,
  ): Promise<void> {
    const appointment =
      await AppointmentsRepository.getAppointmentById(
        appointmentId,
      );

    if (!appointment) {
      throw new AppError("Appointment not found", 404);
    }

    if (appointment.status === "cancelled") {
      throw new AppError(
        "Appointment is already cancelled",
        409,
      );
    }

    if (appointment.status === "completed") {
      throw new AppError(
        "A completed appointment cannot be cancelled",
        409,
      );
    }

    if (appointment.status === "no_show") {
      throw new AppError(
        "A no-show appointment cannot be cancelled",
        409,
      );
    }

    let authorized = false;

    if (isAdminRole(authUser)) {
      authorized = true;
    } else if (isPatientRole(authUser)) {
      const patientId =
        await AppointmentsRepository.getPatientIdFromUserId(
          authUser.id,
        );

      authorized =
        Boolean(patientId) &&
        (await AppointmentsRepository.isOwnOrFamilyPatient(
          patientId as string,
          appointment.patient_id,
        ));
    } else if (isPractitionerRole(authUser)) {
      const practitionerId =
        await AppointmentsRepository.getPractitionerIdFromUserId(
          await resolveActingPractitionerUserId(authUser),
        );

      authorized =
        Boolean(practitionerId) &&
        appointment.practitioner_id === practitionerId;
    }

    if (!authorized) {
      throw new AppError(
        "You are not authorized to cancel this appointment",
        403,
      );
    }

    const emailDetails =
      await AppointmentsRepository.getAppointmentEmailDetails(
        appointmentId,
      );

    // The cancellation itself is the operation the caller is waiting on —
    // it must succeed or fail on its own. Everything below is a best-effort
    // side effect (notify/email); a transient failure there must not report
    // the cancellation itself as failed once the DB write above succeeded.
    await AppointmentsRepository.cancelAppointment(
      appointmentId,
      reason.trim(),
    );

    if (isPatientRole(authUser)) {
      try {
        await AppointmentsRepository.notifyPractitionerOfCancellation(
          appointmentId,
        );
      } catch (err) {
        console.error(
          "Failed to notify practitioner of cancellation:",
          err,
        );
      }
    }

    if (emailDetails) {
      try {
        await EmailService.sendAppointmentCancelled(
          emailDetails.patientEmail,
          {
            patientName: emailDetails.patientName,
            familyMemberName: emailDetails.familyMemberName,
            practitionerName: emailDetails.practitionerName,
            date: formatDisplayDate(emailDetails.scheduledDate),
            time: formatTime(emailDetails.scheduledTime),
            reason: reason.trim(),
          },
        );
      } catch (err) {
        console.error(
          "Failed to send cancellation email:",
          err,
        );
      }
    }
  }

  /**
   * The practitioner's side (doctor or assistant) marks an in-clinic
   * patient as arrived, so they are no longer missed at the slot cutoff
   * while waiting for the doctor.
   */
  static async markClinicArrived(
    authUser: AuthUser,
    appointmentId: string,
  ): Promise<void> {
    if (!isPractitionerRole(authUser)) {
      throw new AppError(
        "Only the practitioner's team can mark a patient as arrived",
        403,
      );
    }

    const practitionerId =
      await AppointmentsRepository.getPractitionerIdFromUserId(
        await resolveActingPractitionerUserId(authUser),
      );

    if (!practitionerId) {
      throw new AppError("Practitioner profile not found", 404);
    }

    const marked =
      await AppointmentAttendanceRepository.markClinicArrived(
        appointmentId,
        practitionerId,
      );

    if (!marked) {
      throw new AppError(
        "This patient can't be marked arrived — only today's in-clinic appointments that are still waiting can be",
        409,
      );
    }
  }

  /**
   * The practitioner's side closes an arrived in-clinic appointment that
   * won't be seen today — the doctor isn't available, or the patient left.
   */
  static async closeArrivedClinicAppointment(
    authUser: AuthUser,
    appointmentId: string,
    reason: ClinicCloseReason,
  ): Promise<void> {
    if (!isPractitionerRole(authUser)) {
      throw new AppError(
        "Only the practitioner's team can close an appointment",
        403,
      );
    }

    const practitionerId =
      await AppointmentsRepository.getPractitionerIdFromUserId(
        await resolveActingPractitionerUserId(authUser),
      );

    if (!practitionerId) {
      throw new AppError("Practitioner profile not found", 404);
    }

    const closed =
      await AppointmentAttendanceRepository.closeArrivedClinicAppointment(
        appointmentId,
        practitionerId,
        reason,
      );

    if (!closed) {
      throw new AppError(
        "This appointment can't be closed — only in-clinic appointments with an arrived patient can be",
        409,
      );
    }
  }

  /**
   * The practitioner starts an in-clinic consultation from their queue. The
   * patient is physically present, so both sides are in: the appointment
   * moves to in_session and can no longer be marked missed.
   */
  static async startClinicConsult(
    authUser: AuthUser,
    appointmentId: string,
  ): Promise<void> {
    if (!isPractitionerRole(authUser)) {
      throw new AppError(
        "Only the practitioner can start a consultation",
        403,
      );
    }

    const practitionerId =
      await AppointmentsRepository.getPractitionerIdFromUserId(
        await resolveActingPractitionerUserId(authUser),
      );

    if (!practitionerId) {
      throw new AppError("Practitioner profile not found", 404);
    }

    const started =
      await AppointmentAttendanceRepository.startClinicConsult(
        appointmentId,
        practitionerId,
      );

    if (!started) {
      throw new AppError(
        "This clinic appointment can't be started — it may have been missed, cancelled or already completed",
        409,
      );
    }
  }

  /* ------------------------------------------------------------------------ */
  /*                         Jitsi video-call services                         */
  /* ------------------------------------------------------------------------ */

  /**
   * Fetch an appointment and verify that the logged-in user is allowed to
   * access its video consultation.
   */
  private static async assertVideoAppointmentAccess(
    appointmentId: string,
    authUser: AuthUser,
  ): Promise<AppointmentVideoRow> {
    const appointment =
      await AppointmentsRepository.getVideoAppointmentById(
        appointmentId,
      );

    if (appointment.status === "cancelled") {
      throw new AppError(
        "This appointment has been cancelled",
        409,
      );
    }

    if (appointment.status === "no_show") {
      throw new AppError(
        "This appointment has been marked as no-show",
        409,
      );
    }

    if (appointment.mode !== "video") {
      throw new AppError(
        "This appointment is not a video consultation",
        400,
      );
    }

    if (isAdminRole(authUser)) {
      return appointment;
    }

    if (isPatientRole(authUser)) {
      const patientId =
        await AppointmentsRepository.getPatientIdFromUserId(
          authUser.id,
        );

      if (
        !patientId ||
        !(await AppointmentsRepository.isOwnOrFamilyPatient(
          patientId,
          appointment.patient_id,
        ))
      ) {
        throw new AppError(
          "You are not authorized to access this video consultation",
          403,
        );
      }

      return appointment;
    }

    if (isPractitionerRole(authUser)) {
      const practitionerId =
        await AppointmentsRepository.getPractitionerIdFromUserId(
          await resolveActingPractitionerUserId(authUser),
        );

      if (
        !practitionerId ||
        appointment.practitioner_id !== practitionerId
      ) {
        throw new AppError(
          "You are not authorized to access this video consultation",
          403,
        );
      }

      return appointment;
    }

    throw new AppError(
      "Your role cannot access video consultations",
      403,
    );
  }

  /**
   * Get an existing Jitsi room or securely generate one.
   */
  static async getOrCreateJitsiSession(
    appointmentId: string,
    authUser: AuthUser,
  ): Promise<JitsiVideoSession> {
    let appointment =
      await this.assertVideoAppointmentAccess(
        appointmentId,
        authUser,
      );

    if (appointment.video_status === "cancelled") {
      throw new AppError(
        "This video consultation has been cancelled",
        409,
      );
    }

    if (appointment.video_status === "ended") {
      throw new AppError(
        "This video consultation has already ended",
        409,
      );
    }

    // The slot's grace window is over and the two sides were never in the
    // consultation together: it's missed, not joinable. (Once both have
    // joined — in_session — the clock no longer matters.)
    if (
      isMissableStatus(appointment.status) &&
      isAppointmentPastCutoff(
        appointment.scheduled_date,
        appointment.scheduled_time,
        getFirst(appointment.practitioner)?.slot_duration_min,
        getFirst(appointment.practitioner)?.buffer_min,
      )
    ) {
      await AppointmentAttendanceRepository.markMissed(appointment);

      throw new AppError(
        "This appointment was missed — its time slot has ended",
        409,
      );
    }

    assertWithinJoinWindow(appointment);

    const requestingRole = isAdminRole(authUser)
      ? "admin"
      : isPatientRole(authUser)
        ? "patient"
        : "practitioner";

    const isFirstArrival =
      !appointment.video_room_name ||
      appointment.video_status === "not_started";

    if (!appointment.video_room_name) {
      const generatedRoomName = [
        "meyveda",
        appointment.id.replaceAll("-", ""),
        randomUUID().replaceAll("-", ""),
      ].join("-");

      appointment =
        await AppointmentsRepository.createJitsiRoomIfMissing(
          appointment.id,
          generatedRoomName,
        );
    } else if (
      appointment.video_status === "not_started"
    ) {
      appointment =
        await AppointmentsRepository.markVideoWaiting(
          appointment.id,
        );
    }

    if (!appointment.video_room_name) {
      throw new AppError(
        "Unable to prepare the video consultation room",
        500,
      );
    }

    // Record who has shown up. The first arrival checks the slot in; both
    // arriving puts it in session, after which it can never be marked missed.
    if (requestingRole !== "admin") {
      await AppointmentAttendanceRepository.recordVideoArrival(
        appointment.id,
        requestingRole,
      );
    }

    const otherParty = resolveOtherParty(
      appointment,
      requestingRole,
    );

    const displayName = getAuthUserDisplayName(authUser);

    // Let the practitioner know their patient has just shown up, so they
    // don't have to keep the dashboard open to notice.
    if (isFirstArrival && requestingRole === "patient") {
      const practitioner = getFirst(appointment.practitioner);

      if (practitioner?.user_id) {
        await NotificationRepository.notifyPatientWaitingForVideo({
          practitionerUserId: practitioner.user_id,
          patientName:
            getFirst(appointment.patient)?.full_name?.trim() ||
            displayName,
          appointmentId: appointment.id,
        }).catch((notifyError) => {
          console.error(
            "[AppointmentsService] Unable to notify practitioner of waiting patient:",
            notifyError,
          );
        });
      }
    }

    const jitsiAppId = process.env.JITSI_JWT_APP_ID;
    const jitsiAppSecret = process.env.JITSI_JWT_APP_SECRET;

    const jwt =
      jitsiAppId && jitsiAppSecret
        ? signJitsiJwt({
          appId: jitsiAppId,
          appSecret: jitsiAppSecret,
          roomName: appointment.video_room_name,
          userId: authUser.id,
          displayName,
          isModerator:
            requestingRole === "practitioner" ||
            requestingRole === "admin",
        })
        : undefined;

    return {
      appointmentId: appointment.id,
      provider: "jitsi",
      domain: normalizeJitsiDomain(
        process.env.JITSI_DOMAIN,
      ),
      roomName: appointment.video_room_name,
      displayName,
      participantRole: getRole(authUser),
      scheduledDate: appointment.scheduled_date,
      scheduledTime: appointment.scheduled_time,
      videoStatus: appointment.video_status,
      jwt,
      otherPartyName: otherParty.name,
      otherPartyInitials: otherParty.initials,
      otherPartySpecialty: otherParty.specialty,
    };
  }

  /**
   * Update the appointment's Jitsi status.
   *
   * Patients can enter the waiting room. Only practitioners and admins can
   * officially start, end, or cancel the consultation.
   */
  static async updateJitsiSessionStatus(
    appointmentId: string,
    videoStatus: AppointmentVideoStatus,
    authUser: AuthUser,
  ): Promise<{
    success: true;
    appointmentId: string;
    videoStatus: AppointmentVideoStatus;
    sessionStartedAt: string | null;
    sessionEndedAt: string | null;
    durationMin: number | null;
  }> {
    const appointment =
      await this.assertVideoAppointmentAccess(
        appointmentId,
        authUser,
      );

    const canManageConsultation =
      isPractitionerRole(authUser) ||
      isAdminRole(authUser);

    if (
      videoStatus !== "waiting" &&
      !canManageConsultation
    ) {
      throw new AppError(
        "Only the practitioner can start, end, or cancel this video consultation",
        403,
      );
    }

    // The doctor leaving (or refreshing) before the patient ever joined must
    // not close the room — otherwise the patient could never get in and the
    // slot would be wrongly counted as a patient no-show. Keep it open;
    // the missed cutoff still applies if nobody comes back.
    if (
      videoStatus === "ended" &&
      isMissableStatus(appointment.status) &&
      !appointment.patient_joined_at
    ) {
      return {
        success: true,
        appointmentId: appointment.id,
        videoStatus: appointment.video_status,
        sessionStartedAt: appointment.session_started_at,
        sessionEndedAt: appointment.session_ended_at,
        durationMin: appointment.duration_min,
      };
    }

    this.assertVideoStatusTransition(
      appointment.video_status,
      videoStatus,
    );

    const updatedAppointment =
      await AppointmentsRepository.updateVideoStatus(
        appointmentId,
        videoStatus,
      );

    return {
      success: true,
      appointmentId: updatedAppointment.id,
      videoStatus: updatedAppointment.video_status,
      sessionStartedAt:
        updatedAppointment.session_started_at,
      sessionEndedAt:
        updatedAppointment.session_ended_at,
      durationMin: updatedAppointment.duration_min,
    };
  }

  /**
   * Prevent invalid status changes such as reopening a completed call.
   */
  private static assertVideoStatusTransition(
    currentStatus: AppointmentVideoStatus,
    nextStatus: AppointmentVideoStatus,
  ): void {
    if (currentStatus === nextStatus) {
      return;
    }

    const allowedTransitions: Record<
      AppointmentVideoStatus,
      AppointmentVideoStatus[]
    > = {
      not_started: ["waiting", "cancelled"],
      waiting: ["in_progress", "cancelled"],
      in_progress: ["ended", "cancelled"],
      ended: [],
      cancelled: [],
    };

    if (
      !allowedTransitions[currentStatus].includes(
        nextStatus,
      )
    ) {
      throw new AppError(
        `Video status cannot change from ${currentStatus} to ${nextStatus}`,
        409,
      );
    }
  }

  /* ------------------------------------------------------------------------ */
  /*                            UI mapping function                            */
  /* ------------------------------------------------------------------------ */

  private static mapDbRowsToUI(
    rawData: AppointmentDbRow[],
    ownerPatientId?: string,
  ): AppointmentRow[] {
    return rawData.map((row) => {
      const practitioner = getFirst(row.practitioner);

      const doctorName =
        practitioner?.full_name?.trim() ||
        "Unknown Doctor";

      const initials = doctorName
        .split(/\s+/)
        .filter(Boolean)
        .map((word) => word.charAt(0))
        .join("")
        .slice(0, 2)
        .toUpperCase();

      const specialties = [
        ...(practitioner?.specializations ?? []),
        ...(practitioner?.disciplines ?? []),
      ];

      // Always the doctor's *current* consultation fee, not whatever the
      // slot happened to cost at booking time — so a patient sees the same
      // fee here as on the doctor's profile, even after the doctor changes
      // their rate.
      const fee = `₹${resolveActiveFeeRupees(
        practitioner?.base_video_fee,
        practitioner?.base_clinic_fee,
      )}`;

      const appointmentDate = new Date(
        `${row.scheduled_date}T${row.scheduled_time || "00:00:00"
        }`,
      );

      const currentDate = new Date()
        .toLocaleDateString("en-CA");

      const isToday =
        row.scheduled_date === currentDate;

      const dateText = isToday
        ? `Today, ${formatTime(row.scheduled_time)}`
        : `${appointmentDate.toLocaleDateString(
          "en-IN",
          {
            day: "numeric",
            month: "short",
            year: "numeric",
          },
        )} · ${formatTime(row.scheduled_time)}`;

      let uiStatus:
        | "upcoming"
        | "past"
        | "cancelled" = "upcoming";
      let pastOutcome:
        | "completed"
        | "missed"
        | "awaiting_notes"
        | undefined;
      let missedBy: MissedBy | undefined;
      let patientLeft = false;

      // "Missed" is derived from the scheduled window (start + the
      // practitioner's own slot duration + buffer — the same dynamic cutoff
      // the doctor's queue and the notifications sweep use), not just the
      // start time, so a slot in progress never flashes as missed. Deriving
      // it from immutable stored fields (date/time/practitioner settings/
      // status) instead of a separate write keeps it stable across refreshes
      // even before the async no_show job runs.
      // Only an appointment the two sides were never in together can be
      // missed — an in-session one stays live however long it runs.
      // An in-clinic patient already marked arrived waits for the doctor
      // instead: they stay "Arrived" here until a sweep (doctor's queue /
      // notifications) or staff close the appointment (see isPastMissedDeadline).
      const isPastCutoff = isPastMissedDeadline(row, {
        slotDurationMin: practitioner?.slot_duration_min,
        bufferMin: practitioner?.buffer_min,
      });
      const arrived = isArrivedClinicPatient(row);

      if (row.status === "cancelled") {
        uiStatus = "cancelled";
      } else if (row.status === "completed") {
        uiStatus = "past";
        pastOutcome = "completed";
      } else if (
        isAwaitingNotes(row.status, row.video_status, row.session_ended_at)
      ) {
        uiStatus = "past";
        pastOutcome = "awaiting_notes";
      } else if (
        row.status === "no_show" ||
        isPastCutoff
      ) {
        uiStatus = "past";
        pastOutcome = "missed";
        missedBy = isMissedBy(row.missed_by) ? row.missed_by : undefined;
        patientLeft = didPatientLeave(row.missed_by, row.patient_joined_at);
      }

      const inSession = uiStatus === "upcoming" && row.status === "in_session";
      const hasArrived = uiStatus === "upcoming" && arrived;

      const expiresAtLabel =
        uiStatus === "upcoming" && !inSession && !hasArrived
          ? new Date(
            getAppointmentCutoffMs(
              row.scheduled_date,
              row.scheduled_time,
              practitioner?.slot_duration_min,
              practitioner?.buffer_min
            )
          ).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })
          : undefined;

      const consultation = getFirst(
        row.consultation,
      );

      const rating = getFirst(
        consultation?.rating,
      );

      const mode: AppointmentMode =
        row.mode === "clinic" ? "clinic" : "video";

      return {
        id: row.id,
        doctor: doctorName,
        practitionerId: practitioner?.id ?? "",
        consultationId: consultation?.id,
        initials,
        specialty:
          specialties.join(" · ") || "AYUSH",
        date: dateText,
        dateRaw: row.scheduled_date,
        timeRaw: row.scheduled_time || "00:00:00",
        mode,
        status: uiStatus,
        pastOutcome,
        missedBy,
        patientLeft,
        inSession,
        arrived: hasArrived,
        fee,
        duration: row.duration_min
          ? `${row.duration_min} min`
          : undefined,
        rating: rating?.stars ?? undefined,
        hasPrescription:
          Boolean(consultation?.id),
        reason:
          row.cancellation_reason ?? undefined,
        refunded: row.status === "cancelled",
        reminder: false,
        expiresAtLabel,
        bookedFor: resolveBookedFor(row, ownerPatientId),
      };
    });
  }
}

/** Account owner vs family member the appointment was booked for. */
function resolveBookedFor(row: AppointmentDbRow, ownerPatientId?: string): AppointmentRow["bookedFor"] {
  const familyMember = getFirst(row.family_member);
  const patient = getFirst(row.patient);
  // Some family appointments (e.g. a follow-up the doctor fixed) carry only
  // the member's own patient_id, so a patient_id other than the owner's also
  // marks a family booking.
  const isOtherPatient = Boolean(ownerPatientId && row.patient_id && row.patient_id !== ownerPatientId);
  if ((row.family_member_id && familyMember) || isOtherPatient) {
    return {
      name: familyMember?.full_name?.trim() || patient?.full_name?.trim() || "Family member",
      isFamilyMember: true,
      relationship: familyMember?.relationship ?? undefined,
    };
  }
  if (!patient?.full_name) return undefined;
  return { name: patient.full_name.trim(), isFamilyMember: false };
}