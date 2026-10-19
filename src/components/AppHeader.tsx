"use client";

import Link from "next/link";
import { SITE_NAME_PARTS } from "@/shared/config/site";
import { useEffect } from "react";
import { useAuth } from "@/contexts/auth-context";
import { useProfileCompletion } from "@/hooks/use-profile-completion";
import { useNotifications, NOTIFICATIONS_CHANGED_EVENT } from "@/hooks/use-notification";
import { Bell, Menu } from "lucide-react";
import { usePathname } from "next/navigation";

const NOTIFICATIONS_POLL_MS = 15000;

interface AppHeaderProps {
  onMenuClick: () => void;
}

function CompletionRing({ pct }: { pct: number }) {
  const size = 34;
  const stroke = 3.5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct / 100);
  const gradientId = "header-completion-ring-gradient";

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="flex-shrink-0 -rotate-90">
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#3B82F6" />
          <stop offset="100%" stopColor="#8B5CF6" />
        </linearGradient>
      </defs>
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#E0E7FF" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        className="transition-all duration-500"
      />
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="central"
        transform={`rotate(90 ${size / 2} ${size / 2})`}
        className="fill-indigo-700 font-bold"
        style={{ fontSize: 9.5 }}
      >
        {pct}%
      </text>
    </svg>
  );
}

export function AppHeader({ onMenuClick }: AppHeaderProps) {
  const { user } = useAuth();
  const pathname = usePathname();
  const isProRoute = pathname?.startsWith("/pro");
  const completion = useProfileCompletion();
  const { data: notifications, refetch: refetchNotifications } = useNotifications(user?.id);
  const unreadNotifCount = notifications?.filter((n) => !n.isRead).length ?? 0;

  // Poll for new notifications, and re-check right away whenever navigation
  // happens (e.g. the user just left /notifications after reading them).
  useEffect(() => {
    if (!user?.id) return;
    const interval = setInterval(refetchNotifications, NOTIFICATIONS_POLL_MS);
    return () => clearInterval(interval);
  }, [user?.id, refetchNotifications]);

  useEffect(() => {
    if (user?.id) refetchNotifications();
  }, [pathname, user?.id, refetchNotifications]);

  // Mark-as-read on the notifications page updates the dot right away.
  useEffect(() => {
    if (!user?.id) return;
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, refetchNotifications);
    return () => window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, refetchNotifications);
  }, [user?.id, refetchNotifications]);

  const initials = user?.name
    ? user.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
    : "U";

  return (
    <header className="sticky top-0 z-30 bg-white/70 backdrop-blur-md border-b border-border/50 h-16 flex items-center justify-between px-6 gap-4 transition-all duration-300">
      {/* Left: Mobile Trigger & Logo */}
      <div className="flex items-center gap-3 lg:hidden">
        <button
          onClick={onMenuClick}
          className="p-2 rounded-xl hover:bg-neutral-100 active:scale-95 transition-all text-neutral-600 flex-shrink-0"
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>

        <Link href="/" className="flex-shrink-0">
          <span className="font-display text-lg font-bold tracking-tight">
            <span className="text-herb-green">{SITE_NAME_PARTS[0]}</span>
            <span className="text-copper">{SITE_NAME_PARTS[1]}</span>
          </span>
        </Link>
      </div>

      {/* Right: Actions */}
      <div className="ml-auto flex items-center gap-2.5 flex-shrink-0">
        {/* Profile completion indicator — only while the profile is incomplete */}
        {completion.applicable && !completion.loading && completion.completed < completion.total && (
          <Link href="/profile/create-profile">
            <div className="hidden sm:flex items-center gap-3 pl-2.5 pr-5 py-2 rounded-full border border-indigo-100 bg-gradient-to-br from-blue-50 to-indigo-50/80 hover:border-indigo-200 hover:shadow-sm hover:shadow-indigo-200/60 transition-all duration-300 cursor-pointer">
              <CompletionRing pct={completion.pct} />
              <div className="flex flex-col gap-1.5">
                <span className="text-[12.5px] font-semibold text-indigo-900 leading-none whitespace-nowrap">
                  Complete Your Profile
                </span>
                <div className="w-36 h-[3px] rounded-full bg-indigo-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-500"
                    style={{ width: `${completion.pct}%` }}
                  />
                </div>
              </div>
            </div>
          </Link>
        )}

        {/* Notifications */}
        <Link
          href="/notifications"
          aria-label={unreadNotifCount > 0 ? `Notifications, ${unreadNotifCount} unread` : "Notifications"}
          className="relative p-2.5 rounded-xl hover:bg-neutral-100 text-neutral-600 transition-all active:scale-95"
        >
          <Bell size={18} />
          {unreadNotifCount > 0 && (
            <span className="absolute top-1.5 right-1.5 flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60 animate-ping" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500 border-2 border-white" />
            </span>
          )}
        </Link>

        {/* Vertical divider */}
        <div className="h-6 w-px bg-neutral-200/60 mx-1 hidden sm:block" />

        {/* User profile avatar */}
        <Link href="/profile">
          <div className="w-8.5 h-8.5 rounded-full bg-herb-gradient flex items-center justify-center cursor-pointer shadow-xs border border-white/20 transition-transform hover:scale-105 active:scale-95">
            <span className="text-white text-xs font-bold font-display">{initials}</span>
          </div>
        </Link>
      </div>
    </header>
  );
}