import { auditRequest } from "@/shared/security/audit-log";
import { NextRequest, NextResponse } from "next/server";
import { DiscoverService } from "../service/discover.service";
import { requireAuth } from "@/shared/auth/require-auth";
import { getOptionalAuthUser } from "@/shared/auth/get-auth-user";
import { AppError } from "@/shared/api/api-error";
import { checkRateLimit } from "@/shared/security/rate-limit";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Internal server error";
}

export async function getDiscoverMetadataController(req: NextRequest) {
  try {
    await getOptionalAuthUser(req);
    const data = await DiscoverService.getMetadata();
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    console.error("getDiscoverMetadataController error:", error);
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ success: false, error: getErrorMessage(error) }, { status: statusCode });
  }
}

export async function getPractitionersController(req: NextRequest) {
  try {
    await getOptionalAuthUser(req);
    const params = req.nextUrl.searchParams;
    const languagesParam = params.get("languages");

    const data = await DiscoverService.searchPractitioners({
      discipline: params.get("discipline") ?? undefined,
      search: params.get("search") ?? undefined,
      videoAvailable: params.get("videoAvailable") === "true",
      under500: params.get("under500") === "true",
      today: params.get("today") === "true",
      languages: languagesParam ? languagesParam.split(",") : undefined,
      sortBy: params.get("sortBy") ?? undefined,
    });
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    console.error("getPractitionersController error:", error);
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ success: false, error: getErrorMessage(error) }, { status: statusCode });
  }
}

export async function getPractitionerByIdController(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await getOptionalAuthUser(req);
    const { id } = await context.params;
    const data = await DiscoverService.getPractitionerById(id);
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    console.error("getPractitionerByIdController error:", error);
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ success: false, error: getErrorMessage(error) }, { status: statusCode });
  }
}

export async function getPractitionerReviewsController(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await getOptionalAuthUser(req);
    const { id } = await context.params;
    const data = await DiscoverService.getReviews(id);
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    console.error("getPractitionerReviewsController error:", error);
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ success: false, error: getErrorMessage(error) }, { status: statusCode });
  }
}

export async function getNewDoctorsController(req: NextRequest) {
  try {
    await requireAuth(req);
    const params = req.nextUrl.searchParams;
    const data = await DiscoverService.getNewDoctors({
      specialty: params.get("specialty") ?? undefined,
      language: params.get("language") ?? undefined,
      mode: (params.get("mode") as "video" | "clinic") ?? undefined,
      city: params.get("city") ?? undefined,
      ratingMin: params.get("ratingMin") ? Number(params.get("ratingMin")) : undefined,
      feeMax: params.get("feeMax") ? Number(params.get("feeMax")) : undefined,
      search: params.get("search") ?? undefined,
    });
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    console.error("getNewDoctorsController error:", error);
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ success: false, error: getErrorMessage(error) }, { status: statusCode });
  }
}

export async function getDoctorSignedUrlController(req: NextRequest) {
  try {
    const authUser = await requireAuth(req);
    const path = req.nextUrl.searchParams.get("path") ?? "";
    const url = await DiscoverService.getDoctorSignedUrl(authUser, path);
    return NextResponse.json({ success: true, data: { url } });
  } catch (error: unknown) {
    console.error("getDoctorSignedUrlController error:", error);
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ success: false, error: getErrorMessage(error) }, { status: statusCode });
  }
}

export async function getNewDoctorSlotsController(req: NextRequest) {
  try {
    await requireAuth(req);
    const doctorId = req.nextUrl.searchParams.get("doctorId") ?? "";
    const date = req.nextUrl.searchParams.get("date") ?? "";
    const data = await DiscoverService.getDoctorSlotsFromTemplates(doctorId, date);
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    console.error("getNewDoctorSlotsController error:", error);
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ success: false, error: getErrorMessage(error) }, { status: statusCode });
  }
}

export async function getNewDoctorAvailableDatesController(req: NextRequest) {
  try {
    await requireAuth(req);
    const doctorId = req.nextUrl.searchParams.get("doctorId") ?? "";
    const data = await DiscoverService.getNewDoctorAvailableDates(doctorId);
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    console.error("getNewDoctorAvailableDatesController error:", error);
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ success: false, error: getErrorMessage(error) }, { status: statusCode });
  }
}

export async function bookNewDoctorAppointmentController(req: NextRequest) {
  try {
    const authUser = await requireAuth(req);

    const limit = checkRateLimit(`booking:create:${authUser.id}`, 10, 60 * 60);
    if (!limit.allowed) {
      throw new AppError(
        `Too many booking attempts. Please try again in ${limit.retryAfterSeconds} seconds.`,
        429,
      );
    }

    const body = await req.json();
    await DiscoverService.bookNewDoctorAppointment(authUser, body);
    auditRequest(req, authUser, {
      action: "book_appointment",
      module: "appointments",
      metadata: {
        practitionerId: body.doctorProfileId,
        date: body.date,
        time: body.time,
        mode: body.mode,
        bookedFor: body.familyMemberId ? "family_member" : "self",
        familyMemberId: body.familyMemberId,
      },
    });
    return NextResponse.json({ success: true, message: "Appointment booked successfully" }, { status: 201 });
  } catch (error: unknown) {
    console.error("bookNewDoctorAppointmentController error:", error);
    const statusCode = error instanceof AppError ? error.statusCode : 400;
    return NextResponse.json({ success: false, error: getErrorMessage(error) }, { status: statusCode });
  }
}
