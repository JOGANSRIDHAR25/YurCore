import { NextRequest } from "next/server";
import { getNewDoctorsController } from "@/backend/controller/discover.controller";

export async function GET(req: NextRequest) {
  return getNewDoctorsController(req);
}
