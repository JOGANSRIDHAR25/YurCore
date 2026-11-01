import { NextRequest } from "next/server";
import { LearningAdminCredentialsController as C, type Ctx } from "@/backend/controller/learning.controller";

export const PATCH = (req: NextRequest, ctx: Ctx) => C.updateCategory(req, ctx);
