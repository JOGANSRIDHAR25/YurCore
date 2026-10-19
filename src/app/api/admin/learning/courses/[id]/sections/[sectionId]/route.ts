import { NextRequest } from "next/server";
import { LearningAdminController as C, type Ctx } from "@/backend/controller/learning.controller";

export const PATCH = (req: NextRequest, ctx: Ctx) => C.updateSection(req, ctx);
export const DELETE = (req: NextRequest, ctx: Ctx) => C.deleteSection(req, ctx);
