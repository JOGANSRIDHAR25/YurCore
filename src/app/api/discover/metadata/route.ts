import { NextRequest } from "next/server";
import { getDiscoverMetadataController } from "@/backend/controller/discover.controller";

export async function GET(req: NextRequest) {
  return getDiscoverMetadataController(req);
}
