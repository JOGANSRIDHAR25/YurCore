import { createClient } from "@/shared/db/supabase.server";
import { AppError } from "@/shared/api/api-error";

export class EMRRepository {
  static async getHealthRecords(patientId: string) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("health_records")
      .select("*, practitioners(full_name)")
      .eq("patient_id", patientId)
      .order("record_date", { ascending: false });

    if (error) throw new AppError("Error fetching health records", 500);
    return data;
  }

  static async savePatientVitals(patientId: string, vitals: any) {
    const supabase = await createClient();
    const today = new Date().toISOString().split("T")[0];
    const { data: existing } = await supabase
      .from("health_records")
      .select("id")
      .eq("patient_id", patientId)
      .eq("title", "Vitals")
      .eq("record_date", today)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from("health_records")
        .update({ summary: JSON.stringify(vitals) })
        .eq("id", existing.id);
      if (error) throw new AppError("Error updating vitals", 500);
    } else {
      const { error } = await supabase
        .from("health_records")
        .insert({
          patient_id: patientId,
          record_type: "tracker",
          title: "Vitals",
          summary: JSON.stringify(vitals),
          record_date: today,
        });
      if (error) throw new AppError("Error saving vitals", 500);
    }
  }

  static async addPatientProblem(patientId: string, problem: { code: string; name: string; status: "active" | "controlled" | "resolved" }) {
    const supabase = await createClient();
    const { data: existing } = await supabase
      .from("health_records")
      .select("id, summary")
      .eq("patient_id", patientId)
      .eq("title", "Problems")
      .maybeSingle();

    let problems = [];
    if (existing && existing.summary) {
      try {
        problems = JSON.parse(existing.summary);
      } catch (e) { }
    }
    
    // Replace if exists
    problems = problems.filter((p: any) => p.code !== problem.code);
    problems.push({ ...problem, updated_at: new Date().toISOString() });

    if (existing) {
      const { error } = await supabase
        .from("health_records")
        .update({ summary: JSON.stringify(problems) })
        .eq("id", existing.id);
      if (error) throw new AppError("Error adding problem", 500);
    } else {
      const { error } = await supabase
        .from("health_records")
        .insert({
          patient_id: patientId,
          record_type: "document",
          title: "Problems",
          summary: JSON.stringify(problems),
          record_date: new Date().toISOString().split("T")[0],
        });
      if (error) throw new AppError("Error creating problem record", 500);
    }
  }

  static async removePatientProblem(patientId: string, code: string) {
    const supabase = await createClient();
    const { data: existing } = await supabase
      .from("health_records")
      .select("id, summary")
      .eq("patient_id", patientId)
      .eq("title", "Problems")
      .maybeSingle();

    if (existing && existing.summary) {
      try {
        let problems = JSON.parse(existing.summary);
        problems = problems.filter((p: any) => p.code !== code);
        const { error } = await supabase
          .from("health_records")
          .update({ summary: JSON.stringify(problems) })
          .eq("id", existing.id);
        if (error) throw new AppError("Error removing problem", 500);
      } catch (e) {
        throw new AppError("Error processing problems", 500);
      }
    }
  }

  static async savePatientNote(patientId: string, noteText: string) {
    const supabase = await createClient();
    const { error } = await supabase
      .from("health_records")
      .insert({
        patient_id: patientId,
        record_type: "document",
        title: "Patient Note",
        summary: noteText,
        record_date: new Date().toISOString().split("T")[0],
      });
    
    if (error) throw new AppError("Error saving patient note", 500);
  }
}
