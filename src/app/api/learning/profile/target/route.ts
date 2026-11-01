import { NextRequest } from "next/server";
import { LearningController as C } from "@/backend/controller/learning.controller";

export const PUT = (req: NextRequest) => C.updateTarget(req);
