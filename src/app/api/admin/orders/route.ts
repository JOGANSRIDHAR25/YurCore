import { NextRequest } from "next/server";
import { getAdminOrdersController } from "@/backend/controller/admin.controller";

export async function GET(req: NextRequest) {
  return getAdminOrdersController(req);
}
