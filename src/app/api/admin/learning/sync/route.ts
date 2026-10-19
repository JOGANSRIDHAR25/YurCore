import { NextRequest } from "next/server";
import { LearningAdminController as C } from "@/backend/controller/learning.controller";

export const POST = (req: NextRequest) => C.syncAll(req);
