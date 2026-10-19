import { EMRRepository } from "../repo/emr.repo";
import { AppointmentsRepository } from "../repo/appointments.repo";
import { AuthUser } from "@/shared/auth/auth.types";
import { AppError } from "@/shared/api/api-error";

export class EMRService {
  static async getHealthRecords(authUser: AuthUser) {
    const patientId = await AppointmentsRepository.getPatientIdFromUserId(authUser.id);
    if (!patientId) throw new AppError("Patient not found", 404);

    const data = await EMRRepository.getHealthRecords(patientId);

    return (data ?? []).map((row: any) => ({
      id: row.id,
      date: row.record_date ?? "",
      type: row.record_type ?? "consultation",
      title: row.title ?? "",
      doctor: row.practitioners?.full_name ?? row.source_facility ?? "",
      discipline: row.discipline,
      summary: row.summary ?? "",
    }));
  }

  static async savePatientVitals(authUser: AuthUser, vitals: any): Promise<{ patientId: string }> {
    const patientId = await AppointmentsRepository.getPatientIdFromUserId(authUser.id);
    if (!patientId) throw new AppError("Patient not found", 404);

    await EMRRepository.savePatientVitals(patientId, vitals);
    return { patientId };
  }

  static async addPatientProblem(authUser: AuthUser, problem: { code: string; name: string; status: "active" | "controlled" | "resolved" }): Promise<{ patientId: string }> {
    const patientId = await AppointmentsRepository.getPatientIdFromUserId(authUser.id);
    if (!patientId) throw new AppError("Patient not found", 404);

    await EMRRepository.addPatientProblem(patientId, problem);
    return { patientId };
  }

  static async removePatientProblem(authUser: AuthUser, code: string): Promise<{ patientId: string }> {
    const patientId = await AppointmentsRepository.getPatientIdFromUserId(authUser.id);
    if (!patientId) throw new AppError("Patient not found", 404);

    await EMRRepository.removePatientProblem(patientId, code);
    return { patientId };
  }

  static async savePatientNote(authUser: AuthUser, noteText: string): Promise<{ patientId: string }> {
    const patientId = await AppointmentsRepository.getPatientIdFromUserId(authUser.id);
    if (!patientId) throw new AppError("Patient not found", 404);

    await EMRRepository.savePatientNote(patientId, noteText);
    return { patientId };
  }
}
