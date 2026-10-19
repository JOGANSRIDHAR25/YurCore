import { createClient } from "@supabase/supabase-js";
import 'dotenv/config';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data: prac } = await supabase.from("practitioners").select("user_id").limit(1).single();
  if (!prac) return console.log("No prac");
  const userId = prac.user_id;
  
  const updates = { date_of_birth: "1985-05-05", gender: "male", blood_group: "O+" };
  const { error } = await supabase.from("practitioners").update(updates).eq("user_id", userId);
  console.log("Update Error:", error);
  
  const { data } = await supabase.from("practitioners").select("*").eq("user_id", userId).single();
  console.log("Prac row:", data);
}
test();
