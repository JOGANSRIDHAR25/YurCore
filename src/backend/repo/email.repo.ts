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
