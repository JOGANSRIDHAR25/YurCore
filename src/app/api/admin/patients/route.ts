import { NextRequest } from "next/server";
import { getPatientsController, createPatientController } from "@/backend/controller/admin.controller";

export async function GET(req: NextRequest) {
  return getPatientsController(req);
}

export async function POST(req: NextRequest) {
  return createPatientController(req);
}
