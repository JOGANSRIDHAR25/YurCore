import { NextRequest } from "next/server";
import { OrderController } from "@/backend/controller/order.controller";
import { withErrorHandler } from "@/backend/middleware/error.middleware";

export const GET = withErrorHandler(async (req: NextRequest) => {
  return OrderController.getOrders(req);
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  return OrderController.placeOrder(req);
});
