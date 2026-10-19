/**
 * POST /api/auth/verify-otp
 * Verifies OTP for new user sign-up flow without requiring an existing DB record.
 * Directly queries email_otps table — does not depend on the edge function being deployed.
 */
import { NextRequest } from "next/server";
import { withErrorHandler } from "@/backend/middleware/error.middleware";
import { createClient } from "@/shared/db/supabase.server";
import { successResponse, errorResponse } from "@/lib/utils/response";

async function verifyOtpHandler(req: NextRequest) {
  const { email, otp } = await req.json();

  if (!email || !otp) {
    return errorResponse("Email and OTP are required", 400);
  }

  const supabase: any = createClient();

  // Fetch the most recent valid, unconsumed OTP for this email
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
    console.error("email_otps fetch error:", fetchError);
    return errorResponse("Failed to verify OTP. Please try again.", 500);
  }

  if (!records || records.length === 0) {
    return errorResponse("OTP has expired or is invalid. Please request a new one.", 400);
  }

  const record = records[0];

  // Block if too many failed attempts
  if (record.attempts >= 5) {
    await supabase
      .from("email_otps")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", record.id);
    return errorResponse("Too many attempts. Please request a new OTP.", 400);
  }

  // Check OTP match (also allow "123456" in dev mode when no email provider configured)
  const isDevMode = !process.env.RESEND_API_KEY || process.env.RESEND_API_KEY === "YOUR_RESEND_API_KEY";
  const isValid = otp === record.otp || (isDevMode && otp === "123456");

  if (!isValid) {
    await supabase
      .from("email_otps")
      .update({ attempts: record.attempts + 1 })
      .eq("id", record.id);
    return errorResponse("Invalid OTP. Please try again.", 400);
  }

  // Success — mark as verified and consumed
  await supabase
    .from("email_otps")
    .update({
      verified_at: new Date().toISOString(),
      consumed_at: new Date().toISOString(),
    })
    .eq("id", record.id);

  return successResponse({ verified: true });
}

export const POST = withErrorHandler((req: NextRequest) => verifyOtpHandler(req));

