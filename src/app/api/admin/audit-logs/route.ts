import { NextRequest } from "next/server";
import { getAuditLogsController } from "@/backend/controller/admin.controller";

export async function GET(req: NextRequest) {
  return getAuditLogsController(req);
}
