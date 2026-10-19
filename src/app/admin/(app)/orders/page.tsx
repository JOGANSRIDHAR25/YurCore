"use client";

import { useState } from "react";
import { SITE_SHORT_CODE } from "@/shared/config/site";
import { cn } from "@/lib/utils";
import { useAdminOrders, updateOrderStatusApi as updateOrderStatus } from "@/hooks/use-admin";

type OrderStatus =
  | "placed"
  | "prescription_verified"
  | "packed"
  | "dispatched"
  | "out_for_delivery"
  | "delivered"
  | "cancelled"
  | "refund_initiated"
  | "refunded";

const STATUS_CONFIG: Record<OrderStatus, { label: string; style: string }> = {
  placed: { label: "Placed", style: "bg-blue-50 text-blue-700" },
  prescription_verified: { label: "Presc. Verified", style: "bg-teal-50 text-teal-700" },
  packed: { label: "Packed", style: "bg-amber-50 text-amber-700" },
  dispatched: { label: "Dispatched", style: "bg-herb-green/10 text-herb-green" },
  out_for_delivery: { label: "Out for Delivery", style: "bg-herb-green/10 text-herb-green" },
  delivered: { label: "Delivered", style: "bg-muted text-muted-foreground" },
  cancelled: { label: "Cancelled", style: "bg-red-50 text-red-600" },
  refund_initiated: { label: "Refund Initiated", style: "bg-red-50 text-red-600" },
  refunded: { label: "Refunded", style: "bg-red-50 text-red-600" },
};

const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  placed: "prescription_verified",
  prescription_verified: "packed",
  packed: "dispatched",
  dispatched: "out_for_delivery",
  out_for_delivery: "delivered",
};

