import { SITE_NAME } from "../_shared/site.ts";
import nodemailer from "nodemailer";
import { createClient } from "@supabase/supabase-js";
import { corsHeaders } from "../_shared/cors.ts";

const OTP_PURPOSE = "email_validation";
const OTP_EXPIRY_MINUTES = 5;

type SendOtpBody = {
  email?: string;
};

function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function getRequiredEnvironmentVariable(name: string): string {
  const value = Deno.env.get(name)?.trim();

  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}`,
    );
  }

  return value;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Generate a cryptographically secure OTP from 100000 to 999999.
 */
function generateOtp(): string {
  const otpRange = 900_000;
  const maximumAcceptedValue =
    Math.floor(0x1_0000_0000 / otpRange) * otpRange;

  const randomValues = new Uint32Array(1);

  do {
    crypto.getRandomValues(randomValues);
  } while (randomValues[0] >= maximumAcceptedValue);

  return String(100_000 + (randomValues[0] % otpRange));
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  if (request.method !== "POST") {
    return jsonResponse(
      {
        success: false,
        error: "Method not allowed",
      },
      405,
    );
  }

  let normalizedEmail = "";
  let generatedOtp = "";
  let expiresAt = "";
  let otpStored = false;

  try {
    let body: SendOtpBody;

    try {
      body = await request.json();
    } catch {
      return jsonResponse(
        {
          success: false,
          error: "Invalid JSON request body",
        },
        400,
      );
    }

    normalizedEmail =
      typeof body.email === "string"
        ? body.email.trim().toLowerCase()
        : "";

    if (!normalizedEmail) {
      return jsonResponse(
        {
          success: false,
          error: "Email is required",
        },
        400,
      );
    }

    if (!isValidEmail(normalizedEmail)) {
      return jsonResponse(
        {
          success: false,
          error: "Enter a valid email address",
        },
        400,
      );
    }

    const supabaseUrl =
      getRequiredEnvironmentVariable("SUPABASE_URL");

    const serviceRoleKey =
      getRequiredEnvironmentVariable(
        "SUPABASE_SERVICE_ROLE_KEY",
      );

    const gmailUser =
      getRequiredEnvironmentVariable("GMAIL_USER");

    // Use the Google-generated App Password, not the normal password.
    const gmailAppPassword =
      getRequiredEnvironmentVariable(
        "GMAIL_APP_PASSWORD",
      ).replace(/\s/g, "");

    const supabase = createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );

    generatedOtp = generateOtp();

    expiresAt = new Date(
      Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000,
    ).toISOString();

    /*
     * Store the actual six-digit OTP as a new row. Previous OTPs for this
     * email/purpose are left untouched — verify-otp always reads the most
     * recent unconsumed, unexpired row, so old rows simply age out via
     * expires_at instead of being deleted here.
     */
    const { error: insertOtpError } = await supabase
      .from("email_otps")
      .insert({
        email: normalizedEmail,
        purpose: OTP_PURPOSE,
        otp: generatedOtp,
        expires_at: expiresAt,
      });

    if (insertOtpError) {
      console.error(
        "OTP database insertion failed:",
        insertOtpError,
      );

      throw new Error(
        `Unable to store OTP: ${insertOtpError.message}`,
      );
    }

    otpStored = true;

    /*
     * Gmail uses implicit TLS on port 465.
     */
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,

      auth: {
        user: gmailUser,
        pass: gmailAppPassword,
      },

      connectionTimeout: 20_000,
      greetingTimeout: 20_000,
      socketTimeout: 30_000,

      tls: {
        minVersion: "TLSv1.2",
      },
    });

    try {
      const emailResult = await transporter.sendMail({
        from: `"${SITE_NAME}" <${gmailUser}>`,
        to: normalizedEmail,
        subject: `Your ${SITE_NAME} OTP verification code`,

        text: [
          `Welcome to ${SITE_NAME}.`,
          "",
          `Your verification code is: ${generatedOtp}`,
          "",
          `This code expires in ${OTP_EXPIRY_MINUTES} minutes.`,
          "Do not share this code with anyone.",
          "",
          "If you did not request this code, ignore this email.",
          "",
          "Regards,",
          `${SITE_NAME} Team`,
        ].join("\n"),

        html: `
          <!DOCTYPE html>
          <html lang="en">
            <head>
              <meta charset="UTF-8" />
              <meta
                name="viewport"
                content="width=device-width, initial-scale=1.0"
              />
            </head>

            <body style="
              margin: 0;
              padding: 30px 15px;
              background-color: #f3f7f3;
              font-family: Arial, Helvetica, sans-serif;
              color: #1f2937;
            ">
              <div style="
                max-width: 520px;
                margin: 0 auto;
                padding: 32px;
                background-color: #ffffff;
                border: 1px solid #dce8dc;
                border-radius: 14px;
              ">
                <h2 style="
                  margin: 0 0 16px;
                  color: #166534;
                ">
                  ${SITE_NAME} verification
                </h2>

                <p style="
                  margin: 0 0 20px;
                  line-height: 1.6;
                ">
                  Use the following verification code to continue:
                </p>

                <div style="
                  margin: 24px 0;
                  padding: 20px;
                  text-align: center;
                  background-color: #f0fdf4;
                  border: 1px solid #bbf7d0;
                  border-radius: 10px;
                  color: #166534;
                  font-size: 34px;
                  font-weight: bold;
                  letter-spacing: 8px;
                ">
                  ${generatedOtp}
                </div>

                <p style="
                  margin: 0 0 12px;
                  color: #4b5563;
                  font-size: 14px;
                  line-height: 1.6;
                ">
                  This code expires in
                  ${OTP_EXPIRY_MINUTES} minutes.
                  Do not share it with anyone.
                </p>

                <p style="
                  margin: 0 0 22px;
                  color: #4b5563;
                  font-size: 14px;
                  line-height: 1.6;
                ">
                  If you did not request this code, you can safely
                  ignore this email.
                </p>

                <p style="margin-bottom: 0;">
                  Regards,<br />
                  <strong>${SITE_NAME} Team</strong>
                </p>
              </div>
            </body>
          </html>
        `,
      });

      console.log("OTP email sent successfully:", {
        recipient: normalizedEmail,
        messageId: emailResult.messageId,
        accepted: emailResult.accepted,
        rejected: emailResult.rejected,
        response: emailResult.response,
      });
    } catch (emailError) {
      console.error("Gmail SMTP sending failed:", {
        email: normalizedEmail,
        error:
          emailError instanceof Error
            ? emailError.message
            : String(emailError),
      });

      /*
       * Delete only the OTP created by this request.
       */
      const { error: cleanupError } = await supabase
        .from("email_otps")
        .delete()
        .eq("email", normalizedEmail)
        .eq("purpose", OTP_PURPOSE)
        .eq("otp", generatedOtp)
        .eq("expires_at", expiresAt);

      if (cleanupError) {
        console.error(
          "Unable to clean up undelivered OTP:",
          cleanupError,
        );
      }

      otpStored = false;

      throw new Error(
        emailError instanceof Error
          ? `Unable to send OTP email: ${emailError.message}`
          : "Unable to send OTP email",
      );
    }

    return jsonResponse({
      success: true,
      message: "OTP stored and sent successfully",
      expiresInSeconds: OTP_EXPIRY_MINUTES * 60,
    });
  } catch (error) {
    console.error("send-otp function error:", {
      email: normalizedEmail || undefined,
      otpStored,
      message:
        error instanceof Error
          ? error.message
          : String(error),
    });

    return jsonResponse(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Internal server error",
      },
      500,
    );
  }
});