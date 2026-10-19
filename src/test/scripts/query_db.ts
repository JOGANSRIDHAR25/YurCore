import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl!, supabaseKey!);

async function run() {
  const { data, error } = await supabase
    .from("patients")
    .select(`
      id,
      full_name,
      date_of_birth,
      gender,
      prakriti,
      user:users (
        mobile
      )
    `);

  console.log("Data length:", data?.length);
  console.log("Error:", error);
}
run();
