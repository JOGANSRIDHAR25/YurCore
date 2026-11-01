import { NextRequest } from "next/server";
import { LearningAdminCredentialsController as C, type Ctx } from "@/backend/controller/learning.controller";

export const POST = (req: NextRequest, ctx: Ctx) => C.reissue(req, ctx);
