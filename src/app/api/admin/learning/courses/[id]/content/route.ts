import { NextRequest } from "next/server";
import { LearningAdminController as C, type Ctx } from "@/backend/controller/learning.controller";

export const POST = (req: NextRequest, ctx: Ctx) => C.addContent(req, ctx);
