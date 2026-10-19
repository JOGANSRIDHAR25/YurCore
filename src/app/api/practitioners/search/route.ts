import { NextRequest } from "next/server";
import { searchDoctors } from "@/backend/controller/assistant.controller";

export async function GET(req: NextRequest) {
  return searchDoctors(req);
}
