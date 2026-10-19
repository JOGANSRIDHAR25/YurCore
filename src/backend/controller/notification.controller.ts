import { NextRequest } from "next/server";
import { NotificationService } from "../service/notification.service";
import { getAuthUser } from "@/shared/auth/get-auth-user";
import { apiSuccess } from "@/shared/api/api-response";

export class NotificationController {
  static async getNotifications(req: NextRequest) {
    const authUser = await getAuthUser(req);
    const notifications = await NotificationService.getNotifications(authUser);
    return apiSuccess(notifications);
  }

  static async handlePost(req: NextRequest) {
    const authUser = await getAuthUser(req);
    const body = await req.json();

    const { action, payload } = body;

    switch (action) {
      case "markNotificationRead":
        await NotificationService.markNotificationRead(authUser, payload.id);
        break;
      case "markAllNotificationsRead":
        await NotificationService.markAllNotificationsRead(authUser);
        break;
      default:
        throw new Error("Invalid action");
    }

    return apiSuccess({ success: true });
  }
}
