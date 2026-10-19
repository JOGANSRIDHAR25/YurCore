"use client";

import { SITE_INITIAL, SITE_NAME, SITE_NAME_PARTS } from "@/shared/config/site";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/auth-context";
import { useUnreadInboxCount } from "@/hooks/use-inbox-unread";
import {
  Home,
  Calendar,
  Search,
  Sparkles,
  Sun,
  Folder,
  Activity,
  Bell,
  User,
  Crown,
  BarChart3,
  Edit,
  FileText,
  ClipboardList,
  CalendarDays,
  ShieldCheck,
  HelpCircle,
  ChevronRight,
  LogOut,
  Users,
  MessageSquare,
  UsersRound,
  GraduationCap
} from "lucide-react";
import React from "react";

type NavItem =
  | { 
      href: string; 
      icon: React.ComponentType<{ className?: string; size?: number }>; 
      label: string; 
      badge?: string; 
      exact?: boolean 
    }
  | "separator";

const PATIENT_NAV: NavItem[] = [
  { href: "/", icon: Home, label: "Home", exact: true },
  { href: "/appointments", icon: Calendar, label: "Appointments" },
  { href: "/discover", icon: Search, label: "Discover" },
  { href: "/messages", icon: MessageSquare, label: "Messages" },
  // { href: "/dinacharya", icon: Sun, label: "Dinacharya" },
  { href: "/records", icon: Folder, label: "Health Records" },
  // { href: "/apothecary", icon: Activity, label: "Apothecary" },
  { href: "/profile", icon: User, label: "Profile" },
  "separator",
  // { href: "/pro", icon: Crown, label: "YurCore Pro", badge: "Pro", exact: true },
];

const PRACTITIONER_NAV: NavItem[] = [
  {
    href: "/pro",
    icon: BarChart3,
    label: "Dashboard",
    exact: true,
  },
  {
    href: "/pro/patients",
    icon: Search,
    label: "Patient Search",
  },
  {
    href: "/pro/prescriptions",
    icon: ClipboardList,
    label: "Prescriptions",
  },
  {
    href: "/pro/inbox",
    icon: MessageSquare,
    label: "Inbox",
  },
  {
    href: "/pro/community",
    icon: UsersRound,
    label: "Community",
  },
  {
    href: "/pro/learning",
    icon: GraduationCap,
    label: `${SITE_NAME} Learning`,
  },
  "separator",
  {
    href: "/pro/availability",
    icon: CalendarDays,
    label: "Availability",
  },
  {
    href: "/pro/assistants",
    icon: Users,
    label: "Assistants",
  },
  {
    href: "/profile",
    icon: User,
    label: "Profile",
  },
];

interface AppSidebarProps {
  open: boolean;
  onClose: () => void;
}

function isActive(pathname: string, item: Exclude<NavItem, "separator">): boolean {
  if (item.exact) return pathname === item.href;
  return pathname.startsWith(item.href);
}

