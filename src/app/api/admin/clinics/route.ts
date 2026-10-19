import { NextRequest } from "next/server";
import { getClinicsController, createClinicController } from "@/backend/controller/admin.controller";

export async function GET(req: NextRequest) {
  return getClinicsController(req);
}

export async function POST(req: NextRequest) {
  return createClinicController(req);
}
