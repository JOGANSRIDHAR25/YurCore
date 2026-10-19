/**
 * Onboarding controller — handles patient onboarding.
 */
import { NextRequest } from "next/server";
import { createClient } from "@/shared/db/supabase.server";
import { signAccessToken, signRefreshToken } from "@/lib/jwt";
import { cookies } from "next/headers";
import { successResponse, errorResponse } from "@/lib/utils/response";
import { getAuthFromRequest } from "@/backend/middleware/auth.middleware";
import { requireAuth } from "@/shared/auth/require-auth";
import { AppError } from "@/shared/api/api-error";
import { OnboardingService } from "../service/onboarding.service";
import { writeAuditLog } from "@/shared/security/audit-log";
import { getRequestIp, getRequestUserAgent } from "@/shared/security/request-meta";

/**
 * POST /api/auth/onboard-doctor
 */
export async function onboardDoctor(req: NextRequest) {
  const body = await req.json();
  const { email, phone, fullName, ...rest } = body;

  if (!email || !fullName) {
    return errorResponse("Email and full name are required", 400);
  }

  try {
    // 1. Create or resolve user and practitioner
    const userId = await OnboardingService.saveDoctorProfile({ ...rest, email, phone, fullName });
    
    // 3. Issue Auth Cookies
    const tokenPayload = {
      id: userId,
      email: email,
      phone: phone || "",
      role: "practitioner" as const,
      name: fullName,
    };
    
    const accessToken = await signAccessToken(tokenPayload);
    const refreshToken = await signRefreshToken(tokenPayload);
    
    const cookieStore = await cookies();
    const isDev = process.env.NODE_ENV !== "production";
    cookieStore.set("access_token", accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: isDev ? 7 * 24 * 60 * 60 : 15 * 60,
    });
    cookieStore.set("refresh_token", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60,
    });
    
    return successResponse({ success: true, userId });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to save doctor profile";
    return errorResponse(message, 500);
  }
}

/**
 * POST /api/auth/onboard-patient
 */
export async function onboardPatient(req: NextRequest) {
  const body = await req.json();
  const { email, fullName, dateOfBirth, gender, bloodGroup, phone, address, abhaNumber, ayushNumber,
    emergencyContacts, allergies, chronicConditions, currentMedications } = body;

  if (!email || !fullName) {
    return errorResponse("Email and full name are required", 400);
  }

  try {
    // 1. Post to both patients table and users table via service.
    // Fields the caller didn't send stay undefined here (no `?? []`/`?? ""`
    // defaulting) so the repo layer can tell "not provided" apart from
    // "explicitly cleared" and leave already-saved values alone.
    const userId = await OnboardingService.savePatientProfile({
      email,
      fullName,
      dateOfBirth,
      gender,
      bloodGroup,
      phone: phone ?? "",
      address,
      abhaNumber,
      ayushNumber,
      emergencyContacts,
      allergies,
      chronicConditions,
      currentMedications,
    });

  // 3. Issue auth cookies so the user is immediately logged in
  try {
    const { signAccessToken, signRefreshToken } = await import("@/lib/jwt");
    const { cookies } = await import("next/headers");

    const tokenPayload = { id: userId, email, phone: phone ?? "", role: "patient", name: fullName };
    const accessToken = await signAccessToken(tokenPayload);
    const refreshToken = await signRefreshToken(tokenPayload);

    const cookieStore = await cookies();
    const isDev = process.env.NODE_ENV !== "production";
    cookieStore.set("access_token", accessToken, {
      httpOnly: true, secure: process.env.NODE_ENV === "production",
      sameSite: "lax", path: "/", maxAge: isDev ? 7 * 24 * 60 * 60 : 15 * 60,
    });
    cookieStore.set("refresh_token", refreshToken, {
      httpOnly: true, secure: process.env.NODE_ENV === "production",
      sameSite: "lax", path: "/", maxAge: 7 * 24 * 60 * 60,
    });
  } catch (tokenErr) {
    console.error("[onboardPatient] token signing error:", tokenErr);
    // Non-fatal — user can still log in manually
  }

  return successResponse({ success: true, userId });
  } catch (error: any) {
    console.error("[onboardPatient] error:", error);
    return errorResponse(error.message || "Failed to onboard patient", 500);
  }
}

/**
 * GET /api/admin/doctor-verifications
 */
export async function getVerificationQueue(req: NextRequest) {
  try {
    const authUser = await requireAuth(req);
    const data = await OnboardingService.getVerificationQueue(authUser);
    return successResponse(data);
  } catch (error: unknown) {
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    const message = error instanceof Error ? error.message : "Failed to fetch verification queue";
    return errorResponse(message, statusCode);
  }
}

/**
 * POST /api/admin/doctor-verifications/[id]
 */
export async function verifyDoctorController(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const authUser = await requireAuth(req);
    const { id } = await context.params;
    const body = await req.json();
    await OnboardingService.verifyDoctor(authUser, id, body.doctorId, body.status, body.reason);
    await writeAuditLog({
      userId: authUser.id,
      role: authUser.role,
      action: "verify_doctor_onboarding",
      module: "practitioners",
      recordId: body.doctorId || id,
      ipAddress: getRequestIp(req),
      userAgent: getRequestUserAgent(req),
      metadata: { status: body.status, reason: body.reason },
    });
    return successResponse({ success: true });
  } catch (error: unknown) {
    const statusCode = error instanceof AppError ? error.statusCode : 400;
    const message = error instanceof Error ? error.message : "Failed to update verification";
    return errorResponse(message, statusCode);
  }
}

/**
 * GET /api/auth/onboard-doctor
 */
export async function getMyDoctorProfile(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) {
    return errorResponse("Unauthorized", 401);
  }
  const data = await OnboardingService.getDoctorProfile(auth.id);
  return successResponse(data);
}

/**
 * GET /api/auth/onboard-patient
 */
export async function getMyPatientProfile(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) {
    return errorResponse("Unauthorized", 401);
  }
  const data = await OnboardingService.getPatientProfile(auth.id);
  return successResponse(data);
}