"use client";

import { SITE_NAME } from "@/shared/config/site";
import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type Channel = "push" | "sms" | "email";

type PrefGroup = {
  id: string;
  label: string;
  icon: string;
  items: { id: string; label: string; channels: Record<Channel, boolean> }[];
};

const INITIAL_PREFS: PrefGroup[] = [
  {
    id: "appointments",
    label: "Appointments",
    icon: "🗓️",
    items: [
      { id: "appt-reminder", label: "Appointment reminders (24h & 1h)", channels: { push: true, sms: true, email: false } },
      { id: "appt-confirm", label: "Booking confirmations", channels: { push: true, sms: true, email: true } },
      { id: "appt-cancel", label: "Cancellation & rescheduling alerts", channels: { push: true, sms: true, email: false } },
    ],
  },
  {
    id: "medications",
    label: "Medications",
    icon: "🌿",
    items: [
      { id: "med-morning", label: "Morning medication reminder", channels: { push: true, sms: false, email: false } },
      { id: "med-evening", label: "Evening medication reminder", channels: { push: true, sms: false, email: false } },
      { id: "med-refill", label: "Prescription refill alerts", channels: { push: true, sms: true, email: true } },
    ],
  },
  {
    id: "dinacharya",
    label: "Dinacharya",
    icon: "🌅",
    items: [
      { id: "din-morning", label: "Morning routine nudge", channels: { push: true, sms: false, email: false } },
      { id: "din-weekly", label: "Weekly wellness summary", channels: { push: false, sms: false, email: true } },
    ],
  },
  {
    id: "orders",
    label: "Orders & Pharmacy",
    icon: "📦",
    items: [
      { id: "order-status", label: "Order dispatch & delivery updates", channels: { push: true, sms: true, email: false } },
      { id: "order-otp", label: "OTP for delivery confirmation", channels: { push: false, sms: true, email: false } },
    ],
  },
];

const QUIET_HOURS = ["None", "10 PM – 7 AM", "11 PM – 8 AM", "9 PM – 6 AM"];

export default function NotificationPrefsPage() {
  const [prefs, setPrefs] = useState(INITIAL_PREFS);
  const [quietHours, setQuietHours] = useState("10 PM – 7 AM");
  const [saved, setSaved] = useState(false);

  function toggleChannel(groupId: string, itemId: string, channel: Channel) {
    setPrefs((prev) =>
      prev.map((g) =>
        g.id !== groupId
          ? g
          : {
              ...g,
              items: g.items.map((item) =>
                item.id !== itemId
                  ? item
                  : { ...item, channels: { ...item.channels, [channel]: !item.channels[channel] } }
              ),
            }
      )
    );
  }

  function handleSave() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  const CHANNEL_LABELS: { key: Channel; label: string }[] = [
    { key: "push", label: "Push" },
    { key: "sms", label: "SMS" },
    { key: "email", label: "Email" },
  ];

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-5">
        <Link href="/profile" className="hover:text-foreground transition-colors">Profile</Link>
        <span>/</span>
        <span className="text-foreground font-medium">Notification Preferences</span>
      </div>

      <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="font-display text-xl font-semibold text-foreground">Notification Preferences</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Choose how and when {SITE_NAME} reaches you.</p>
        </div>
        <button
          onClick={handleSave}
          className={cn(
            "px-5 py-2.5 rounded-xl text-sm font-semibold transition-all",
            saved ? "bg-herb-green/20 text-herb-green" : "bg-herb-green text-white hover:bg-herb-green/90 active:scale-95"
          )}
        >
          {saved ? "Saved ✓" : "Save Changes"}
        </button>
      </div>

      {/* Column headers */}
      <div className="flex items-center gap-2 px-5 mb-2 justify-end">
        {CHANNEL_LABELS.map((c) => (
          <span key={c.key} className="w-12 text-center text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            {c.label}
          </span>
        ))}
      </div>

      {prefs.map((group) => (
        <div key={group.id} className="bg-white rounded-2xl border border-border mb-4 overflow-hidden">
          <div className="px-5 py-3 border-b border-border bg-muted/30 flex items-center gap-2">
            <span className="text-base">{group.icon}</span>
            <span className="text-sm font-semibold text-foreground">{group.label}</span>
          </div>
          <div className="divide-y divide-border">
            {group.items.map((item) => (
              <div key={item.id} className="flex items-center gap-2 px-5 py-3.5">
                <p className="text-sm text-foreground flex-1">{item.label}</p>
                {CHANNEL_LABELS.map((c) => (
                  <button
                    key={c.key}
                    onClick={() => toggleChannel(group.id, item.id, c.key)}
                    className={cn(
                      "w-12 h-5 rounded-full relative flex-shrink-0 transition-colors",
                      item.channels[c.key] ? "bg-herb-green" : "bg-muted"
                    )}
                  >
                    <span
                      className={cn(
                        "absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform",
                        item.channels[c.key] ? "translate-x-[28px]" : "translate-x-0.5"
                      )}
                    />
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Quiet hours */}
      <div className="bg-white rounded-2xl border border-border p-5">
        <h2 className="font-semibold text-foreground text-sm mb-1">Quiet Hours</h2>
        <p className="text-xs text-muted-foreground mb-3">No push notifications during these hours (SMS for emergencies still allowed).</p>
        <div className="flex gap-2 flex-wrap">
          {QUIET_HOURS.map((h) => (
            <button
              key={h}
              onClick={() => setQuietHours(h)}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
                quietHours === h ? "bg-herb-green text-white border-herb-green" : "border-border text-muted-foreground hover:border-herb-green/40"
              )}
            >
              {h}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
