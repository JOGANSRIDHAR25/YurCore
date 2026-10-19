import { NextRequest } from "next/server";
import { NavContextController } from "@/backend/controller/nav-context.controller";

export async function POST(request: NextRequest) {
  return NavContextController.create(request);
}

export async function GET(request: NextRequest) {
  return NavContextController.get(request);
}
