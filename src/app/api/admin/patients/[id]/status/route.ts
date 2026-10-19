import { NextRequest } from "next/server";
import { togglePatientStatusController } from "@/backend/controller/admin.controller";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(req: NextRequest, context: RouteContext) {
  return togglePatientStatusController(req, context);
}
