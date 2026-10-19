import { NextRequest } from "next/server";
import { OrderService } from "../service/order.service";
import { getAuthUser } from "@/shared/auth/get-auth-user";
import { apiSuccess } from "@/shared/api/api-response";

export class OrderController {
  static async getOrders(req: NextRequest) {
    const authUser = await getAuthUser(req);
    const orders = await OrderService.getOrders(authUser);
    return apiSuccess(orders);
  }

  static async placeOrder(req: NextRequest) {
    const authUser = await getAuthUser(req);
    const body = await req.json();
    
    // In a real app we'd validate body with zod here
    const result = await OrderService.placeOrder(authUser, body);
    return apiSuccess(result, "Order placed successfully");
  }
}
