import { NextRequest } from "next/server";
import { updateAdminOrderStatusController } from "@/backend/controller/admin.controller";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(req: NextRequest, context: RouteContext) {
  return updateAdminOrderStatusController(req, context);
}
