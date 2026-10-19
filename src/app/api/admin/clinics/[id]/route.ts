import { NextRequest } from "next/server";
import { toggleClinicActiveController } from "@/backend/controller/admin.controller";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(req: NextRequest, context: RouteContext) {
  return toggleClinicActiveController(req, context);
}
