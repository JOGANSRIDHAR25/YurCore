import { NextRequest } from "next/server";
import { onboardDoctor, getMyDoctorProfile } from "@/backend/controller/onboarding.controller";
import { withErrorHandler } from "@/backend/middleware/error.middleware";

export const GET = withErrorHandler((req: NextRequest) => getMyDoctorProfile(req));
export const POST = withErrorHandler((req: NextRequest) => onboardDoctor(req));
