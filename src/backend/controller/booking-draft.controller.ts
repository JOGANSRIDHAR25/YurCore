import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireAuth } from "@/shared/auth/require-auth";
import { AppError } from "@/shared/api/api-error";
import {
  BOOKING_DRAFT_COOKIE,
  BOOKING_DRAFT_TTL_SECONDS,
  signBookingDraft,
  verifyBookingDraft,
  type BookingDraft,
} from "@/lib/booking-draft";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Internal server error";
}

function getStatusCode(error: unknown): number {
  if (error instanceof AppError) return error.statusCode;
  return 400;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Persists the doctor/slot/date/mode a user just selected server-side (as a
 * short-lived signed httpOnly cookie) so the browser can navigate to a clean
 * `/booking` URL instead of carrying those identifiers as query parameters.
 */
export class BookingDraftController {
  static async create(request: NextRequest) {
    try {
      const authUser = await requireAuth(request);
      const body = (await request.json()) as Partial<BookingDraft>;

      if (!body.doctorId?.trim() || !body.slotId?.trim() || !body.slot?.trim()) {
        throw new AppError("doctorId, slotId and slot are required", 400);
      }

      if (!body.date || !DATE_PATTERN.test(body.date)) {
        throw new AppError("A valid date is required", 400);
      }

      if (body.mode !== "video" && body.mode !== "clinic") {
        throw new AppError("mode must be 'video' or 'clinic'", 400);
      }

      const availableModes = Array.isArray(body.availableModes)
        ? body.availableModes.filter((m) => m === "video" || m === "clinic")
        : [body.mode];

      const draft: BookingDraft = {
        userId: authUser.id,
        doctorId: body.doctorId,
        slotId: body.slotId,
        slot: body.slot,
        date: body.date,
        mode: body.mode,
        availableModes,
      };

      const token = await signBookingDraft(draft);
      const cookieStore = await cookies();

      cookieStore.set(BOOKING_DRAFT_COOKIE, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: BOOKING_DRAFT_TTL_SECONDS,
      });

      return NextResponse.json({ success: true });
    } catch (error: unknown) {
      console.error("BookingDraftController.create error:", error);
      return NextResponse.json(
        { success: false, error: getErrorMessage(error) },
        { status: getStatusCode(error) },
      );
    }
  }

  static async get(request: NextRequest) {
    try {
      const authUser = await requireAuth(request);
      const cookieStore = await cookies();
      const token = cookieStore.get(BOOKING_DRAFT_COOKIE)?.value;

      if (!token) {
        throw new AppError("No active booking selection", 404);
      }

      const draft = await verifyBookingDraft(token, authUser.id);

      if (!draft) {
        throw new AppError("Booking selection has expired", 404);
      }

      return NextResponse.json({ success: true, data: draft });
    } catch (error: unknown) {
      console.error("BookingDraftController.get error:", error);
      return NextResponse.json(
        { success: false, error: getErrorMessage(error) },
        { status: getStatusCode(error) },
      );
    }
  }
}
