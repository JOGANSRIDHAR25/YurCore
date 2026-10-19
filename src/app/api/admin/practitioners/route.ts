import { NextRequest } from "next/server";
import { getPractitionersController, createPractitionerController } from "@/backend/controller/admin.controller";

export async function GET(req: NextRequest) {
  return getPractitionersController(req);
}

export async function POST(req: NextRequest) {
  return createPractitionerController(req);
}
