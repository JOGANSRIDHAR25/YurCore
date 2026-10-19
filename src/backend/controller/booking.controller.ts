import { NextRequest, NextResponse } from "next/server";
import { BookingService } from "../service/booking.service";
import type { BookAppointmentInput, SubmitRatingInput } from "../repo/booking.repo";
import { requireAuth } from "@/shared/auth/require-auth";
import { AppError } from "@/shared/api/api-error";
import { checkRateLimit } from "@/shared/security/rate-limit";
import { auditRequest } from "@/shared/security/audit-log";

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Internal server error";
}

function getStatusCode(error: unknown): number {
  if (error instanceof AppError) return error.statusCode;
  return 400;
}

export class BookingController {
  static async getAppointments(request: NextRequest) {
    try {
      const authUser = await requireAuth(request);

      const data = await BookingService.getAppointments(authUser);

      return NextResponse.json({
        success: true,
        data,
      });
    } catch (error: unknown) {
      console.error("getAppointments error:", error);

      return NextResponse.json(
        {
          success: false,
          error: getErrorMessage(error),
        },
        { status: getStatusCode(error) },
      );
    }
  }

  static async bookAppointment(request: NextRequest) {
    try {
      const authUser = await requireAuth(request);

      const limit = checkRateLimit(`booking:create:${authUser.id}`, 10, 60 * 60);
      if (!limit.allowed) {
        throw new AppError(
          `Too many booking attempts. Please try again in ${limit.retryAfterSeconds} seconds.`,
          429,
        );
      }

      const body = (await request.json()) as BookAppointmentInput;

      await BookingService.bookAppointment(authUser, body);
      auditRequest(request, authUser, {
        action: "book_appointment",
        module: "appointments",
        metadata: {
          practitionerId: body.practitionerId,
          date: body.date,
          time: body.time,
          mode: body.mode,
          bookedFor: body.familyMemberId ? "family_member" : "self",
          familyMemberId: body.familyMemberId,
        },
      });

      return NextResponse.json(
        {
          success: true,
          message: "Appointment booked successfully",
        },
        { status: 201 },
      );
    } catch (error: unknown) {
      console.error("bookAppointment error:", error);

      return NextResponse.json(
        {
          success: false,
          error: getErrorMessage(error),
        },
        { status: getStatusCode(error) },
      );
    }
  }

  static async cancelAppointment(request: NextRequest) {
    try {
      const authUser = await requireAuth(request);
      const body = (await request.json()) as {
        appointmentId?: string;
        reason?: string;
      };

      await BookingService.cancelAppointment(
        authUser,
        body.appointmentId ?? "",
        body.reason ?? "",
      );
      auditRequest(request, authUser, {
        action: "cancel_appointment",
        module: "appointments",
        recordId: body.appointmentId,
        metadata: { reason: body.reason },
      });

      return NextResponse.json({
        success: true,
        message: "Appointment cancelled successfully",
      });
    } catch (error: unknown) {
      console.error("cancelAppointment error:", error);

      return NextResponse.json(
        {
          success: false,
          error: getErrorMessage(error),
        },
        { status: getStatusCode(error) },
      );
    }
  }

  static async submitRating(request: NextRequest) {
    try {
      const authUser = await requireAuth(request);
      const body = (await request.json()) as SubmitRatingInput;

      await BookingService.submitRating(authUser, body);

      return NextResponse.json(
        {
          success: true,
          message: "Rating submitted successfully",
        },
        { status: 201 },
      );
    } catch (error: unknown) {
      console.error("submitRating error:", error);

      return NextResponse.json(
        {
          success: false,
          error: getErrorMessage(error),
        },
        { status: getStatusCode(error) },
      );
    }
  }
}
