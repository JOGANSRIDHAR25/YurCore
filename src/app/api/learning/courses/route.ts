import { NextRequest } from "next/server";
import { LearningController as C } from "@/backend/controller/learning.controller";

export const GET = (req: NextRequest) => C.courses(req);
