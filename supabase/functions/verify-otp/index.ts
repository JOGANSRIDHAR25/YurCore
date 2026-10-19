import { createClient } from "@supabase/supabase-js";
import { corsHeaders } from "../_shared/cors.ts";

async function hashOTP(email: string, otp: string, pepper: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`${email.toLowerCase()}:${otp}:${pepper}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { email, otp } = await req.json();

    if (!email || !otp) {
      return new Response(JSON.stringify({ error: "Email and OTP are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const OTP_PEPPER = Deno.env.get("OTP_PEPPER")!;
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get the most recent unconsumed and unexpired OTP for this email
    const { data: records, error: fetchError } = await supabase
      .from('email_otps')
      .select('*')
      .eq('email', email.toLowerCase())
      .eq('purpose', 'email_validation')
      .is('consumed_at', null)
      .is('verified_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1);

    if (fetchError) throw fetchError;

    if (!records || records.length === 0) {
      return new Response(JSON.stringify({ error: "No valid OTP found or OTP expired." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const record = records[0];

    // Check attempts
    if (record.attempts >= 5) {
      // Mark as consumed (blocked)
      await supabase.from('email_otps').update({ consumed_at: new Date().toISOString() }).eq('id', record.id);
      return new Response(JSON.stringify({ error: "Too many attempts. Please request a new OTP." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isDevMode = !RESEND_API_KEY || RESEND_API_KEY === "YOUR_RESEND_API_KEY";

    if (otp === record.otp || (isDevMode && otp === "123456")) {
      // Success! Mark as verified and consumed
      await supabase.from('email_otps').update({
        verified_at: new Date().toISOString(),
        consumed_at: new Date().toISOString()
      }).eq('id', record.id);

      return new Response(JSON.stringify({ success: true, message: "OTP verified" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else {
      // Invalid OTP, increment attempts
      await supabase.from('email_otps').update({ attempts: record.attempts + 1 }).eq('id', record.id);

      return new Response(JSON.stringify({ error: "Invalid OTP." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (error: any) {
    console.error("verify-otp error:", error);
    return new Response(JSON.stringify({ error: error.message || "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
