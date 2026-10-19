import { createClient } from "@/shared/db/supabase.server";
import { AppError } from "@/shared/api/api-error";

export type OrderItemInput = {
  medicineId?: string;
  medicineName: string;
  quantity: number;
  unitPricePaise: number;
};

export type PlaceOrderInput = {
  patientId: string;
  address: {
    fullName: string;
    phone: string;
    addressLine1: string;
    addressLine2?: string;
    city: string;
    state: string;
    pinCode: string;
  };
  items: OrderItemInput[];
  shippingFeePaise: number;
};

export class OrderRepository {
  static async getOrders(patientId: string) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("orders")
      .select("*, order_items(*)")
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false });

    if (error) throw new AppError("Failed to fetch orders", 500);
    return data;
  }

  static async placeOrder(input: PlaceOrderInput): Promise<string> {
    const supabase = await createClient();
    
    // 1. Insert address
    const { data: addrData, error: addrError } = await supabase
      .from("patient_addresses")
      .insert({
        patient_id: input.patientId,
        label: "Home",
        full_name: input.address.fullName,
        phone: input.address.phone,
        address_line1: input.address.addressLine1,
        address_line2: input.address.addressLine2 || null,
        city: input.address.city,
        state: input.address.state,
        pin_code: input.address.pinCode,
        is_default: false,
      })
      .select("id")
      .single();

    if (addrError) throw new AppError("Failed to save address", 500);
    const addressId = addrData.id;

    // Calculate prices
    const subtotal = input.items.reduce((acc, item) => acc + item.unitPricePaise * item.quantity, 0);
    const total = subtotal + input.shippingFeePaise;

    // 2. Insert order
    const { data: orderData, error: orderError } = await supabase
      .from("orders")
      .insert({
        patient_id: input.patientId,
        address_id: addressId,
        status: "placed",
        subtotal_paise: subtotal,
        delivery_fee_paise: input.shippingFeePaise,
        total_paise: total,
      })
      .select("id")
      .single();

    if (orderError) throw new AppError("Failed to create order", 500);
    const orderId = orderData.id;

    // 3. Insert order items
    const itemsToInsert = input.items.map((item) => ({
      order_id: orderId,
      medicine_id: item.medicineId || null,
      medicine_name: item.medicineName,
      quantity: item.quantity,
      unit_price_paise: item.unitPricePaise,
      total_price_paise: item.unitPricePaise * item.quantity,
    }));

    const { error: itemsError } = await supabase
      .from("order_items")
      .insert(itemsToInsert);

    if (itemsError) throw new AppError("Failed to save order items", 500);

    return orderId;
  }
}
