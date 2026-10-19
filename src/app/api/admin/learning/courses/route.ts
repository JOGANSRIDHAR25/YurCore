import { NextRequest } from "next/server";
import { LearningAdminController as C } from "@/backend/controller/learning.controller";

export const GET = (req: NextRequest) => C.list(req);
export const POST = (req: NextRequest) => C.create(req);
