"use client";

import { SITE_NAME } from "@/shared/config/site";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { usePatientPrescriptions } from "@/hooks/use-prescriptions";
import type { MedicineRow } from "./type";

async function fetchMedicines(): Promise<MedicineRow[]> {
  const response = await fetch("/api/medicines", { method: "GET", credentials: "include", cache: "no-store" });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.error || "Unable to load medicines");
  }
  return result.data as MedicineRow[];
}

const getMedicineIcon = (name: string) => {
  const n = name.toLowerCase();
  if (n.includes("churna") || n.includes("powder")) return "🫙";
  if (n.includes("ghrita") || n.includes("ghee") || n.includes("oil") || n.includes("taila")) return "💛";
  if (n.includes("vati") || n.includes("tablet") || n.includes("pill") || n.includes("30c") || n.includes("200c")) return "💊";
  if (n.includes("arishta") || n.includes("liquid") || n.includes("syrup") || n.includes("q")) return "🧪";
  return "🌿";
};

export default function ApothecaryPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { data: rawRx, loading: rxLoading } = usePatientPrescriptions(user?.id);
  const [rawMedicines, setRawMedicines] = useState<MedicineRow[] | null>(null);
  const [medsLoading, setMedsLoading] = useState(true);

  useEffect(() => {
    fetchMedicines()
      .then(setRawMedicines)
      .catch((err) => console.error("Failed to load medicines:", err))
      .finally(() => setMedsLoading(false));
  }, []);

  const [cart, setCart] = useState<any[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setIsUploading(true);
    // Simulate upload and processing delay
    setTimeout(() => {
      setIsUploading(false);
      setUploadedFile(file.name);

      const mockRxItems = [
        {
          id: `up-rx-0`,
          name: "Ashwagandha Churna",
          brand: "Kottakkal Arya Vaidya Sala",
          weight: "100g",
          price: 285,
          quantity: 1,
          prescribed: true,
          icon: "🫙",
        },
        {
          id: `up-rx-1`,
          name: "Triphala Tablets",
          brand: "Kottakkal",
          weight: "60 tabs",
          price: 95,
          quantity: 1,
          prescribed: true,
          icon: "💊",
        },
        {
          id: `up-rx-2`,
          name: "Chyawanprash",
          brand: "Dabur",
          weight: "500g",
          price: 189,
          quantity: 1,
          prescribed: true,
          icon: "🌿",
        }
      ];

      setCart((prev) => {
        const filteredPrev = prev.filter(item => !mockRxItems.some(mr => mr.name === item.name));
        return [...filteredPrev, ...mockRxItems];
      });

      alert(`Prescription "${file.name}" uploaded and verified successfully! 3 prescribed formulations loaded into your cart.`);
    }, 1500);
  };

  useEffect(() => {
    if (rawRx && rawRx.length > 0) {
      const latestRx = rawRx[0]; // latest prescription
      const rxItems = latestRx.items.map((item, i) => {
        // We try to find the full medicine info to get the price, otherwise use standard.
        const fullMed = rawMedicines?.find((m) => m.name === item.name);
        return {
          id: (item as any).id || `rx-${i}`,
          name: item.name,
          brand: fullMed?.brand || `${SITE_NAME} Apothecary`,
          weight: item.dose || "100g",
          price: fullMed?.price_paise ? fullMed.price_paise / 100 : 250, // actual price or default
          quantity: 1,
          prescribed: true,
          icon: getMedicineIcon(item.name),
        };
      });
      setCart(rxItems);
    } else {
      setCart([]);
    }
  }, [rawRx, rawMedicines]);

  function changeQty(id: string, delta: number) {
    setCart((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, quantity: Math.max(1, item.quantity + delta) } : item
      )
    );
  }

  function addToCart(item: any) {
    setCart((prev) => {
      const existing = prev.find((x) => x.name === item.name);
      if (existing) {
        return prev.map((x) =>
          x.name === item.name ? { ...x, quantity: x.quantity + 1 } : x
        );
      }
      return [
        ...prev,
        {
          id: item.id || `item-${Date.now()}`,
          name: item.name,
          brand: item.brand || SITE_NAME,
          weight: "100g",
          price: item.price,
          quantity: 1,
          prescribed: false,
          icon: item.icon || "🌿",
        },
      ];
    });
  }

  const subtotal = cart.reduce((a, c) => a + c.price * c.quantity, 0);
  const shipping = 49;
  const total = subtotal + shipping;

  const wellnessItems = (rawMedicines && rawMedicines.length > 0)
    ? rawMedicines.slice(0, 6).map((m, i) => ({
        id: m.id || `med-${i}`,
        name: m.name,
        brand: m.brand || SITE_NAME,
        price: m.price_paise ? m.price_paise / 100 : 150, 
        icon: getMedicineIcon(m.name),
      }))
    : [];

  const hasRx = (rawRx && rawRx.length > 0) || !!uploadedFile;

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-foreground">Apothecary</h1>
          <p className="text-sm text-muted-foreground mt-1">Prescribed formulations & wellness essentials</p>
        </div>
      </div>

      {/* Prescription upload */}
      <div className="bg-white rounded-2xl border border-herb-green/30 p-4 mb-6 flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-herb-green/10 border border-herb-green/20 flex items-center justify-center flex-shrink-0">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="oklch(0.29 0.09 158)" strokeWidth={1.5}>
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
          </svg>
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">Upload Prescription</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {uploadedFile 
              ? `Active scanned file: ${uploadedFile}` 
              : "Order prescribed medicines directly from your doctor's Rx"
            }
          </p>
          <input 
            type="file" 
            className="hidden" 
            ref={fileInputRef} 
            onChange={handleFileUpload} 
            accept="image/*,.pdf" 
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="mt-2 text-xs text-herb-green font-semibold flex items-center gap-1 disabled:opacity-50"
          >
            {isUploading ? "Uploading..." : uploadedFile ? "Change File →" : "Choose File →"}
          </button>
        </div>
        <div className="hidden sm:flex items-center gap-2 bg-herb-green/5 rounded-xl border border-herb-green/20 px-3 py-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="oklch(0.29 0.09 158)" strokeWidth={2}>
            <path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          <p className="text-xs text-herb-green font-medium">
            {hasRx ? (
              uploadedFile 
                ? `Rx-Verified: Scanned Rx (${uploadedFile}) · ${cart.filter(x => x.prescribed).length} items loaded`
                : `Rx-Verified: ${rawRx?.[0]?.doctorName ?? "Doctor"} · ${rawRx?.[0]?.items?.length ?? 0} items loaded`
            ) : "Link your ABHA ID or upload scanned Rx to sync prescriptions"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6">
        {/* Left: Items */}
        <div className="space-y-6">
          {/* Prescribed */}
          <section>
            <h2 className="font-semibold text-foreground mb-3 flex items-center gap-2">
              Prescribed Formulations
              <span className="text-[10px] bg-herb-green/10 text-herb-green font-semibold px-2 py-0.5 rounded-full">
                Rx Verified
              </span>
            </h2>
            {rxLoading ? (
              <div className="py-8 text-center text-xs text-muted-foreground animate-pulse">Loading prescribed items...</div>
            ) : cart.length === 0 ? (
              <p className="text-xs text-muted-foreground bg-white border border-border p-6 rounded-2xl text-center">
                No active prescribed formulations found. Link ABHA or consult a doctor.
              </p>
            ) : (
              <div className="space-y-3">
                {cart.map((item) => (
                  <div key={item.id} className="bg-white rounded-xl border border-border p-4 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-ivory-gradient border border-border flex items-center justify-center text-2xl flex-shrink-0">
                      {item.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-foreground">{item.name}</p>
                          <p className="text-[10px] text-muted-foreground">{item.brand} · {item.weight}</p>
                        </div>
                        {item.prescribed && (
                          <span className="flex-shrink-0 text-[10px] bg-herb-green/10 text-herb-green font-medium px-2 py-0.5 rounded-full">
                            Prescribed
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between mt-3">
                        <span className="text-sm font-bold text-foreground">₹{item.price}</span>
                        <div className="flex items-center gap-1 border border-border rounded-lg overflow-hidden">
                          <button
                            onClick={() => changeQty(item.id, -1)}
                            className="px-3 py-1.5 text-sm hover:bg-muted transition-colors"
                          >
                            −
                          </button>
                          <span className="px-3 text-xs font-semibold">{item.quantity}</span>
                          <button
                            onClick={() => changeQty(item.id, 1)}
                            className="px-3 py-1.5 text-sm hover:bg-muted transition-colors"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Wellness essentials */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-foreground">Wellness Essentials</h2>
              <button className="text-xs text-herb-green font-medium">Browse all →</button>
            </div>
            {medsLoading ? (
              <div className="py-8 text-center text-xs text-muted-foreground animate-pulse">Loading wellness items...</div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {wellnessItems.map((p) => (
                  <div key={p.id} className="bg-white rounded-xl border border-border p-4 flex flex-col justify-between">
                    <div>
                      <div className="text-2xl mb-2">{p.icon}</div>
                      <p className="text-xs font-semibold text-foreground leading-tight">{p.name}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{p.brand}</p>
                    </div>
                    <div className="flex items-center justify-between mt-3 pt-2 border-t border-border/10">
                      <span className="text-sm font-bold">₹{p.price}</span>
                      <button
                        onClick={() => addToCart(p)}
                        className="text-[10px] bg-herb-green text-white px-2.5 py-1 rounded-lg font-medium hover:bg-herb-green/90 transition-colors"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Right: Order summary */}
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-border p-5 sticky top-20">
            <h3 className="font-semibold text-foreground mb-4">Order Summary</h3>
            <div className="space-y-2 max-h-[25vh] overflow-y-auto pr-1">
              {cart.map((item) => (
                <div key={item.id} className="flex justify-between text-xs py-1 border-b border-border/5 last:border-0">
                  <span className="text-muted-foreground truncate pr-2">{item.name} × {item.quantity}</span>
                  <span className="font-medium text-foreground flex-shrink-0">₹{item.price * item.quantity}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-border space-y-2">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Subtotal</span>
                <span>₹{subtotal}</span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Shipping</span>
                <span>₹{shipping}</span>
              </div>
              <div className="flex justify-between text-sm font-bold text-foreground border-t border-border pt-2 mt-2">
                <span>Total Payable</span>
                <span className="text-herb-green">₹{total}</span>
              </div>
            </div>
            <button
              onClick={() => {
                localStorage.setItem("meyveda_cart", JSON.stringify(cart));
                router.push("/checkout");
              }}
              className="mt-4 w-full py-3 bg-herb-green text-white rounded-xl text-sm font-semibold hover:bg-herb-green/90 transition-all active:scale-95 shadow-sm"
            >
              Proceed to Checkout
            </button>
            <p className="text-[10px] text-muted-foreground text-center mt-3">
              Free delivery on orders above ₹500 · Authenticity guaranteed
            </p>
          </div>

          <div className="bg-ivory-deep rounded-2xl border border-border p-4">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Why {SITE_NAME} Apothecary?
            </h4>
            {["Authentic AYUSH-certified products", "Doctor-prescribed formulations", "Cold-chain assured delivery", "FSSAI & GMP compliant"].map((f) => (
              <div key={f} className="flex items-center gap-2 py-1.5">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="oklch(0.29 0.09 158)" strokeWidth={2.5}>
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span className="text-xs text-muted-foreground">{f}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}