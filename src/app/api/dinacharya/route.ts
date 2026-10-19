import { NextRequest } from "next/server";
import { DinacharyaController } from "@/backend/controller/dinacharya.controller";
import { withErrorHandler } from "@/backend/middleware/error.middleware";

export const GET = withErrorHandler(async (req: NextRequest) => {
  return DinacharyaController.getTasks(req);
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  return DinacharyaController.toggleTask(req);
});
