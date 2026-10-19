import { NextRequest } from "next/server";
import { verifyDoctorController } from "@/backend/controller/onboarding.controller";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(req: NextRequest, context: RouteContext) {
  return verifyDoctorController(req, context);
}
