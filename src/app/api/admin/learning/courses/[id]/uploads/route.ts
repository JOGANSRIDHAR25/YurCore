import { NextRequest } from "next/server";
import { LearningAdminController as C, type Ctx } from "@/backend/controller/learning.controller";

export const POST = (req: NextRequest, ctx: Ctx) => C.createUpload(req, ctx);
export const DELETE = (req: NextRequest, ctx: Ctx) => C.discardUpload(req, ctx);
