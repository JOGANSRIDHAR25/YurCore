import { NextRequest } from "next/server";
import { LearningController as C, type Ctx } from "@/backend/controller/learning.controller";

export const POST = (req: NextRequest, ctx: Ctx) => C.respond(req, ctx);
