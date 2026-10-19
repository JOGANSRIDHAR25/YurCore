import { SITE_NAME } from "@/shared/config/site";
export type EmailContent = {
  subject: string;
  html: string;
  text: string;
};

type EmailRow = { label: string; value: string };

/**
 * Wraps body content in the same green YurCore shell used by the OTP email
 * (supabase/functions/send-otp/index.ts) so all transactional email looks
 * like one product.
 */
export function renderEmailShell(options: {
  heading: string;
  intro?: string;
  rows?: EmailRow[];
  bodyHtml?: string;
  footerNote?: string;
}): string {
  const { heading, intro, rows, bodyHtml, footerNote } = options;

  const rowsHtml = (rows ?? [])
    .map(
      (row) => `
        <tr>
          <td style="padding: 6px 0; font-size: 13px; color: #64748b;">${row.label}</td>
          <td style="padding: 6px 0; font-size: 13px; color: #0f172a; font-weight: 600; text-align: right;">${row.value}</td>
        </tr>`,
    )
    .join("");

  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </head>

      <body style="
        margin: 0;
        padding: 30px 15px;
        background-color: #f3f7f3;
        font-family: Arial, Helvetica, sans-serif;
        color: #1f2937;
      ">
        <div style="
          max-width: 560px;
          margin: 0 auto;
          padding: 32px;
          background-color: #ffffff;
          border: 1px solid #dce8dc;
          border-radius: 14px;
        ">
          <p style="margin: 0 0 4px; font-size: 20px; font-weight: bold; color: #10b981;">${SITE_NAME}</p>
          <p style="margin: 0 0 20px; font-size: 11px; color: #64748b;">India's First AYUSH Digital Health Platform</p>

          <h2 style="margin: 0 0 16px; color: #166534;">${heading}</h2>

          ${intro ? `<p style="margin: 0 0 20px; line-height: 1.6;">${intro}</p>` : ""}

          ${
            rowsHtml
              ? `<table style="width: 100%; border-collapse: collapse; margin: 0 0 20px; padding: 16px; background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px; display: block;">
                  ${rowsHtml}
                </table>`
              : ""
          }

          ${bodyHtml ?? ""}

          <p style="margin: 22px 0 0; color: #4b5563; font-size: 14px; line-height: 1.6;">
            ${footerNote ?? `If you have any questions, please reach out to your ${SITE_NAME} practitioner.`}
          </p>

          <p style="margin-top: 22px; margin-bottom: 0;">
            Regards,<br />
            <strong>${SITE_NAME} Team</strong>
          </p>
        </div>
      </body>
    </html>
  `;
}

export function toPlainTextRows(rows?: EmailRow[]): string {
  return (rows ?? []).map((row) => `${row.label}: ${row.value}`).join("\n");
}