export default function AdminOrdersPage() {
  const { data: rawOrders, loading, refetch } = useAdminOrders();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | OrderStatus>("all");
  const [selected, setSelected] = useState<any | null>(null);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-herb-green border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // Process and format orders
  const orders = (rawOrders ?? []).map((o: any) => {
    const patientObj = Array.isArray(o.patient) ? o.patient[0] : o.patient;
    const userObj = patientObj ? (Array.isArray(patientObj.user) ? patientObj.user[0] : patientObj.user) : null;
    const patientName = patientObj?.full_name ?? "Unknown Patient";
    const patientPhone = userObj?.mobile ?? "—";
    const city = patientObj?.city ?? "—";
    
    const formattedDate = o.created_at 
      ? new Date(o.created_at).toLocaleDateString("en-IN", { day: '2-digit', month: 'short', year: 'numeric' })
      : "—";

    const number = o.created_at 
      ? `${SITE_SHORT_CODE}-${new Date(o.created_at).toISOString().substring(2, 10).replace(/-/g, "")}-${o.id.substring(0, 4).toUpperCase()}`
      : `${SITE_SHORT_CODE}-${o.id.substring(0, 8).toUpperCase()}`;

    const items = (o.order_items ?? []).map((item: any) => ({
      name: item.medicine_name,
      qty: item.quantity,
      price: Math.round((item.total_price_paise ?? 0) / 100),
    }));

    const total = Math.round((o.total_paise ?? 0) / 100);
    const tracking = o.tracking_number ? `${o.logistics_partner ?? "Logistics"} · ${o.tracking_number}` : undefined;

    return {
      ...o,
      number,
      patientName,
      patientPhone,
      city,
      placed: formattedDate,
      items,
      total,
      tracking,
    };
  });

  const filtered = orders.filter((o) => {
    const matchSearch = o.patientName.toLowerCase().includes(search.toLowerCase()) ||
      o.number.toLowerCase().includes(search.toLowerCase()) ||
      o.city.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "all" || o.status === filterStatus;
    return matchSearch && matchStatus;
  });

  async function advanceStatus(id: string, currentStatus: OrderStatus) {
    const next = NEXT_STATUS[currentStatus];
    if (!next) return;
    try {
      // If we go to dispatched, we set a sample tracking number
      const trackingNo = next === "dispatched" ? `TRK-${Date.now().toString().slice(-8)}` : undefined;
      const logistics = next === "dispatched" ? "Delhivery" : undefined;
      await updateOrderStatus(id, next, trackingNo, logistics);
      refetch();
      setSelected(null);
    } catch (err: any) {
      alert(err.message ?? "Failed to advance order status");
    }
  }

  async function cancelOrder(id: string) {
    try {
      await updateOrderStatus(id, "cancelled");
      refetch();
      setSelected(null);
    } catch (err: any) {
      alert(err.message ?? "Failed to cancel order");
    }
  }

  const revenue = orders.filter(o => o.status === "delivered").reduce((s, o) => s + o.total, 0);

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-foreground">Orders</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{orders.length} total · ₹{revenue.toLocaleString("en-IN")} delivered revenue</p>
      </div>

      {/* Mini stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        {(["placed", "packed", "dispatched", "delivered", "cancelled"] as OrderStatus[]).map((s) => (
          <button key={s} onClick={() => setFilterStatus(filterStatus === s ? "all" : s)}
            className={cn("bg-white rounded-xl border p-3 text-center transition-all hover:border-herb-green/30",
              filterStatus === s ? "border-herb-green ring-1 ring-herb-green/20" : "border-border"
            )}>
            <p className={cn("font-bold text-lg font-display", STATUS_CONFIG[s]?.style.includes("herb") ? "text-herb-green" : "text-foreground")}>
              {orders.filter(o => o.status === s).length}
            </p>
            <p className="text-[10px] text-muted-foreground capitalize mt-0.5">{STATUS_CONFIG[s]?.label ?? s}</p>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 mb-5">
        <input type="text" placeholder="Search by patient, order number, city…" value={search} onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-48 px-3.5 py-2 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-herb-green/20 bg-white" />
      </div>

      <div className="bg-white rounded-2xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-background">
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Order</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Patient</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Items</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Placed</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((o) => (
                <tr key={o.id} className="hover:bg-background transition-colors">
                  <td className="px-5 py-3.5 font-mono text-xs text-muted-foreground">{o.number}</td>
                  <td className="px-4 py-3.5">
                    <p className="font-medium text-foreground">{o.patientName}</p>
                    <p className="text-[10px] text-muted-foreground">{o.city}</p>
                  </td>
                  <td className="px-4 py-3.5 text-xs text-muted-foreground">{o.items.length} item{o.items.length !== 1 ? "s" : ""}</td>
                  <td className="px-4 py-3.5 text-sm font-semibold text-foreground">₹{o.total}</td>
                  <td className="px-4 py-3.5">
                    <span className={cn("text-[10px] font-semibold px-2.5 py-1 rounded-full", STATUS_CONFIG[o.status as OrderStatus]?.style ?? "bg-gray-100 text-gray-700")}>
                      {STATUS_CONFIG[o.status as OrderStatus]?.label ?? o.status}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-xs text-muted-foreground">{o.placed}</td>
                  <td className="px-5 py-3.5 text-right">
                    <button onClick={() => setSelected(o)} className="text-[10px] font-semibold text-herb-green hover:underline">View</button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-5 py-12 text-center text-sm text-muted-foreground">No orders found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div>
                <h2 className="font-semibold text-foreground">{selected.number}</h2>
                <p className="text-xs text-muted-foreground">{selected.placed}</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-muted-foreground hover:text-foreground">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="px-6 py-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="font-semibold text-foreground">{selected.patientName}</p>
                  <p className="text-xs text-muted-foreground">{selected.patientPhone} · {selected.city}</p>
                </div>
                <span className={cn("text-[10px] font-semibold px-2.5 py-1 rounded-full", STATUS_CONFIG[selected.status as OrderStatus]?.style ?? "bg-gray-100 text-gray-700")}>
                  {STATUS_CONFIG[selected.status as OrderStatus]?.label ?? selected.status}
                </span>
              </div>
              <div className="space-y-2 mb-4">
                {selected.items.map((item: any, i: number) => (
                  <div key={i} className="flex justify-between text-xs py-1.5 border-b border-border last:border-0">
                    <span className="text-foreground">{item.name} × {item.qty}</span>
                    <span className="font-semibold">₹{item.price}</span>
                  </div>
                ))}
                <div className="flex justify-between text-sm font-bold pt-1">
                  <span>Total</span><span className="text-herb-green">₹{selected.total}</span>
                </div>
              </div>
              {selected.tracking && <p className="text-xs text-muted-foreground mb-4">Tracking: {selected.tracking}</p>}
              <div className="flex gap-2">
                {NEXT_STATUS[selected.status as OrderStatus] && (
                  <button onClick={() => advanceStatus(selected.id, selected.status)} className="flex-1 py-2.5 bg-herb-green text-white rounded-xl text-sm font-semibold hover:bg-herb-green/90 transition-all">
                    Mark as {STATUS_CONFIG[NEXT_STATUS[selected.status as OrderStatus]!]?.label}
                  </button>
                )}
                {(selected.status === "placed" || selected.status === "prescription_verified" || selected.status === "packed") && (
                  <button onClick={() => cancelOrder(selected.id)} className="px-4 py-2.5 border border-red-200 text-red-600 rounded-xl text-sm font-medium hover:bg-red-50 transition-colors">
                    Cancel
                  </button>
                )}
                {(selected.status === "delivered" || selected.status === "cancelled" || selected.status === "refunded") && (
                  <button onClick={() => setSelected(null)} className="flex-1 py-2.5 border border-border rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">Close</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
