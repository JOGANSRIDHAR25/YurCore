import { NextRequest } from "next/server";
import { revokeConsentController } from "@/backend/controller/consent.controller";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function DELETE(req: NextRequest, context: RouteContext) {
  return revokeConsentController(req, context);
}
