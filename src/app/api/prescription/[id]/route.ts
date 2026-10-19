import { NextRequest } from "next/server";
import { deletePrescriptionController } from "@/backend/controller/prescription.controller";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function DELETE(req: NextRequest, context: RouteContext) {
  return deletePrescriptionController(req, context);
}
