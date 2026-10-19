"use client";

import { SITE_INITIAL, SITE_NAME } from "@/shared/config/site";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/auth-context";

const NAV = [
  { href: "/admin/dashboard", label: "Dashboard", icon: "▦" },
  { href: "/admin/practitioners", label: "Practitioners", icon: "🩺" },
  { href: "/admin/hospitals", label: "Hospitals", icon: "🏥" },
  { href: "/admin/patients", label: "Patients", icon: "👥" },
  { href: "/admin/assistants", label: "Assistants", icon: "🧑‍💼" },
  { href: "/admin/learning", label: `${SITE_NAME} Learning`, icon: "▤" },
  { href: "/admin/medicines", label: "Medicines", icon: "💊" },
  { href: "/admin/orders", label: "Orders", icon: "📦" },
  { href: "/admin/audit-logs", label: "Audit Logs", icon: "📜" },
  { href: "/admin/profile", label: "Profile", icon: "👤" },
];

export default function AdminAppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!loading && (!user || (user.role !== "admin" && user.role !== "super_admin"))) {
      router.replace("/login");
    }
  }, [user, loading, router]);

  function handleSignOut() {
    logout();
  }

  if (loading || !user) return null;

  const Sidebar = () => (
    <aside className="w-60 flex-shrink-0 flex flex-col h-full" style={{ background: "oklch(0.14 0.030 268)" }}>
      {/* Brand */}
      <div className="px-5 py-5 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-herb-green flex items-center justify-center">
            <span className="text-white font-bold text-sm">{SITE_INITIAL}</span>
          </div>
          <div>
            <p className="text-white font-semibold text-sm leading-tight">{SITE_NAME}</p>
            <p className="text-white/40 text-[10px]">Admin Panel</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setSidebarOpen(false)}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all",
                active
                  ? "bg-herb-green text-white"
                  : "text-white/50 hover:text-white hover:bg-white/8"
              )}
            >
              <span className="text-base leading-none">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Admin user */}
      <div className="px-4 py-4 border-t border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-herb-green/20 flex items-center justify-center flex-shrink-0">
            <span className="text-herb-green text-xs font-bold">A</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-xs font-semibold truncate">{user.name}</p>
            <p className="text-white/40 text-[10px] truncate">{user.email}</p>
          </div>
          <button onClick={handleSignOut} title="Sign out" className="text-white/40 hover:text-white transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );

  return (
    <div className="h-screen flex overflow-hidden bg-background">
      {/* Desktop sidebar */}
      <div className="hidden lg:flex flex-col h-full">
        <Sidebar />
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSidebarOpen(false)} />
          <div className="relative flex flex-col h-full z-10">
            <Sidebar />
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-14 flex items-center justify-between px-4 sm:px-6 border-b border-border bg-white flex-shrink-0">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-muted-foreground hover:text-foreground">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs bg-herb-green/10 text-herb-green font-semibold px-2 py-0.5 rounded-full">Admin</span>
            <span className="text-sm font-medium text-foreground">{user.name}</span>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}