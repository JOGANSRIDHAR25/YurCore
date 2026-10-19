import { NextRequest } from "next/server";
import { EMRController } from "@/backend/controller/emr.controller";
import { withErrorHandler } from "@/backend/middleware/error.middleware";

export const GET = withErrorHandler(async (req: NextRequest) => {
  return EMRController.getHealthRecords(req);
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  return EMRController.handlePost(req);
});
