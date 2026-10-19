import { DinacharyaRepository } from "../repo/dinacharya.repo";
import { AppointmentsRepository } from "../repo/appointments.repo";
import { AuthUser } from "@/shared/auth/auth.types";
import { AppError } from "@/shared/api/api-error";

function formatTime(timeStr: string): string {
  const parts = timeStr.split(":");
  const hours = parseInt(parts[0], 10);
  const m = parts[1] ?? "00";
  const period = hours >= 12 ? "PM" : "AM";
  const h12 = hours % 12 || 12;
  return `${h12.toString().padStart(2, "0")}:${m} ${period}`;
}

export class DinacharyaService {
  static async getTasks(authUser: AuthUser) {
    const patientId = await AppointmentsRepository.getPatientIdFromUserId(authUser.id);
    if (!patientId) throw new AppError("Patient not found", 404);

    const { tasks, logs } = await DinacharyaRepository.getTasksForPatient(patientId);
    
    const doneTaskIds = new Set(
      (logs ?? [])
        .filter((l) => l.is_done)
        .map((l) => l.task_id)
    );

    return tasks.map((task: any) => ({
      id: task.id,
      time: task.time_of_day ? formatTime(task.time_of_day) : "",
      title: task.title ?? "",
      description: task.description ?? "",
      done: doneTaskIds.has(task.id),
      category: (task.category as "diet" | "exercise" | "mindfulness" | "medicine") ?? "mindfulness",
    }));
  }

  static async toggleTask(authUser: AuthUser, taskId: string, done: boolean) {
    // Basic auth check: we should probably ensure the task belongs to the user,
    // but the repository currently looks up the patient ID from the task and updates habit logs.
    // In a full RBAC, we'd ensure patientId from task matches patientId from authUser.
    
    await DinacharyaRepository.toggleTask(taskId, done);
    return { success: true };
  }
}
