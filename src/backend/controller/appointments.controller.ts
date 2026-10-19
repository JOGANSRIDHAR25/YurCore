import { NextRequest } from "next/server";

import {
  AppointmentsService,
  createAppointmentSchema,
  createFollowUpAppointmentSchema,
  cancelAppointmentSchema,
  appointmentIdParamSchema,
  closeClinicAppointmentSchema,
  videoAppointmentIdParamSchema,
  updateVideoStatusSchema,
} from "../service/appointments.service";

import { requireAuth } from "@/shared/auth/require-auth";
import { requirePermission } from "@/shared/auth/require-permission";
import { PERMISSIONS } from "@/shared/security/permissions";
import { apiSuccess } from "@/shared/api/api-response";
import { ValidationError } from "@/shared/api/api-error";
import { writeAuditLog } from "@/shared/security/audit-log";
import { getRequestIp, getRequestUserAgent } from "@/shared/security/request-meta";

/* -------------------------------------------------------------------------- */
/*                         Normal appointment routes                          */
/* -------------------------------------------------------------------------- */

/**
 * GET /api/appointments
 *
 * Returns appointments filtered according to the authenticated user's role.
 */
export async function getAppointmentsController(
  req: NextRequest,
) {
  const auth = await requireAuth(req);

  requirePermission(
    auth,
    PERMISSIONS.APPOINTMENTS_READ,
  );

  const appointments =
    await AppointmentsService.getAppointmentsForUser(
      auth,
    );

  return apiSuccess(appointments);
}

/**
 * POST /api/appointments
 *
 * Creates an appointment for the authenticated patient.
 */
export async function createAppointmentController(
  req: NextRequest,
) {
  const auth = await requireAuth(req);

  requirePermission(
    auth,
    PERMISSIONS.APPOINTMENTS_CREATE,
  );

  const body: unknown = await req.json();

  const parsed =
    createAppointmentSchema.safeParse(body);

  if (!parsed.success) {
    throw new ValidationError(
      "Appointment validation failed",
      parsed.error.format(),
    );
  }

  const result =
    await AppointmentsService.createAppointment(
      auth,
      parsed.data.slotId,
      parsed.data.mode,
      parsed.data.reasonForVisit,
    );

  await writeAuditLog({
    userId: auth.id,
    role: auth.role,
    action: "create_appointment",
    module: "appointments",
    recordId: result.id,
    ipAddress: getRequestIp(req),
    userAgent: getRequestUserAgent(req),
    metadata: {
      slotId: parsed.data.slotId,
      mode: parsed.data.mode,
    },
  });

  return apiSuccess(
    result,
    "Appointment scheduled successfully",
    201,
  );
}

/**
 * POST /api/appointments?action=book-follow-up
 *
 * A practitioner books a follow-up appointment on behalf of a patient
 * they're treating.
 */
export async function createFollowUpAppointmentController(
  req: NextRequest,
) {
  const auth = await requireAuth(req);

  /*
   * The caller here is the practitioner (or admin), not the patient, so
   * this checks APPOINTMENTS_UPDATE — the permission practitioners
   * actually hold — rather than APPOINTMENTS_CREATE, which is scoped to a
   * patient booking their own appointment. Ownership of the specific
   * slot/patient is still enforced in the service layer.
   */
  requirePermission(
    auth,
    PERMISSIONS.APPOINTMENTS_UPDATE,
  );

  const body: unknown = await req.json();

  const parsed =
    createFollowUpAppointmentSchema.safeParse(body);

  if (!parsed.success) {
    throw new ValidationError(
      "Follow-up appointment validation failed",
      parsed.error.format(),
    );
  }

  const result =
    await AppointmentsService.createFollowUpAppointment(
      auth,
      parsed.data.patientId,
      parsed.data.slotId,
      parsed.data.mode,
      parsed.data.reasonForVisit,
    );

  await writeAuditLog({
    userId: auth.id,
    role: auth.role,
    action: "book_follow_up_appointment",
    module: "appointments",
    recordId: result.id,
    ipAddress: getRequestIp(req),
    userAgent: getRequestUserAgent(req),
    metadata: {
      patientId: parsed.data.patientId,
      slotId: parsed.data.slotId,
      mode: parsed.data.mode,
    },
  });

  return apiSuccess(
    result,
    "Follow-up appointment scheduled successfully",
    201,
  );
}

