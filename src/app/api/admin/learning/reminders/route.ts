import { NextRequest } from "next/server";
import { LearningAdminCredentialsController as C } from "@/backend/controller/learning.controller";

export const POST = (req: NextRequest) => C.runReminders(req);
