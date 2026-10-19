import { NextRequest } from "next/server";
import { getConsentController } from "@/backend/controller/consent.controller";

export async function GET(req: NextRequest) {
  return getConsentController(req);
}
