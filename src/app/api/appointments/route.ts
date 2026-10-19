import { NextRequest } from "next/server";

import {
  getAppointmentsController,
  createAppointmentController,
  createFollowUpAppointmentController,
  cancelAppointmentController,
  getOrCreateVideoSessionController,
  updateVideoSessionStatusController,
  startClinicConsultController,
  markClinicArrivedController,
  closeArrivedClinicAppointmentController,
} from "@/backend/controller/appointments.controller";

import { withErrorHandler } from "@/backend/middleware/error.middleware";

export const GET = withErrorHandler(
  async (req: NextRequest) => {
    return getAppointmentsController(req);
  },
);

export const POST = withErrorHandler(
  async (req: NextRequest) => {
    const action =
      req.nextUrl.searchParams.get("action");

    if (action === "video-session") {
      const appointmentId =
        req.nextUrl.searchParams.get(
          "appointmentId",
        ) ?? "";

      return getOrCreateVideoSessionController(
        req,
        appointmentId,
      );
    }

    if (action === "book-follow-up") {
      return createFollowUpAppointmentController(req);
    }

    return createAppointmentController(req);
  },
);

export const PATCH = withErrorHandler(
  async (req: NextRequest) => {
    const action =
      req.nextUrl.searchParams.get("action");

    const appointmentId =
      req.nextUrl.searchParams.get(
        "appointmentId",
      ) ?? "";

    if (action === "mark-arrived") {
      return markClinicArrivedController(
        req,
        appointmentId,
      );
    }

    if (action === "close-arrived") {
      return closeArrivedClinicAppointmentController(
        req,
        appointmentId,
      );
    }

    if (action === "start-consult") {
      return startClinicConsultController(
        req,
        appointmentId,
      );
    }

    if (action !== "video-status") {
      throw new Error(
        "Unsupported appointment update action",
      );
    }

    return updateVideoSessionStatusController(
      req,
      appointmentId,
    );
  },
);

export const DELETE = withErrorHandler(
  async (req: NextRequest) => {
    return cancelAppointmentController(req);
  },
);