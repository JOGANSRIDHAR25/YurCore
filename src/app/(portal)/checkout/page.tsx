"use client";

import { SITE_NAME } from "@/shared/config/site";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/auth-context";
import { placeOrderApi } from "@/hooks/use-order";

type Step = "address" | "payment" | "confirmed";

const PAYMENT_METHODS = [
  { id: "gpay", label: "Google Pay", icon: "🟢" },
  { id: "phonepe", label: "PhonePe", icon: "🟣" },
  { id: "upi", label: "UPI ID", icon: "🏦" },
  { id: "card", label: "Card", icon: "💳" },
];

export default function CheckoutPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [step, setStep] = useState<Step>("address");
  const [selectedPayment, setSelectedPayment] = useState("gpay");
  const [isProcessing, setIsProcessing] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);

  // Cart state loaded from localStorage
  const [cartItems, setCartItems] = useState<any[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem("meyveda_cart");
    if (saved) {
      try {
        setCartItems(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse cart items:", e);
      }
    } else {
      // Fallback defaults
      setCartItems([
        { name: "Ashwagandha Churna", brand: "Kottakkal", weight: "100g", price: 285, quantity: 1 },
        { name: "Triphala Churna", brand: "Himalaya", weight: "100g", price: 145, quantity: 1 },
        { name: "Brahmi Ghrita", brand: "Nagarjuna Herbal", weight: "150g", price: 410, quantity: 1 },
      ]);
    }
  }, []);

  // Address form state
  const [form, setForm] = useState({
    fullName: user?.name ?? "",
    phone: user?.phone ?? "",
    addressLine1: "23B, Green Valley",
    addressLine2: "MG Road",
    city: "Bengaluru",
    state: "Karnataka",
    pinCode: "560001",
  });

  const subtotal = cartItems.reduce((a, c) => a + c.price * c.quantity, 0);
  const shipping = 49;
  const total = subtotal + shipping;

  async function handlePlaceOrder() {
    if (!user?.id) return;
    setIsProcessing(true);
    try {
      const orderItems = cartItems.map((item) => ({
        medicineName: item.name,
        quantity: item.quantity,
        unitPricePaise: item.price * 100,
      }));

      const newOrderIdRes = await placeOrderApi({
        address: {
          fullName: form.fullName,
          phone: form.phone,
          addressLine1: form.addressLine1,
          addressLine2: form.addressLine2,
          city: form.city,
          state: form.state,
          pinCode: form.pinCode,
        },
        items: orderItems,
        shippingFeePaise: shipping * 100,
      });
      const newOrderId = (newOrderIdRes as any).orderId;

      setOrderId(newOrderId);
      // Clear cart
      localStorage.removeItem("meyveda_cart");
      setStep("confirmed");
    } catch (err) {
      console.error("Failed to place order:", err);
    } finally {
      setIsProcessing(false);
    }
  }

  if (step === "confirmed") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
        <div className="w-24 h-24 rounded-full bg-herb-green/10 border-4 border-herb-green flex items-center justify-center mb-6">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="oklch(0.29 0.09 158)" strokeWidth={2.5}>
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h1 className="font-display text-2xl font-bold text-foreground">Order Placed!</h1>
        <p className="text-muted-foreground text-sm mt-2">Expected delivery in 2-4 business days</p>
        {orderId && (
          <p className="text-xs text-muted-foreground mt-1 font-mono bg-muted px-3 py-1 rounded-full w-fit mx-auto">
            ID: {orderId}
          </p>
        )}
        <div className="flex gap-3 mt-8">
          <Link href="/orders">
            <button className="px-6 py-3 bg-herb-green text-white rounded-xl text-sm font-semibold hover:bg-herb-green/90 transition-all">
              Track Order
            </button>
          </Link>
          <Link href="/">
            <button className="px-6 py-3 border border-border text-sm font-medium rounded-xl hover:bg-muted transition-colors">
              Back to Home
            </button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-7xl mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-6">
        <button onClick={() => router.back()} className="hover:text-foreground transition-colors">
          Apothecary
        </button>
        <span>›</span>
        <span className="text-foreground font-medium">Checkout</span>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-3 mb-6">
        {[{ id: "address", label: "Address" }, { id: "payment", label: "Payment" }].map((s, i) => (
          <div key={s.id} className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className={cn("w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold",
                step === s.id || (s.id === "address" && step === "payment")
                  ? "bg-herb-green text-white" : "bg-muted text-muted-foreground")}>
                {i + 1}
              </div>
              <span className={cn("text-xs font-medium", step === s.id ? "text-foreground" : "text-muted-foreground")}>
                {s.label}
              </span>
            </div>
            {i === 0 && <div className="w-8 h-0.5 bg-border" />}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6">
        {/* Left: Form */}
        <div className="space-y-4">
          {step === "address" && (
            <>
              <div className="bg-white rounded-2xl border border-border p-5">
                <h3 className="font-semibold text-foreground text-sm mb-4">Delivery Address</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Full Name</label>
                    <input
                      type="text"
                      value={form.fullName}
                      onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                      placeholder="Recipient name"
                      className="w-full px-3 py-2.5 text-sm border border-border rounded-xl focus:outline-none focus:border-herb-green/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Phone</label>
                    <input
                      type="text"
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      placeholder="Phone number"
                      className="w-full px-3 py-2.5 text-sm border border-border rounded-xl focus:outline-none focus:border-herb-green/50"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Address Line 1</label>
                    <input
                      type="text"
                      value={form.addressLine1}
                      onChange={(e) => setForm({ ...form, addressLine1: e.target.value })}
                      placeholder="Flat / House No., Building"
                      className="w-full px-3 py-2.5 text-sm border border-border rounded-xl focus:outline-none focus:border-herb-green/50"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Address Line 2</label>
                    <input
                      type="text"
                      value={form.addressLine2}
                      onChange={(e) => setForm({ ...form, addressLine2: e.target.value })}
                      placeholder="Street, Area (optional)"
                      className="w-full px-3 py-2.5 text-sm border border-border rounded-xl focus:outline-none focus:border-herb-green/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">City</label>
                    <input
                      type="text"
                      value={form.city}
                      onChange={(e) => setForm({ ...form, city: e.target.value })}
                      placeholder="City"
                      className="w-full px-3 py-2.5 text-sm border border-border rounded-xl focus:outline-none focus:border-herb-green/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">State</label>
                    <input
                      type="text"
                      value={form.state}
                      onChange={(e) => setForm({ ...form, state: e.target.value })}
                      placeholder="State"
                      className="w-full px-3 py-2.5 text-sm border border-border rounded-xl focus:outline-none focus:border-herb-green/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">PIN Code</label>
                    <input
                      type="text"
                      value={form.pinCode}
                      onChange={(e) => setForm({ ...form, pinCode: e.target.value })}
                      placeholder="560001"
                      className="w-full px-3 py-2.5 text-sm border border-border rounded-xl focus:outline-none focus:border-herb-green/50"
                    />
                  </div>
                </div>
              </div>
              <button
                onClick={() => setStep("payment")}
                disabled={!form.fullName || !form.phone || !form.addressLine1 || !form.city || !form.state || !form.pinCode}
                className="w-full py-3.5 bg-herb-green text-white rounded-xl text-sm font-semibold hover:bg-herb-green/90 transition-all active:scale-95 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Continue to Payment
              </button>
            </>
          )}

          {step === "payment" && (
            <>
              <div className="bg-white rounded-2xl border border-border p-5">
                <h3 className="font-semibold text-foreground text-sm mb-4">Payment Method</h3>
                <div className="grid grid-cols-2 gap-2">
                  {PAYMENT_METHODS.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setSelectedPayment(m.id)}
                      className={cn("flex items-center gap-2 p-3 rounded-xl border text-left transition-all",
                        selectedPayment === m.id ? "border-herb-green bg-herb-green/5" : "border-border hover:border-herb-green/30")}
                    >
                      <span className="text-xl">{m.icon}</span>
                      <span className="text-xs font-medium text-foreground">{m.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setStep("address")} className="px-6 py-3 border border-border text-sm font-medium rounded-xl hover:bg-muted transition-colors">
                  Back
                </button>
                <button onClick={handlePlaceOrder} disabled={isProcessing}
                  className="flex-1 py-3 bg-herb-green text-white rounded-xl text-sm font-semibold hover:bg-herb-green/90 transition-all disabled:opacity-70">
                  {isProcessing ? "Processing…" : `Place Order · ₹${total}`}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Right: Summary */}
        <div>
          <div className="bg-white rounded-2xl border border-border p-5 sticky top-20">
            <h3 className="font-semibold text-foreground text-sm mb-4">Order Summary</h3>
            <div className="space-y-3 pb-4 border-b border-border max-h-[35vh] overflow-y-auto pr-1">
              {cartItems.map((item) => (
                <div key={item.name} className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-foreground">{item.name}</p>
                    <p className="text-[10px] text-muted-foreground">{item.brand || SITE_NAME} · {item.weight || `${item.quantity} Qty`}</p>
                  </div>
                  <span className="text-xs font-medium text-foreground flex-shrink-0">₹{item.price * item.quantity}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 space-y-2">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Subtotal</span><span>₹{subtotal}</span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Shipping</span><span>₹{shipping}</span>
              </div>
              <div className="flex justify-between font-bold text-foreground border-t border-border pt-2 mt-2">
                <span className="text-sm">Total</span>
                <span className="text-herb-green">₹{total}</span>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground text-center mt-3">
              Authentic AYUSH-certified products · Free returns within 7 days
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
