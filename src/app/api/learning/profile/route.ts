import { NextRequest } from "next/server";
import { LearningController as C } from "@/backend/controller/learning.controller";

export const GET = (req: NextRequest) => C.profile(req);
/** Learning Setup: interests + this year's target, saved together. */
export const PUT = (req: NextRequest) => C.saveSetup(req);
