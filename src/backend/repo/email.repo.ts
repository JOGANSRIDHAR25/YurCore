import "server-only";

import { createClient } from "@/shared/db/supabase.server";

export type SendEmailPayload = {
  to: string;
  subject: string;
  html: string;
  text: string;
  attachment?: {
    filename: string;
    contentBase64: string;
  };
};

/**
 * Only file allowed to invoke the "send-email" Supabase Edge Function
 * (supabase/functions/send-email), which owns the Gmail SMTP transport.
 */
export class EmailRepository {
  /** Same as sendEmail, but reports the outcome so callers that keep a delivery record can store it. */
  static async sendEmailWithResult(payload: SendEmailPayload): Promise<{ ok: true } | { ok: false; error: string }> {
    try {
      const { data, error } = await createClient().functions.invoke("send-email", { body: payload });
      if (error) return { ok: false, error: error.message || "send-email invocation failed" };
      if (data && data.success === false) return { ok: false, error: String(data.error ?? "send-email reported a failure") };
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  static async sendEmail(payload: SendEmailPayload): Promise<void> {
    const supabase = createClient();

    const { data, error } = await supabase.functions.invoke("send-email", {
      body: payload,
    });

    if (error) {
      console.error("[EmailRepository] send-email invocation failed:", error.message);
      return;
    }

    if (data && data.success === false) {
      console.error("[EmailRepository] send-email function reported failure:", data.error);
    }
  }
}
