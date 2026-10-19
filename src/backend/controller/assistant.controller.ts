/**
 * Assistant controller — doctor-delegated accounts.
 */
import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { signAccessToken, signRefreshToken } from "@/lib/jwt";
import { successResponse, errorResponse } from "@/lib/utils/response";
import { requireAuth } from "@/shared/auth/require-auth";
import { AppError } from "@/shared/api/api-error";
import { AssistantService } from "../service/assistant.service";
import { writeAuditLog } from "@/shared/security/audit-log";
import { getRequestIp, getRequestUserAgent } from "@/shared/security/request-meta";

/**
 * GET /api/practitioners/search?q=
 */
export async function searchDoctors(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") || "";
  try {
    const data = await AssistantService.searchDoctors(q);
    return successResponse(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to search doctors";
    return errorResponse(message, 500);
  }
}

/**
 * POST /api/auth/onboard-assistant
 */
export async function onboardAssistant(req: NextRequest) {
  const body = await req.json();
  const { email, phone, fullName, practitionerId } = body;

  if (!email || !fullName || !practitionerId) {
    return errorResponse("Email, full name and doctor selection are required", 400);
  }

  try {
    const userId = await AssistantService.onboardAssistant({ email, phone, fullName, practitionerId });

    const tokenPayload = {
      id: userId,
      email,
      phone: phone || "",
      role: "assistant" as const,
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

    await writeAuditLog({
      userId,
      role: "assistant",
      action: "onboard_assistant",
      module: "assistants",
      recordId: userId,
      ipAddress: getRequestIp(req),
      userAgent: getRequestUserAgent(req),
      metadata: { email, fullName, practitionerId },
    });

    return successResponse({ success: true, userId });
  } catch (error: unknown) {
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    const message = error instanceof Error ? error.message : "Failed to create assistant account";
    return errorResponse(message, statusCode);
  }
}

/**
 * GET /api/pro/assistants
 */
export async function listMyAssistants(req: NextRequest) {
  try {
    const authUser = await requireAuth(req);
    const data = await AssistantService.listMyAssistants(authUser);
    return successResponse(data);
  } catch (error: unknown) {
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    const message = error instanceof Error ? error.message : "Failed to fetch assistants";
    return errorResponse(message, statusCode);
  }
}

/**
 * POST /api/pro/assistants/[id]
 */
export async function updateAssistantStatusController(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const authUser = await requireAuth(req);
    const { id } = await context.params;
    const body = await req.json();
    await AssistantService.updateAssistantStatus(authUser, id, body.status, body.reason);
    await writeAuditLog({
      userId: authUser.id,
      role: authUser.role,
      action: "update_assistant_status",
      module: "assistants",
      recordId: id,
      ipAddress: getRequestIp(req),
      userAgent: getRequestUserAgent(req),
      metadata: { status: body.status, reason: body.reason },
    });
    return successResponse({ success: true });
  } catch (error: unknown) {
    const statusCode = error instanceof AppError ? error.statusCode : 400;
    const message = error instanceof Error ? error.message : "Failed to update assistant status";
    return errorResponse(message, statusCode);
  }
}

/**
 * GET /api/admin/assistants?q=
 */
export async function adminListAssistants(req: NextRequest) {
  try {
    const authUser = await requireAuth(req);
    const q = req.nextUrl.searchParams.get("q") || undefined;
    const data = await AssistantService.adminListAssistants(authUser, q);
    return successResponse(data);
  } catch (error: unknown) {
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    const message = error instanceof Error ? error.message : "Failed to fetch assistants";
    return errorResponse(message, statusCode);
  }
}

/**
 * POST /api/admin/assistants
 */
export async function adminCreateAssistant(req: NextRequest) {
  try {
    const authUser = await requireAuth(req);
    const body = await req.json();
    const { email, phone, fullName, practitionerId } = body;
    const userId = await AssistantService.adminCreateAssistant(authUser, { email, phone, fullName, practitionerId });
    await writeAuditLog({
      userId: authUser.id,
      role: authUser.role,
      action: "admin_create_assistant",
      module: "assistants",
      recordId: userId,
      ipAddress: getRequestIp(req),
      userAgent: getRequestUserAgent(req),
      metadata: { email, fullName, practitionerId },
    });
    return successResponse({ success: true, userId });
  } catch (error: unknown) {
    const statusCode = error instanceof AppError ? error.statusCode : 400;
    const message = error instanceof Error ? error.message : "Failed to create assistant";
    return errorResponse(message, statusCode);
  }
}

/**
 * POST /api/admin/assistants/[id]
 */
export async function adminUpdateAssistantStatusController(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const authUser = await requireAuth(req);
    const { id } = await context.params;
    const body = await req.json();
    await AssistantService.adminUpdateAssistantStatus(authUser, id, body.status, body.reason);
    await writeAuditLog({
      userId: authUser.id,
      role: authUser.role,
      action: "admin_update_assistant_status",
      module: "assistants",
      recordId: id,
      ipAddress: getRequestIp(req),
      userAgent: getRequestUserAgent(req),
      metadata: { status: body.status, reason: body.reason },
    });
    return successResponse({ success: true });
  } catch (error: unknown) {
    const statusCode = error instanceof AppError ? error.statusCode : 400;
    const message = error instanceof Error ? error.message : "Failed to update assistant status";
    return errorResponse(message, statusCode);
  }
}