/**
 * DELETE /api/appointments
 *
 * Cancels an appointment after permission and ownership validation.
 *
 * Body:
 * {
 *   "appointmentId": "uuid",
 *   "reason": "Cancellation reason"
 * }
 */
export async function cancelAppointmentController(
  req: NextRequest,
) {
  const auth = await requireAuth(req);

  requirePermission(
    auth,
    PERMISSIONS.APPOINTMENTS_DELETE,
  );

  const body: unknown = await req.json();

  const parsed =
    cancelAppointmentSchema.safeParse(body);

  if (!parsed.success) {
    throw new ValidationError(
      "Cancellation validation failed",
      parsed.error.format(),
    );
  }

  await AppointmentsService.cancelAppointment(
    auth,
    parsed.data.appointmentId,
    parsed.data.reason,
  );

  await writeAuditLog({
    userId: auth.id,
    role: auth.role,
    action: "cancel_appointment",
    module: "appointments",
    recordId: parsed.data.appointmentId,
    ipAddress: getRequestIp(req),
    userAgent: getRequestUserAgent(req),
    metadata: {
      reason: parsed.data.reason,
    },
  });

  return apiSuccess(
    null,
    "Appointment cancelled successfully",
  );
}

/**
 * PATCH /api/appointments?action=mark-arrived&appointmentId=...
 *
 * Reception / the practitioner marks an in-clinic patient as arrived.
 */
export async function markClinicArrivedController(
  req: NextRequest,
  appointmentId: string,
) {
  const auth = await requireAuth(req);

  requirePermission(
    auth,
    PERMISSIONS.APPOINTMENTS_UPDATE,
  );

  const parsedParams =
    appointmentIdParamSchema.safeParse({
      id: appointmentId,
    });

  if (!parsedParams.success) {
    throw new ValidationError(
      "Invalid appointment ID",
      parsedParams.error.format(),
    );
  }

  await AppointmentsService.markClinicArrived(
    auth,
    parsedParams.data.id,
  );

  await writeAuditLog({
    userId: auth.id,
    role: auth.role,
    action: "mark_clinic_patient_arrived",
    module: "appointments",
    recordId: parsedParams.data.id,
    ipAddress: getRequestIp(req),
    userAgent: getRequestUserAgent(req),
  });

  return apiSuccess(
    null,
    "Patient marked as arrived",
  );
}

/**
 * PATCH /api/appointments?action=close-arrived&appointmentId=...
 *
 * Closes an arrived in-clinic appointment that won't be seen today.
 *
 * Body: { "reason": "doctor_unavailable" | "patient_left" }
 */
export async function closeArrivedClinicAppointmentController(
  req: NextRequest,
  appointmentId: string,
) {
  const auth = await requireAuth(req);

  requirePermission(
    auth,
    PERMISSIONS.APPOINTMENTS_UPDATE,
  );

  const parsedParams =
    appointmentIdParamSchema.safeParse({
      id: appointmentId,
    });

  if (!parsedParams.success) {
    throw new ValidationError(
      "Invalid appointment ID",
      parsedParams.error.format(),
    );
  }

  const body: unknown = await req.json();

  const parsedBody =
    closeClinicAppointmentSchema.safeParse(body);

  if (!parsedBody.success) {
    throw new ValidationError(
      "Invalid close reason",
      parsedBody.error.format(),
    );
  }

  await AppointmentsService.closeArrivedClinicAppointment(
    auth,
    parsedParams.data.id,
    parsedBody.data.reason,
  );

  await writeAuditLog({
    userId: auth.id,
    role: auth.role,
    action: "close_arrived_clinic_appointment",
    module: "appointments",
    recordId: parsedParams.data.id,
    ipAddress: getRequestIp(req),
    userAgent: getRequestUserAgent(req),
    metadata: {
      reason: parsedBody.data.reason,
    },
  });

  return apiSuccess(
    null,
    "Appointment closed",
  );
}

/**
 * PATCH /api/appointments?action=start-consult&appointmentId=...
 *
 * The practitioner starts an in-clinic consultation (checks the patient in).
 */
