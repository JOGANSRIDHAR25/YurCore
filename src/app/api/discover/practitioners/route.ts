import { NextRequest } from "next/server";
import { getPractitionersController } from "@/backend/controller/discover.controller";

export async function GET(req: NextRequest) {
  return getPractitionersController(req);
}
