import { NextRequest } from "next/server";
import { LearningAdminCredentialsController as C, type Ctx } from "@/backend/controller/learning.controller";

export const GET = (req: NextRequest, ctx: Ctx) => C.courseFeedback(req, ctx);
