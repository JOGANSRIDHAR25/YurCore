import { createClient } from "@/shared/db/supabase.server";
import { AppError } from "@/shared/api/api-error";

export class DinacharyaRepository {
  static async getTasksForPatient(patientId: string) {
    const supabase = await createClient();
    const today = new Date().toISOString().split("T")[0];

    // 1. Get active plan(s) for the patient
    const { data: plans, error: planError } = await supabase
      .from("dinacharya_plans")
      .select("id")
      .eq("patient_id", patientId)
      .eq("is_active", true);

    if (planError) throw new AppError("Error fetching dinacharya plans", 500);
    if (!plans || plans.length === 0) return { tasks: [], logs: [] };

    const planIds = plans.map((p) => p.id);

    // 2. Fetch all tasks for these plans
    const { data: tasks, error: tasksError } = await supabase
      .from("dinacharya_tasks")
      .select("*")
      .in("plan_id", planIds)
      .order("time_of_day", { ascending: true });

    if (tasksError) throw new AppError("Error fetching tasks", 500);

    // 3. Fetch habit logs for today
    const { data: logs, error: logsError } = await supabase
      .from("habit_logs")
      .select("task_id, is_done")
      .eq("patient_id", patientId)
      .eq("log_date", today);

    if (logsError) throw new AppError("Error fetching habit logs", 500);

    return { tasks, logs };
  }

  static async toggleTask(taskId: string, done: boolean) {
    const supabase = await createClient();
    const today = new Date().toISOString().split("T")[0];

    const { data: task, error: taskErr } = await supabase
      .from("dinacharya_tasks")
      .select("plan_id, dinacharya_plans(patient_id)")
      .eq("id", taskId)
      .single();

    if (taskErr || !task) throw new AppError("Task not found", 404);

    const patientId = (task as any).dinacharya_plans?.patient_id;
    if (!patientId) throw new AppError("Patient not found for task", 400);

    if (done) {
      const { error } = await supabase
        .from("habit_logs")
        .upsert({
          task_id: taskId,
          patient_id: patientId,
          log_date: today,
          is_done: true,
        }, { onConflict: "task_id,patient_id,log_date" });
      if (error) throw new AppError("Failed to update log", 500);
    } else {
      const { error } = await supabase
        .from("habit_logs")
        .update({ is_done: false })
        .eq("task_id", taskId)
        .eq("patient_id", patientId)
        .eq("log_date", today);
      if (error) throw new AppError("Failed to update log", 500);
    }
  }
}
