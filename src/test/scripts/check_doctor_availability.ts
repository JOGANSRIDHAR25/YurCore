import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

const DOCTOR_ID = "d9f3d560-204d-4122-89db-e052f79a0ba9"; // bharathi

async function run() {
  console.log("Checking doctor profile...");
  const { data: doctor, error: docErr } = await supabase
    .from("doctor_profiles")
    .select("*")
    .eq("id", DOCTOR_ID)
    .maybeSingle();

  if (docErr || !doctor) {
    console.error("Doctor profile not found or error:", docErr);
    return;
  }
  console.log("Doctor Profile found:", doctor.full_name);

  console.log("Checking availability templates...");
  const { data: templates, error: tempErr } = await supabase
    .from("doctor_availability_templates")
    .select("*")
    .eq("doctor_id", DOCTOR_ID);

  if (tempErr) {
    console.error("Error reading templates:", tempErr);
    return;
  }

  console.log("Existing templates count:", templates?.length);
  if (templates) {
    console.log(templates);
  }

  if (!templates || templates.length === 0) {
    console.log("Seeding weekly availability templates for days 0-6...");
    const newTemplates = [];
    for (let day = 0; day <= 6; day++) {
      // 9:00 AM to 1:00 PM
      newTemplates.push({
        doctor_id: DOCTOR_ID,
        day_of_week: day,
        start_time: "09:00:00",
        end_time: "13:00:00",
        slot_duration_minutes: 30,
        consultation_mode: "video",
        is_active: true
      });
      // 2:00 PM to 6:00 PM
      newTemplates.push({
        doctor_id: DOCTOR_ID,
        day_of_week: day,
        start_time: "14:00:00",
        end_time: "18:00:00",
        slot_duration_minutes: 30,
        consultation_mode: "clinic",
        is_active: true
      });
    }

    const { data: inserted, error: insertErr } = await supabase
      .from("doctor_availability_templates")
      .insert(newTemplates)
      .select();

    if (insertErr) {
      console.error("Failed to insert templates:", insertErr);
    } else {
      console.log("Successfully seeded templates:", inserted?.length);
    }
  } else {
    // If templates exist but are inactive, let's make sure they are active
    const inactive = templates.filter(t => !t.is_active);
    if (inactive.length > 0) {
      console.log("Activating inactive templates...");
      const { error: updateErr } = await supabase
        .from("doctor_availability_templates")
        .update({ is_active: true })
        .eq("doctor_id", DOCTOR_ID);
      
      if (updateErr) {
        console.error("Error activating templates:", updateErr);
      } else {
        console.log("Activated all templates successfully!");
      }
    }
  }
}

run();
