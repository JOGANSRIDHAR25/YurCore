
import { NextRequest } from "next/server";
import { getRegistryPatientFamilyController } from "@/backend/controller/registry.controller";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(req: NextRequest, context: RouteContext) {
  return getRegistryPatientFamilyController(req, context);
}