import { NextRequest } from "next/server";
import { LearningAdminCredentialsController as C } from "@/backend/controller/learning.controller";

export const GET = (req: NextRequest) => C.categories(req);
export const POST = (req: NextRequest) => C.createCategory(req);
