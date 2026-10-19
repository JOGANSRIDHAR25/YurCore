import { createClient } from "@/lib/supabase/client";

export type SendEmailOtpOptions = {
  /**
   * true:
   * Create a Supabase Auth user when the email is new.
   *
   * false:
   * Send OTP only when the Auth user already exists.
   */
  shouldCreateUser?: boolean;
};

export type VerifyEmailOtpResult = {
  userId: string;
  email: string;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function validateEmail(email: string): void {
  if (!email) {
    throw new Error("Email is required");
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailPattern.test(email)) {
    throw new Error("Enter a valid email address");
  }
}

/**
 * Supabase generates the OTP and sends it through the
 * custom SMTP configured in the Supabase Dashboard.
 */
export async function sendEmailOtp(
  emailInput: string,
  options: SendEmailOtpOptions = {},
): Promise<void> {
  const email = normalizeEmail(emailInput);

  validateEmail(email);

  const supabase = createClient();

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: options.shouldCreateUser ?? true,
    },
  });

  if (error) {
    console.error("Supabase OTP sending failed:", {
      message: error.message,
      status: error.status,
      name: error.name,
    });

    if (error.status === 429) {
      throw new Error(
        "OTP was requested recently. Please wait before trying again.",
      );
    }

    throw new Error(error.message || "Unable to send OTP");
  }
}

/**
 * Verifies the OTP and creates a Supabase authentication session.
 */
export async function verifyEmailOtp(
  emailInput: string,
  otpInput: string,
): Promise<VerifyEmailOtpResult> {
  const email = normalizeEmail(emailInput);
  const otp = otpInput.replace(/\D/g, "").slice(0, 6);

  validateEmail(email);

  if (!/^\d{6}$/.test(otp)) {
    throw new Error("Enter a valid 6-digit OTP");
  }

  const supabase = createClient();

  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token: otp,
    type: "email",
  });

  if (error) {
    console.error("Supabase OTP verification failed:", {
      message: error.message,
      status: error.status,
      name: error.name,
    });

    throw new Error(
      error.message || "The OTP is invalid or expired",
    );
  }

  if (!data.user || !data.session) {
    throw new Error(
      "OTP was verified, but the authentication session was not created",
    );
  }

  return {
    userId: data.user.id,
    email: data.user.email ?? email,
  };
}