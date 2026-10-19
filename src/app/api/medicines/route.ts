import { NextRequest } from "next/server";
import { searchMedicinesController } from "@/backend/controller/medicine.controller";

export async function GET(req: NextRequest) {
  return searchMedicinesController(req);
}
