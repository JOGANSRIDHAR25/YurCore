import { NextRequest } from "next/server";
import { getPractitionerReviewsController } from "@/backend/controller/discover.controller";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(req: NextRequest, context: RouteContext) {
  return getPractitionerReviewsController(req, context);
}
