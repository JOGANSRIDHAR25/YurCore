import { SITE_NAME } from "@/shared/config/site";
import { OrderRepository, PlaceOrderInput } from "../repo/order.repo";
import { AppointmentsRepository } from "../repo/appointments.repo";
import { AuthUser } from "@/shared/auth/auth.types";
import { AppError } from "@/shared/api/api-error";

export class OrderService {
  static async getOrders(authUser: AuthUser) {
    const patientId = await AppointmentsRepository.getPatientIdFromUserId(authUser.id);
    if (!patientId) throw new AppError("Patient not found", 404);

    const data = await OrderRepository.getOrders(patientId);

    return (data ?? []).map((row: any) => ({
      id: row.id,
      number: row.id.slice(0, 8),
      date: row.created_at
        ? new Date(row.created_at).toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
        : "",
      status: row.status ?? "placed",
      tracking: row.tracking_number,
      eta: row.estimated_delivery
        ? new Date(row.estimated_delivery).toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
        : undefined,
      autoRefill: row.refill_order ?? false,
      items: (row.order_items ?? []).map((item: any) => ({
        name: item.medicine_name,
        brand: SITE_NAME,
        weight: "100g",
        price: Math.round((item.unit_price_paise ?? 0) / 100),
        icon: "💊",
        quantity: item.quantity,
      })),
      total: Math.round((row.total_paise ?? 0) / 100),
    }));
  }

  static async placeOrder(authUser: AuthUser, input: Omit<PlaceOrderInput, "patientId">) {
    const patientId = await AppointmentsRepository.getPatientIdFromUserId(authUser.id);
    if (!patientId) throw new AppError("Patient not found", 404);

    const orderId = await OrderRepository.placeOrder({ ...input, patientId });
    return { orderId };
  }
}
