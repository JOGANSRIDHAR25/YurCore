import { NextRequest } from "next/server";
import { getPractitionerByIdController } from "@/backend/controller/discover.controller";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(req: NextRequest, context: RouteContext) {
  return getPractitionerByIdController(req, context);
}
