import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const secretKey = process.env.SUPABASE_SECRET_KEY!;

async function run() {
  console.log("--- Testing with ANON KEY ---");
  const clientAnon = createClient(supabaseUrl, anonKey);
  const res1 = await clientAnon.from("practitioners").select("id, full_name, user:users(id, mobile, email)").limit(1);
  console.log("Anon res error:", res1.error);
  console.log("Anon res data count:", res1.data?.length);

  console.log("--- Testing with SECRET KEY ---");
  const clientSecret = createClient(supabaseUrl, secretKey);
  const res2 = await clientSecret.from("practitioners").select("id, full_name, user:users(id, mobile, email)").limit(1);
  console.log("Secret res error:", res2.error);
  console.log("Secret res data count:", res2.data?.length);
}
run();
