import { NextRequest } from "next/server";
import { verifyPractitionerController } from "@/backend/controller/admin.controller";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(req: NextRequest, context: RouteContext) {
  return verifyPractitionerController(req, context);
}