export function AppSidebar({ open, onClose }: AppSidebarProps) {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const isPractitioner = user?.role === "practitioner";
  const isAssistant = user?.role === "assistant";
  const showProNav = isPractitioner || isAssistant;
  const navItems = showProNav
    ? PRACTITIONER_NAV.filter((item) => !(isAssistant && item !== "separator" && (item.href === "/pro/assistants" || item.href === "/pro/community" || item.href === "/pro/learning")))
    : PATIENT_NAV;

  const inboxHref = showProNav ? "/pro/inbox" : "/messages";
  const inboxEndpoint = showProNav ? "/api/pro-inbox" : "/api/patient-inbox";
  const unreadInboxCount = useUnreadInboxCount(!!user, inboxEndpoint);

  const initials = user?.name
    ? user.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
    : "U";

  return (
    <>
      {open && (
        <div className="fixed inset-0 bg-black/40 z-40 lg:hidden backdrop-blur-xs" onClick={onClose} />
      )}

      <aside
        className={cn(
          "fixed top-0 left-0 h-full w-60 bg-white border-r border-border z-50 flex flex-col transition-transform duration-300 ease-in-out shadow-xs",
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Logo */}
        <div className="px-6 pt-6 pb-5 border-b border-border/60 flex-shrink-0">
          <Link href={showProNav ? "/pro" : "/"} onClick={onClose}>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-herb-gradient flex items-center justify-center shadow-xs">
                <span className="text-white text-base font-bold font-display">{SITE_INITIAL}</span>
              </div>
              <div>
                <span className="font-display text-lg font-bold tracking-tight text-foreground">
                  <span className="text-herb-green">{SITE_NAME_PARTS[0]}</span>
                  <span className="text-copper">{SITE_NAME_PARTS[1]}</span>
                </span>
                <p className="text-[10px] text-muted-foreground mt-0.5 leading-none">
                  {showProNav ? "Practitioner Portal · HPR" : "AYUSH Digital Health · ABDM"}
                </p>
              </div>
            </div>
          </Link>
        </div>

        {/* Scrollable Container (contains both Nav and Bottom widgets) */}
        <div className="flex-1 flex flex-col justify-between overflow-y-auto">
          {/* Nav */}
          <nav className="px-4 py-5 flex-1">
            {navItems.map((item, i) => {
              if (item === "separator") {
                return <div key={`sep-${i}`} className="my-3.5 h-px bg-border/50" />;
              }

              const active = isActive(pathname, item);
              const activeColor = showProNav ? "bg-copper/10 text-copper font-semibold" : "bg-herb-green/10 text-herb-green font-semibold";
              const activeIconColor = showProNav ? "text-copper" : "text-herb-green";
              const activeDotColor = showProNav ? "bg-copper" : "bg-herb-green";
              const badgeColor = showProNav ? "bg-copper/10 text-copper" : "bg-copper/10 text-copper";

              return (
                <Link key={`${item.href}-${item.label}`} href={item.href} onClick={onClose} className="group block">
                  <div
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-sans font-medium tracking-wide transition-all mb-1 select-none active:scale-[0.98]",
                      active 
                        ? activeColor 
                        : "text-muted-foreground/90 hover:bg-neutral-50 hover:text-foreground"
                    )}
                  >
                    <item.icon 
                      size={18} 
                      className={cn(
                        "flex-shrink-0 transition-transform duration-200 group-hover:scale-110",
                        active ? activeIconColor : "text-muted-foreground/60 group-hover:text-foreground"
                      )} 
                    />
                    <span className="flex-1">{item.label}</span>
                    {item.href === inboxHref && unreadInboxCount > 0 ? (
                      unreadInboxCount === 1 ? (
                        <span className="w-2 h-2 rounded-full bg-herb-green flex-shrink-0" />
                      ) : (
                        <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-herb-green text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                          {unreadInboxCount > 99 ? "99+" : unreadInboxCount}
                        </span>
                      )
                    ) : (
                      <>
                        {item.badge && !active && (
                          <span className={cn("text-[9px] font-extrabold px-1.5 py-0.5 rounded-full leading-none", badgeColor)}>
                            {item.badge}
                          </span>
                        )}
                        {active && <div className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", activeDotColor)} />}
                      </>
                    )}
                  </div>
                </Link>
              );
            })}
          </nav>

        </div>

        {/* User footer */}
        <div className="px-4 py-4 border-t border-border/60 bg-neutral-50/50 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <Link
                href="/profile"
                onClick={onClose}
                className="flex min-w-0 flex-1 items-center gap-2.5 cursor-pointer transition-opacity hover:opacity-85"
              >
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-herb-gradient shadow-xs">
                  <span className="font-display text-xs font-bold text-white">
                    {initials}
                  </span>
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-foreground">
                    {user?.name ?? "Guest"}
                  </p>

                  <p className="mt-0.5 truncate text-[9px] leading-none text-muted-foreground">
                    {user?.abhaLinked
                      ? "ABHA Linked · ABDM ✓"
                      : `+91 ${user?.phone ?? "—"}`}
                  </p>
                </div>
              </Link>
            <button
              onClick={logout}
              title="Sign out"
              className="p-2 rounded-xl text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-all flex-shrink-0 active:scale-95"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}