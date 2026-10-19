import { NextRequest } from "next/server";
import { onboardPatient, getMyPatientProfile } from "@/backend/controller/onboarding.controller";
import { withErrorHandler } from "@/backend/middleware/error.middleware";

export const GET = withErrorHandler((req: NextRequest) => getMyPatientProfile(req));
export const POST = withErrorHandler((req: NextRequest) => onboardPatient(req));

