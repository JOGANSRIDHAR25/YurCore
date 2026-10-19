import { NextRequest, NextResponse } from "next/server";

import { AvailabilityService } from "../service/availability.service";
import { requireAuth } from "@/shared/auth/require-auth";
import { auditRequest } from "@/shared/security/audit-log";
import { AppError } from "@/shared/api/api-error";

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Internal server error";
}

function getErrorStatus(
  error: unknown,
  fallbackStatus = 500,
): number {
  return error instanceof AppError
    ? error.statusCode
    : fallbackStatus;
}

function errorResponse(
  controllerName: string,
  error: unknown,
  fallbackStatus = 500,
) {
  console.error(`${controllerName} error:`, error);

  return NextResponse.json(
    {
      success: false,
      error: getErrorMessage(error),
    },
    {
      status: getErrorStatus(error, fallbackStatus),
    },
  );
}

function validateDateRange(
  startDate: string,
  endDate: string,
): string | null {
  if (!startDate || !endDate) {
    return "startDate and endDate are required";
  }

  const datePattern = /^\d{4}-\d{2}-\d{2}$/;

  if (
    !datePattern.test(startDate) ||
    !datePattern.test(endDate)
  ) {
    return "Dates must use YYYY-MM-DD format";
  }

  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);

  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime())
  ) {
    return "Invalid startDate or endDate";
  }

  if (start > end) {
    return "startDate cannot be after endDate";
  }

  return null;
}

/**
 * GET /api/availability/dates
 *
 * Query parameters:
 * practitionerId
 */
export async function getAvailableDatesController(
  req: NextRequest,
) {
  try {
    await requireAuth(req);

    const practitionerId =
      req.nextUrl.searchParams.get("practitionerId") ?? "";

    const data =
      await AvailabilityService.getAvailableDates(
        practitionerId,
      );

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error: unknown) {
    return errorResponse(
      "getAvailableDatesController",
      error,
    );
  }
}

/**
 * GET /api/availability/slots
 *
 * Query parameters:
 * practitionerId
 * date
 */
export async function getSlotsController(
  req: NextRequest,
) {
  try {
    await requireAuth(req);

    const practitionerId =
      req.nextUrl.searchParams.get("practitionerId") ?? "";

    const date =
      req.nextUrl.searchParams.get("date") ?? "";

    const data = await AvailabilityService.getSlots(
      practitionerId,
      date,
    );

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error: unknown) {
    return errorResponse(
      "getSlotsController",
      error,
    );
  }
}

/**
 * GET /api/availability/schedule
 */
export async function getMySchedulesController(
  req: NextRequest,
) {
  try {
    const authUser = await requireAuth(req);

    const data =
      await AvailabilityService.getMySchedules(authUser);

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error: unknown) {
    return errorResponse(
      "getMySchedulesController",
      error,
    );
  }
}

/**
 * PUT /api/availability/schedule
 *
 * Body:
 * {
 *   schedules: ScheduleInput[]
 * }
 */
export async function updateMySchedulesController(
  req: NextRequest,
) {
  try {
    const authUser = await requireAuth(req);
    const body = await req.json();

    if (!Array.isArray(body?.schedules)) {
      return NextResponse.json(
        {
          success: false,
          error: "schedules must be an array",
        },
        {
          status: 400,
        },
      );
    }

    await AvailabilityService.updateMySchedules(
      authUser,
      body.schedules,
    );

    return NextResponse.json({
      success: true,
      message: "Schedule updated successfully",
    });
  } catch (error: unknown) {
    return errorResponse(
      "updateMySchedulesController",
      error,
      400,
    );
  }
}

/**
 * PUT /api/availability/settings
 */
export async function updateMySettingsController(
  req: NextRequest,
) {
  try {
    const authUser = await requireAuth(req);
    const body = await req.json();

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        {
          success: false,
          error: "Settings data is required",
        },
        {
          status: 400,
        },
      );
    }

    await AvailabilityService.updateMySettings(
      authUser,
      body,
    );
    auditRequest(req, authUser, {
      action: "update_practitioner_settings",
      module: "availability",
      metadata: {
        baseVideoFee: body.baseVideoFee,
        baseClinicFee: body.baseClinicFee,
        slotDurationMin: body.slotDurationMin,
        bufferMin: body.bufferMin,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Settings updated successfully",
    });
  } catch (error: unknown) {
    return errorResponse(
      "updateMySettingsController",
      error,
      400,
    );
  }
}

/**
 * GET /api/availability/blocked-dates
 */
export async function getMyBlockedDatesController(
  req: NextRequest,
) {
  try {
    const authUser = await requireAuth(req);

    const data =
      await AvailabilityService.getMyBlockedDates(
        authUser,
      );

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error: unknown) {
    return errorResponse(
      "getMyBlockedDatesController",
      error,
    );
  }
}

/**
 * GET /api/availability/calendar
 *
 * Query parameters:
 * startDate
 * endDate
 */
export async function getCalendarAvailabilityController(
  req: NextRequest,
) {
  try {
    const authUser = await requireAuth(req);

    const startDate =
      req.nextUrl.searchParams.get("startDate") ?? "";

    const endDate =
      req.nextUrl.searchParams.get("endDate") ?? "";

    if (!startDate || !endDate) {
      return NextResponse.json(
        {
          success: false,
          error: "startDate and endDate are required",
        },
        { status: 400 },
      );
    }

    const data =
      await AvailabilityService.getCalendarAvailability(
        authUser.id,
        startDate,
        endDate,
      );

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error: unknown) {
    console.error(
      "getCalendarAvailabilityController error:",
      error,
    );

    const statusCode =
      error instanceof AppError
        ? error.statusCode
        : 500;

    return NextResponse.json(
      {
        success: false,
        error: getErrorMessage(error),
      },
      { status: statusCode },
    );
  }
}

export async function updateCalendarAvailabilityController(
  req: NextRequest,
) {
  try {
    const authUser = await requireAuth(req);
    const body: unknown = await req.json();

    const bodyAny = body as any;
    const availabilityData = Array.isArray(body)
      ? body
      : Array.isArray(bodyAny?.availabilityData)
      ? bodyAny.availabilityData
      : Array.isArray(bodyAny?.updates)
      ? bodyAny.updates
      : null;

    if (!availabilityData) {
      return NextResponse.json(
        {
          success: false,
          error: "availabilityData must be an array",
        },
        { status: 400 },
      );
    }

    await AvailabilityService.updateCalendarAvailability(
      authUser.id,
      availabilityData,
    );

    return NextResponse.json({
      success: true,
      data: null,
      message:
        "Calendar availability updated successfully",
    });
  } catch (error: unknown) {
    console.error(
      "updateCalendarAvailabilityController error:",
      error,
    );

    const statusCode =
      error instanceof AppError
        ? error.statusCode
        : 400;

    return NextResponse.json(
      {
        success: false,
        error: getErrorMessage(error),
      },
      { status: statusCode },
    );
  }
}