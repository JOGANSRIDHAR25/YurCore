import { NextRequest } from "next/server";
import { LearningAdminCredentialsController as C } from "@/backend/controller/learning.controller";

/** Learners' target progress (GET) and manual credit adjustments (POST). */
export const GET = (req: NextRequest) => C.progress(req);
export const POST = (req: NextRequest) => C.adjustCredits(req);
