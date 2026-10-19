import { NextRequest } from "next/server";
import { getConsultationInvoiceController } from "@/backend/controller/consultation.controller";

type RouteContext = {
    params: Promise<{ id: string }>;
};

export async function GET(req: NextRequest, context: RouteContext) {
    return getConsultationInvoiceController(req, context);
}