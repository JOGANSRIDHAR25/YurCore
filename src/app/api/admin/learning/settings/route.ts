import { NextRequest } from "next/server";
import { LearningAdminCredentialsController as C } from "@/backend/controller/learning.controller";

export const GET = (req: NextRequest) => C.settings(req);
export const PATCH = (req: NextRequest) => C.updateSettings(req);
