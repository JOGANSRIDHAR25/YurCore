import { NextRequest } from "next/server";
import { getProInboxController } from "@/backend/controller/pro-inbox.controller";

export async function GET(req: NextRequest) {
  return getProInboxController(req);
}
