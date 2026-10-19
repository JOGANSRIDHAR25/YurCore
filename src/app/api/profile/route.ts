import { NextRequest } from "next/server";
import { withErrorHandler } from "@/backend/middleware/error.middleware";
import { ProfileController } from "@/backend/controller/profile.controller";

export const GET = withErrorHandler(async (req: NextRequest) => {
  return ProfileController.getMyProfile(req);
});

export const PATCH = withErrorHandler(async (req: NextRequest) => {
  return ProfileController.updateMyProfile(req);
});