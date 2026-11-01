import { NextRequest } from "next/server";
import { LearningJobsController as C } from "@/backend/controller/learning.controller";

/** Target reminders. Call daily from a scheduler with Authorization: Bearer $LEARNING_CRON_SECRET (idempotent). */
export const POST = (req: NextRequest) => C.reminders(req);
