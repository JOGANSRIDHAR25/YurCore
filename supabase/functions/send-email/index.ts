import { SITE_NAME } from "../_shared/site.ts";
import nodemailer from "nodemailer";
import { corsHeaders } from "../_shared/cors.ts";

type EmailAttachment = {
  filename?: string;
  contentBase64?: string;
};

type SendEmailBody = {
  to?: string;
  subject?: string;
  html?: string;
  text?: string;
  attachment?: EmailAttachment;
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
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse(
      { success: false, error: "Method not allowed" },
      405,
    );
  }

  let recipient = "";

  try {
    let body: SendEmailBody;

    try {
      body = await request.json();
    } catch {
      return jsonResponse(
        { success: false, error: "Invalid JSON request body" },
        400,
      );
    }

    recipient =
      typeof body.to === "string" ? body.to.trim().toLowerCase() : "";

    const subject = typeof body.subject === "string" ? body.subject.trim() : "";
    const html = typeof body.html === "string" ? body.html : "";
    const text = typeof body.text === "string" ? body.text : "";

    if (!recipient || !isValidEmail(recipient)) {
      return jsonResponse(
        { success: false, error: "A valid recipient email is required" },
        400,
      );
    }

    if (!subject) {
      return jsonResponse(
        { success: false, error: "Email subject is required" },
        400,
      );
    }

    if (!html && !text) {
      return jsonResponse(
        { success: false, error: "Email must include html or text content" },
        400,
      );
    }

    const gmailUser = getRequiredEnvironmentVariable("GMAIL_USER");

    // Use the Google-generated App Password, not the normal password.
    const gmailAppPassword = getRequiredEnvironmentVariable(
      "GMAIL_APP_PASSWORD",
    ).replace(/\s/g, "");

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

    const attachments: {
      filename: string;
      content: string;
      encoding: "base64";
    }[] = [];

    if (body.attachment?.contentBase64) {
      attachments.push({
        filename: body.attachment.filename || "attachment.pdf",
        content: body.attachment.contentBase64,
        encoding: "base64",
      });
    }

    const emailResult = await transporter.sendMail({
      from: `"${SITE_NAME}" <${gmailUser}>`,
      to: recipient,
      subject,
      text: text || undefined,
      html: html || undefined,
      attachments: attachments.length > 0 ? attachments : undefined,
    });

    console.log("Email sent successfully:", {
      recipient,
      subject,
      messageId: emailResult.messageId,
      accepted: emailResult.accepted,
      rejected: emailResult.rejected,
    });

    return jsonResponse({
      success: true,
      message: "Email sent successfully",
    });
  } catch (error) {
    console.error("send-email function error:", {
      recipient: recipient || undefined,
      message: error instanceof Error ? error.message : String(error),
    });

    return jsonResponse(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Internal server error",
      },
      500,
    );
  }
});
