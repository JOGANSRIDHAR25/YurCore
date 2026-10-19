import { NextRequest } from "next/server";
import { LearningAdminController as C } from "@/backend/controller/learning.controller";

export const GET = (req: NextRequest) => C.searchPractitioners(req);
