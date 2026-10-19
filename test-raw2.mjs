import { createClient } from "@supabase/supabase-js";
import 'dotenv/config';
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serverKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, serverKey, { auth: { persistSession: false } });
const { data, error } = await supabase.auth.signInWithOtp({ email: 'new-user-test@meyveda.in' });
console.log("Error:", error);
