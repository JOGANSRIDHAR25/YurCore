import { NextRequest } from "next/server";
import { getVerificationQueue } from "@/backend/controller/onboarding.controller";

export async function GET(req: NextRequest) {
  return getVerificationQueue(req);
}
