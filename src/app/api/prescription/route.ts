import { NextRequest } from "next/server";
import { getPrescriptionController } from "@/backend/controller/prescription.controller";

export async function GET(req: NextRequest) {
  return getPrescriptionController(req);
}
