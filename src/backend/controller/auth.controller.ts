/**
 * Auth controller — handles login and JWT signing API endpoints.
 */
import { NextRequest } from "next/server";
import { auditRequest } from "@/shared/security/audit-log";
import { createClient } from "@/shared/db/supabase.server";
import { signAccessToken, signRefreshToken } from "@/lib/jwt";
import { successResponse, errorResponse } from "@/lib/utils/response";
import { cookies } from "next/headers";
import { checkRateLimit } from "@/shared/security/rate-limit";
import { getRequestIp } from "@/shared/security/request-meta";

/**
 * GET /api/auth/check-account?email=
 * Lightweight existence check so the onboarding email step can offer
 * "Sign In" instead of "Continue" for an email that's already registered.
 */
export async function checkAccount(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email");
  if (!email) {
    return errorResponse("Email is required", 400);
  }

  const supabase: any = createClient();
  const { data } = await supabase
    .from("users")
    .select("id")
    .eq("email", email.toLowerCase())
    .maybeSingle();

  return successResponse({ exists: !!data });
}

/**
 * POST /api/auth/send-otp
 * Triggers the Supabase Edge Function to send an OTP via Email/SMS.
 */
export async function sendOtp(req: NextRequest) {
  const { email } = await req.json();

  if (!email) {
    return errorResponse("Email is required", 400);
  }

  const ip = getRequestIp(req);
  const normalizedEmail = String(email).toLowerCase();

  // Cap both per-IP and per-email OTP sends so an attacker can't spam
  // deliveries (cost/spam abuse) or churn through fresh OTPs to widen a
  // brute-force window on /api/auth/login.
  const ipLimit = checkRateLimit(`otp:send:ip:${ip}`, 10, 60 * 60);
  const emailLimit = checkRateLimit(`otp:send:email:${normalizedEmail}`, 5, 15 * 60);

  if (!ipLimit.allowed || !emailLimit.allowed) {
    const retryAfterSeconds = Math.max(ipLimit.retryAfterSeconds, emailLimit.retryAfterSeconds);
    console.warn(`[sendOtp] Rate limit exceeded for ip=${ip} email=${normalizedEmail}`);
    return errorResponse(
      `Too many OTP requests. Please try again in ${retryAfterSeconds} seconds.`,
      429,
    );
  }

  // Cast to any — database types are not yet generated
  const supabase: any = createClient();

  // Try calling Supabase Edge function
  const { data, error } = await supabase.functions.invoke("send-otp", {
    body: { email },
  });

  if (!error && !data?.error) {
    return successResponse({ success: true, message: "OTP sent successfully" });
  }

  console.error("[sendOtp] Edge function invoke reported an error:", error ?? data?.error);

  // The invoke() call can report an error (timeout, transient network issue) even when the
  // Edge Function actually completed and emailed the OTP. Check for a row created in the last
  // few seconds before assuming nothing happened — otherwise we'd insert a second, un-emailed
  // OTP that shadows the one the user was actually sent (verify-otp reads the newest row).
  const recentCutoff = new Date(Date.now() - 10_000).toISOString();
  const { data: recentRows } = await supabase
    .from("email_otps")
    .select("id")
    .eq("email", email.toLowerCase())
    .eq("purpose", "email_validation")
    .gt("created_at", recentCutoff)
    .limit(1);

  if (recentRows && recentRows.length > 0) {
    return successResponse({ success: true, message: "OTP sent successfully" });
  }

  const isDevMode = !process.env.RESEND_API_KEY || process.env.RESEND_API_KEY === "YOUR_RESEND_API_KEY";

  if (!isDevMode) {
    // No SMTP credentials are configured in this app runtime, so we cannot actually deliver an
    // email here — returning "success" without sending one would silently strand the user.
    return errorResponse("Unable to send OTP. Please try again.", 502);
  }

  // Dev-only fallback: insert a devOtp so local testing works without the Edge Function deployed.
  console.log("[sendOtp] Edge function unavailable — using dev fallback (no email will be sent).");
  const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  const { error: insertErr } = await supabase.from("email_otps").insert({
    email: email.toLowerCase(),
    otp: otpCode,
    purpose: "email_validation",
    expires_at: expiresAt,
  });

  if (insertErr) {
    console.error("[sendOtp] Fallback insert error:", insertErr.message);
    return errorResponse("Failed to send OTP", 500);
  }

  return successResponse({
    success: true,
    message: "OTP sent successfully",
    devOtp: otpCode,
    note: "Default dev OTP is '123456' or check devOtp",
  });
}

/**
 * POST /api/auth/login
 * Verifies OTP and returns JWT + user data.
 */
