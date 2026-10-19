import { NextRequest } from "next/server";
import { getRegistryPatientsController } from "@/backend/controller/registry.controller";

export async function GET(req: NextRequest) {
  return getRegistryPatientsController(req);
}