export async function startClinicConsultController(
  req: NextRequest,
  appointmentId: string,
) {
  const auth = await requireAuth(req);

  requirePermission(
    auth,
    PERMISSIONS.APPOINTMENTS_UPDATE,
  );

  const parsedParams =
    appointmentIdParamSchema.safeParse({
      id: appointmentId,
    });

  if (!parsedParams.success) {
    throw new ValidationError(
      "Invalid appointment ID",
      parsedParams.error.format(),
    );
  }

  await AppointmentsService.startClinicConsult(
    auth,
    parsedParams.data.id,
  );

  await writeAuditLog({
    userId: auth.id,
    role: auth.role,
    action: "start_clinic_consultation",
    module: "appointments",
    recordId: parsedParams.data.id,
    ipAddress: getRequestIp(req),
    userAgent: getRequestUserAgent(req),
  });

  return apiSuccess(
    null,
    "Consultation started",
  );
}

/* -------------------------------------------------------------------------- */
/*                           Jitsi video routes                               */
/* -------------------------------------------------------------------------- */

/**
 * POST /api/appointments/[appointmentId]/video
 *
 * Returns the existing Jitsi room or creates a new random room.
 */
export async function getOrCreateVideoSessionController(
  req: NextRequest,
  appointmentId: string,
) {
  const auth = await requireAuth(req);

  /*
   * APPOINTMENTS_READ is used because both the patient and practitioner must
   * be able to join. The service performs strict ownership validation.
   */
  requirePermission(
    auth,
    PERMISSIONS.APPOINTMENTS_READ,
  );

  const parsedParams =
    videoAppointmentIdParamSchema.safeParse({
      appointmentId,
    });

  if (!parsedParams.success) {
    throw new ValidationError(
      "Invalid video appointment ID",
      parsedParams.error.format(),
    );
  }

  const session =
    await AppointmentsService.getOrCreateJitsiSession(
      parsedParams.data.appointmentId,
      auth,
    );

  await writeAuditLog({
    userId: auth.id,
    role: auth.role,
    action: "open_video_consultation",
    module: "appointments",
    recordId: session.appointmentId,
    ipAddress: getRequestIp(req),
    userAgent: getRequestUserAgent(req),
    metadata: {
      provider: session.provider,
      videoStatus: session.videoStatus,
    },
  });

  return apiSuccess(
    session,
    "Video consultation room prepared successfully",
  );
}

/**
 * PATCH /api/appointments/[appointmentId]/video
 *
 * Updates Jitsi call state.
 *
 * Body:
 * {
 *   "status": "waiting" | "in_progress" | "ended" | "cancelled"
 * }
 */
export async function updateVideoSessionStatusController(
  req: NextRequest,
  appointmentId: string,
) {
  const auth = await requireAuth(req);

  /*
   * The service performs ownership and practitioner-role validation.
   *
   * APPOINTMENTS_READ is intentionally used because patients need permission
   * to mark themselves as waiting. They cannot start or end the consultation.
   */
  requirePermission(
    auth,
    PERMISSIONS.APPOINTMENTS_READ,
  );

  const parsedParams =
    videoAppointmentIdParamSchema.safeParse({
      appointmentId,
    });

  if (!parsedParams.success) {
    throw new ValidationError(
      "Invalid video appointment ID",
      parsedParams.error.format(),
    );
  }

  const body: unknown = await req.json();

  const parsedBody =
    updateVideoStatusSchema.safeParse(body);

  if (!parsedBody.success) {
    throw new ValidationError(
      "Invalid video consultation status",
      parsedBody.error.format(),
    );
  }

  const result =
    await AppointmentsService.updateJitsiSessionStatus(
      parsedParams.data.appointmentId,
      parsedBody.data.status,
      auth,
    );

  await writeAuditLog({
    userId: auth.id,
    role: auth.role,
    action: "update_video_consultation_status",
    module: "appointments",
    recordId: result.appointmentId,
    ipAddress: getRequestIp(req),
    userAgent: getRequestUserAgent(req),
    metadata: {
      videoStatus: result.videoStatus,
      sessionStartedAt:
        result.sessionStartedAt,
      sessionEndedAt:
        result.sessionEndedAt,
      durationMin: result.durationMin,
    },
  });

  return apiSuccess(
    result,
    "Video consultation status updated successfully",
  );
}