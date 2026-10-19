import { NextRequest } from "next/server";
import { LearningAdminController as C, type Ctx } from "@/backend/controller/learning.controller";

export const GET = (req: NextRequest, ctx: Ctx) => C.learners(req, ctx);
