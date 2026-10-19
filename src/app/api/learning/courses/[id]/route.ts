import { NextRequest } from "next/server";
import { LearningController as C, type Ctx } from "@/backend/controller/learning.controller";

export const GET = (req: NextRequest, ctx: Ctx) => C.details(req, ctx);
