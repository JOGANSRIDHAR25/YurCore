import { NextRequest } from "next/server";
import { getFollowUpController, updateFollowUpController } from "@/backend/controller/follow-up.controller";

export async function GET(req: NextRequest) {
  return getFollowUpController(req);
}

export async function POST(req: NextRequest) {
  return updateFollowUpController(req);
}