export async function login(req: NextRequest) {
  const { email, otp } = await req.json();

  if (!email || !otp) {
    return errorResponse("Email and OTP are required", 400);
  }

  const ip = getRequestIp(req);
  const ipLimit = checkRateLimit(`otp:verify:ip:${ip}`, 30, 15 * 60);

  if (!ipLimit.allowed) {
    console.warn(`[login] Rate limit exceeded for ip=${ip}`);
    return errorResponse(
      `Too many login attempts. Please try again in ${ipLimit.retryAfterSeconds} seconds.`,
      429,
    );
  }

  // Cast to any — database types are not yet generated
  const supabase: any = createClient();

  // Directly verify OTP from email_otps table (bypasses edge function deployment requirement)
  const { data: records, error: fetchError } = await supabase
    .from("email_otps")
    .select("*")
    .eq("email", email.toLowerCase())
    .eq("purpose", "email_validation")
    .is("consumed_at", null)
    .is("verified_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1);

  if (fetchError) {
    return errorResponse("Failed to verify OTP. Please try again.", 500);
  }

  if (!records || records.length === 0) {
    return errorResponse("OTP has expired or is invalid. Please request a new one.", 400);
  }

  const record = records[0];

  if (record.attempts >= 5) {
    await supabase
      .from("email_otps")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", record.id);
    return errorResponse("Too many attempts. Please request a new OTP.", 400);
  }

  const isDevMode = !process.env.RESEND_API_KEY || process.env.RESEND_API_KEY === "YOUR_RESEND_API_KEY";
  const isValid = otp === record.otp || (isDevMode && otp === "123456");

  if (!isValid) {
    await supabase
      .from("email_otps")
      .update({ attempts: record.attempts + 1 })
      .eq("id", record.id);
    return errorResponse("Invalid OTP. Please try again.", 400);
  }

  // Mark as verified and consumed
  await supabase
    .from("email_otps")
    .update({
      verified_at: new Date().toISOString(),
      consumed_at: new Date().toISOString(),
    })
    .eq("id", record.id);

  // Get user details from database
  const { data: dbUser, error: userError } = await supabase
    .from("users")
    .select("id, email, mobile, role")
    .eq("email", email)
    .single();

  if (userError || !dbUser) {
    // New user — OTP is verified, but profile doesn't exist yet
    return successResponse({
      returning: false,
      verified: true,
    });
  }

  // Resolve display name based on role. A `users` row can exist without its
  // matching profile row (e.g. onboarding was interrupted partway through) —
  // in that case this account isn't actually usable yet, so treat it as a
  // new signup rather than routing it into a dashboard with no profile data.
  let name = "Unknown";
  let assistantStatus: string | undefined;
  let linkedDoctorName: string | undefined;
  let hasProfile = false;

  if (dbUser.role === "practitioner") {
    const { data: prac } = await supabase
      .from("practitioners")
      .select("full_name")
      .eq("user_id", dbUser.id)
      .maybeSingle();
    if (prac) {
      name = prac.full_name;
      hasProfile = true;
    }
  } else if (dbUser.role === "patient") {
    const { data: pat } = await supabase
      .from("patients")
      .select("full_name")
      .eq("user_id", dbUser.id)
      .maybeSingle();
    if (pat) {
      name = pat.full_name;
      hasProfile = true;
    }
  } else if (dbUser.role === "assistant") {
    const { data: assistant } = await supabase
      .from("assistants")
      .select("full_name, status, practitioner:practitioners ( full_name )")
      .eq("user_id", dbUser.id)
      .maybeSingle();
    if (assistant) {
      name = assistant.full_name;
      assistantStatus = assistant.status;
      const practitioner = Array.isArray(assistant.practitioner)
        ? assistant.practitioner[0]
        : assistant.practitioner;
      linkedDoctorName = practitioner?.full_name;
      hasProfile = true;
    }
  } else {
    // Non-profile roles (admin, super_admin, ...) have no per-role table to check.
    hasProfile = true;
  }

  if (!hasProfile) {
    return successResponse({
      returning: false,
      verified: true,
    });
  }

  // Sign Tokens
  const tokenPayload = {
    id: dbUser.id,
    email: dbUser.email,
    phone: dbUser.mobile,
    role: dbUser.role,
    name,
  };

  const accessToken = await signAccessToken(tokenPayload);
  const refreshToken = await signRefreshToken(tokenPayload);

  // Set cookies
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
    maxAge: 7 * 24 * 60 * 60, // 7 days
  });

  auditRequest(req, { id: dbUser.id, role: dbUser.role }, { action: "login", module: "auth", recordId: dbUser.id });

  return successResponse({
    // Return user info. We don't need to return the token to the client body
    // since it's now securely handled via HttpOnly cookies.
    user: {
      id: dbUser.id,
      phone: dbUser.mobile,
      role: dbUser.role,
      name,
      abhaLinked: true,
      email: dbUser.email,
      assistantStatus,
      linkedDoctorName,
    },
  });
}

/**
 * POST /api/auth/refresh
 * Rotates the refresh token and issues a new access token.
 */
export async function refresh(req: NextRequest) {
  const cookieStore = await cookies();
  const currentRefreshToken = cookieStore.get("refresh_token")?.value;

  if (!currentRefreshToken) {
    return errorResponse("No refresh token provided", 401);
  }

  // Verify the refresh token
  const { verifyToken } = await import("@/lib/jwt"); // using existing function which we exported
  const payload = await verifyToken(currentRefreshToken);

  if (!payload || payload.type !== "refresh") {
    return errorResponse("Invalid or expired refresh token", 401);
  }

  // Sign new Tokens
  const tokenPayload = {
    id: payload.id,
    email: payload.email,
    phone: payload.phone,
    role: payload.role,
    name: payload.name,
  };

  const newAccessToken = await signAccessToken(tokenPayload);
  const newRefreshToken = await signRefreshToken(tokenPayload);

  // Set new cookies
  cookieStore.set("access_token", newAccessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 15 * 60, // 15 minutes
  });

  cookieStore.set("refresh_token", newRefreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60, // 7 days
  });

  return successResponse({ success: true, message: "Token refreshed" });
}

/**
 * POST /api/auth/logout
 * Clears the auth cookies.
 */
export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete("access_token");
  cookieStore.delete("refresh_token");
  return successResponse({ success: true, message: "Logged out" });
}