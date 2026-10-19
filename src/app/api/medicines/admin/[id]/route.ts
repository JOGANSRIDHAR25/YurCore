import { NextRequest } from "next/server";
import { adminUpdateMedicineController } from "@/backend/controller/medicine.controller";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(req: NextRequest, context: RouteContext) {
  return adminUpdateMedicineController(req, context);
}
