import { NextRequest } from "next/server";
import { LearningAdminController as C, type Ctx } from "@/backend/controller/learning.controller";

export const GET = (req: NextRequest, ctx: Ctx) => C.details(req, ctx);
export const PATCH = (req: NextRequest, ctx: Ctx) => C.update(req, ctx);
export const DELETE = (req: NextRequest, ctx: Ctx) => C.remove(req, ctx);
