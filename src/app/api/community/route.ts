import { NextRequest } from "next/server";
import { getCommunityController, postCommunityController } from "@/backend/controller/community.controller";

export async function GET(req: NextRequest) {
  return getCommunityController(req);
}

export async function POST(req: NextRequest) {
  return postCommunityController(req);
}
