import { NextRequest } from "next/server";
import { adminGetMedicinesController, adminCreateMedicineController } from "@/backend/controller/medicine.controller";

export async function GET(req: NextRequest) {
  return adminGetMedicinesController(req);
}

export async function POST(req: NextRequest) {
  return adminCreateMedicineController(req);
}
