"use client";

import { useQuery } from "./useQuery";
import { apiClient } from "@/shared/api/api-client";

export type OrderItem = {
  name: string;
  brand: string;
  weight: string;
  price: number;
  icon: string;
};

export type Order = {
  id: string;
  number: string;
  date: string;
  status: string;
  items: OrderItem[];
  total: number;
  tracking?: string;
  eta?: string;
  autoRefill: boolean;
};

export type AddressInput = {
  fullName: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  pinCode: string;
};

export type OrderItemInput = {
  medicineId?: string;
  medicineName: string;
  quantity: number;
  unitPricePaise: number;
};

export type PlaceOrderInput = {
  patientId: string;
  address: AddressInput;
  items: OrderItemInput[];
  shippingFeePaise: number;
};

export function useOrders(patientId: string | undefined) {
  return useQuery<Order[]>(
    async () => {
      if (!patientId) return [];
      const response = await apiClient<{ data: Order[] }>("/api/order");
      return response.data;
    },
    [patientId]
  );
}

export async function placeOrderApi(input: Omit<PlaceOrderInput, "patientId">) {
  return await apiClient("/api/order", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
