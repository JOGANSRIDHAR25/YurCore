import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

async function run() {
  console.log("Searching users for name 'bharathi'...");
  const { data: users } = await supabase
    .from("users")
    .select("id, name, email, role")
    .ilike("name", "%bharathi%");

  console.log("Users matches:", users);

  console.log("Searching doctor_profiles for name 'bharathi'...");
  const { data: profiles } = await supabase
    .from("doctor_profiles")
    .select("id, user_id, full_name, is_active")
    .ilike("full_name", "%bharathi%");

  console.log("Doctor profiles matches:", profiles);

  console.log("Searching practitioners for name 'bharathi'...");
  const { data: practitioners } = await supabase
    .from("practitioners")
    .select("id, full_name, verification_status")
    .ilike("full_name", "%bharathi%");

  console.log("Legacy practitioners matches:", practitioners);
}

run();
