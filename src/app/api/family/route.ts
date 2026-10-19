import { NextRequest } from "next/server";
import { FamilyController } from "@/backend/controller/family.controller";
import { withErrorHandler } from "@/backend/middleware/error.middleware";

export const GET = withErrorHandler(async (req: NextRequest) => {
  return FamilyController.getFamilyMembers(req);
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  return FamilyController.handlePost(req);
});
