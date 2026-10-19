"use client";

import { useState } from "react";
import { siteConfig } from "@/shared/config/site";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { ENABLE_VIDEO_CONSULTATION } from "@/lib/feature-flags";

type FAQ = { q: string; a: string };

const FAQS: FAQ[] = [
  {
    q: "How do I book a consultation?",
    a: ENABLE_VIDEO_CONSULTATION
      ? "Go to Discover, search for a practitioner by symptom or name, pick a date and time slot, then complete the booking through the payment step. You'll get a confirmation and can join from Appointments or the Home screen."
      : "Go to Discover, search for a practitioner by symptom or name, pick a date and time slot, then tap 'Book Appointment'. You'll get a confirmation and can view it from Appointments or the Home screen. Payment is collected at the clinic.",
  },
  {
    q: "What is ABHA and why should I link it?",
    a: "ABHA (Ayushman Bharat Health Account) is your unique national health ID. Linking it lets you access health records from any ABDM-registered hospital or clinic and share them securely with practitioners.",
  },
  ...(ENABLE_VIDEO_CONSULTATION
    ? [{
      q: "How does video consultation work?",
      a: "Once your appointment time arrives, tap 'Join Room' from Appointments or the Home screen. You'll enter a secure encrypted video session. After the consult, your prescription is sent to your Health Records.",
    }]
    : []),
  {
    q: "Can I book for a family member?",
    a: "Yes. Add family members under Profile → Family Profiles. When booking, select 'Family Member' in the Patient step to book on their behalf.",
  },
  {
    q: "What is Dinacharya?",
    a: "Dinacharya is the Ayurvedic concept of a daily routine aligned with natural rhythms. The Dinacharya tracker helps you build and maintain personalised daily wellness habits prescribed by your practitioner.",
  },
  {
    q: "How do I cancel or reschedule?",
    a: "Go to Appointments → Upcoming, find the appointment, and tap 'Cancel'. Refunds are processed within 5–7 business days to your original payment method.",
  },
  {
    q: "Is my health data secure?",
    a: "Yes. All data is encrypted in transit (TLS 1.3) and at rest (AES-256). We comply with India's DPDPA 2023 and ABDM Health Data Management Policy. You control all consent explicitly.",
  },
];

const TOPICS = [
  ...(ENABLE_VIDEO_CONSULTATION ? [{ icon: "📹", label: "Video & Consultations", href: "#" }] : []),
  { icon: "💊", label: "Prescriptions & Medicines", href: "#" },
  { icon: "💳", label: "Payments & Refunds", href: "#" },
  { icon: "🔒", label: "Privacy & Account", href: "#" },
  { icon: "🌿", label: "Ayurveda & Dinacharya", href: "#" },
  { icon: "🛡️", label: "ABHA & ABDM", href: "/profile/abha" },
];

export default function HelpPage() {
  const [open, setOpen] = useState<number | null>(null);
  const [chatMsg, setChatMsg] = useState("");
  const [chatSent, setChatSent] = useState(false);

  function sendChat() {
    if (!chatMsg.trim()) return;
    setChatSent(true);
    setTimeout(() => { setChatSent(false); setChatMsg(""); }, 3000);
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-5">
        <Link href="/profile" className="hover:text-foreground transition-colors">Profile</Link>
        <span>/</span>
        <span className="text-foreground font-medium">Help & Support</span>
      </div>

      <h1 className="font-display text-xl font-semibold text-foreground mb-1">Help & Support</h1>
      <p className="text-sm text-muted-foreground mb-6">We&apos;re here to help. Browse FAQs or chat with us directly.</p>

      {/* Quick topics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
        {TOPICS.map((t) => (
          <Link key={t.label} href={t.href}>
            <div className="bg-white rounded-2xl border border-border p-4 flex items-center gap-3 hover:border-herb-green/30 hover:shadow-sm transition-all cursor-pointer">
              <span className="text-xl">{t.icon}</span>
              <p className="text-xs font-medium text-foreground leading-snug">{t.label}</p>
            </div>
          </Link>
        ))}
      </div>

      {/* FAQ */}
      <div className="bg-white rounded-2xl border border-border overflow-hidden mb-5">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-foreground text-sm">Frequently Asked Questions</h2>
        </div>
        <div className="divide-y divide-border">
          {FAQS.map((faq, i) => (
            <div key={i}>
              <button
                onClick={() => setOpen(open === i ? null : i)}
                className="w-full flex items-start justify-between gap-3 px-5 py-4 text-left hover:bg-muted/30 transition-colors"
              >
                <p className="text-sm font-medium text-foreground">{faq.q}</p>
                <svg
                  width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                  className={cn("flex-shrink-0 transition-transform mt-0.5 text-muted-foreground", open === i && "rotate-180")}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {open === i && (
                <div className="px-5 pb-4">
                  <p className="text-sm text-muted-foreground leading-relaxed">{faq.a}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Live support */}
      <div className="bg-white rounded-2xl border border-border p-5 mb-5">
        <h2 className="font-semibold text-foreground text-sm mb-1">Contact Support</h2>
        <p className="text-xs text-muted-foreground mb-4">Average response time: under 2 hours · Mon–Sat, 8 AM – 10 PM IST</p>
        {chatSent ? (
          <div className="flex items-center gap-2 text-herb-green text-sm font-medium py-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Message sent! We&apos;ll reply shortly.
          </div>
        ) : (
          <div className="space-y-3">
            <textarea
              rows={3}
              value={chatMsg}
              onChange={(e) => setChatMsg(e.target.value)}
              placeholder="Describe your issue…"
              className="w-full text-sm border border-border rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:border-herb-green/50 focus:ring-2 focus:ring-herb-green/10 transition-all placeholder:text-muted-foreground"
            />
            <button
              onClick={sendChat}
              disabled={!chatMsg.trim()}
              className={cn(
                "w-full py-2.5 rounded-xl text-sm font-semibold transition-all",
                chatMsg.trim() ? "bg-herb-green text-white hover:bg-herb-green/90 active:scale-95" : "bg-muted text-muted-foreground cursor-not-allowed"
              )}
            >
              Send Message
            </button>
          </div>
        )}
      </div>

      {/* Contact channels */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[
          { icon: "📞", label: "Call Support", sub: "1800-XXX-XXXX · Toll free" },
          { icon: "✉️", label: "Email Us", sub: siteConfig.supportEmail },
        ].map((c) => (
          <div key={c.label} className="bg-white rounded-2xl border border-border p-4 flex items-center gap-3">
            <span className="text-2xl">{c.icon}</span>
            <div>
              <p className="text-sm font-semibold text-foreground">{c.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{c.sub}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}