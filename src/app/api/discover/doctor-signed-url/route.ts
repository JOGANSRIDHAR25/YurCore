import { NextRequest } from "next/server";
import { getDoctorSignedUrlController } from "@/backend/controller/discover.controller";

export async function GET(req: NextRequest) {
  return getDoctorSignedUrlController(req);
}
