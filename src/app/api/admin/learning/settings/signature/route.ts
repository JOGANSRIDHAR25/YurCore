import { NextRequest } from "next/server";
import { LearningAdminCredentialsController as C } from "@/backend/controller/learning.controller";

export const PUT = (req: NextRequest) => C.setSignature(req);
