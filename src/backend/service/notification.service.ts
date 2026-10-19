import { NotificationRepository } from "../repo/notification.repo";
import { AppointmentsRepository } from "../repo/appointments.repo";
import { AuthUser } from "@/shared/auth/auth.types";

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

export class NotificationService {
  static async getNotifications(authUser: AuthUser) {
    if (authUser.role === "patient") {
      const patientId = await AppointmentsRepository.getPatientIdFromUserId(authUser.id);
      if (patientId) {
        await NotificationRepository.processMissedAppointmentsForPatient(patientId);
      }
    }

    const data = await NotificationRepository.getNotifications(authUser.id);

    return (data ?? []).map((row: any) => ({
      id: row.id,
      title: row.title ?? "",
      body: row.body ?? "",
      type: row.type ?? "general",
      isRead: row.is_read ?? false,
      deepLink: row.deep_link,
      referenceId: row.reference_id ?? null,
      referenceType: row.reference_type ?? null,
      createdAt: row.created_at,
      timeAgo: timeAgo(row.created_at),
    }));
  }

  static async markNotificationRead(authUser: AuthUser, id: string) {
    // Ideally we should check if the notification belongs to the user
    await NotificationRepository.markNotificationRead(id);
    return { success: true };
  }

  static async markAllNotificationsRead(authUser: AuthUser) {
    await NotificationRepository.markAllNotificationsRead(authUser.id);
    return { success: true };
  }
}