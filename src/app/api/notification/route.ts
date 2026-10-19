import { NextRequest } from "next/server";
import { NotificationController } from "@/backend/controller/notification.controller";
import { withErrorHandler } from "@/backend/middleware/error.middleware";

export const GET = withErrorHandler(async (req: NextRequest) => {
  return NotificationController.getNotifications(req);
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  return NotificationController.handlePost(req);
});
