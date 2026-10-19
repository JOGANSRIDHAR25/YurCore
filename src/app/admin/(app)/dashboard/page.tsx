"use client";

import Link from "next/link";
import {
  useAdminDashboard,
  useAdminPractitioners,
  useAdminPatients,
  useAdminClinics,
  useAdminMedicines,
} from "@/hooks/use-admin";

const STATUS_STYLE: Record<string, string> = {
  verified: "bg-herb-green/10 text-herb-green",
  pending: "bg-amber-50 text-amber-700",
  rejected: "bg-red-50 text-red-600",
  suspended: "bg-red-50 text-red-600",
};

export default function AdminDashboardPage() {
  const { data: stats, loading: statsLoading } = useAdminDashboard();
  const { data: practitioners, loading: pracsLoading } = useAdminPractitioners();
  const { data: patients, loading: patientsLoading } = useAdminPatients();
  const { data: clinics, loading: clinicsLoading } = useAdminClinics();
  const { data: medicines, loading: medicinesLoading } = useAdminMedicines();

  if (statsLoading || pracsLoading || patientsLoading || clinicsLoading || medicinesLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-herb-green border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const recentPracs = (practitioners ?? []).slice(0, 5);
  const recentPatients = (patients ?? []).slice(0, 5);

  const statsList = [
    { label: "Total Patients", value: stats?.totalPatients ?? 0, delta: "Registered patients", icon: "👥", color: "text-herb-green" },
    { label: "Active Practitioners", value: stats?.totalPractitioners ?? 0, delta: `${stats?.pendingVerifications ?? 0} pending verification`, icon: "🩺", color: "text-copper" },
    { label: "Hospitals / Clinics", value: clinics?.length ?? 0, delta: "Partner centers", icon: "🏥", color: "text-herb-green" },
    { label: "Monthly Revenue", value: `₹${Math.round((stats?.revenue ?? 0) / 100)}`, delta: "Live DB summary", icon: "💰", color: "text-ayur-gold" },
    { label: "Total Orders", value: stats?.totalOrders ?? 0, delta: "All time orders", icon: "📦", color: "text-copper" },
    { label: "Medicines Listed", value: medicines?.length ?? 0, delta: "Drug catalog", icon: "💊", color: "text-herb-green" },
  ];

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Platform overview · June 2026</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
        {statsList.map((s) => (
          <div key={s.label} className="bg-white rounded-2xl border border-border p-4">
            <div className="text-xl mb-2">{s.icon}</div>
            <p className={`font-display text-xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5 font-medium">{s.label}</p>
            <p className="text-[9px] text-muted-foreground mt-1 leading-tight">{s.delta}</p>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        {[
          { label: "Add Practitioner", href: "/admin/practitioners", icon: "➕ 🩺" },
          { label: "Add Hospital", href: "/admin/hospitals", icon: "➕ 🏥" },
          { label: "Add Medicine", href: "/admin/medicines", icon: "➕ 💊" },
          { label: "View All Orders", href: "/admin/orders", icon: "📦" },
        ].map((a) => (
          <Link key={a.label} href={a.href}>
            <div className="bg-white rounded-xl border border-border p-4 hover:border-herb-green/40 hover:shadow-sm transition-all cursor-pointer text-center">
              <p className="text-sm mb-1">{a.icon}</p>
              <p className="text-xs font-semibold text-foreground">{a.label}</p>
            </div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent practitioners */}
        <div className="bg-white rounded-2xl border border-border overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <h2 className="font-semibold text-foreground text-sm">Recent Practitioner Registrations</h2>
            <Link href="/admin/practitioners" className="text-xs text-herb-green font-medium hover:underline">View all →</Link>
          </div>
          <div className="divide-y divide-border">
            {recentPracs.length === 0 ? (
              <p className="text-xs text-muted-foreground px-5 py-4">No practitioners registered yet.</p>
            ) : (
              recentPracs.map((p) => {
                const spec = (p.specializations ?? [])[0] ?? (p.disciplines ?? [])[0] ?? "General";
                const dateStr = p.created_at ? new Date(p.created_at).toLocaleDateString("en-IN", { day: '2-digit', month: 'short', year: 'numeric' }) : "";
                return (
                  <div key={p.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="w-8 h-8 rounded-xl bg-herb-green/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-herb-green text-xs font-bold">
                        {p.full_name ? p.full_name.split(" ").slice(-1)[0][0] : "P"}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{p.full_name}</p>
                      <p className="text-[10px] text-muted-foreground">{spec} · {p.experience_years ?? 0} yrs exp</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLE[p.verification_status] ?? "bg-gray-100 text-gray-700"}`}>
                        {p.verification_status}
                      </span>
                      <span className="text-[10px] text-muted-foreground">{dateStr}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Recent patients */}
        <div className="bg-white rounded-2xl border border-border overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <h2 className="font-semibold text-foreground text-sm">Recent Patient Registrations</h2>
            <Link href="/admin/patients" className="text-xs text-herb-green font-medium hover:underline">View all →</Link>
          </div>
          <div className="divide-y divide-border">
            {recentPatients.length === 0 ? (
              <p className="text-xs text-muted-foreground px-5 py-4">No patients registered yet.</p>
            ) : (
              recentPatients.map((p) => {
                const userObj = Array.isArray(p.user) ? p.user[0] : p.user;
                const contact = userObj?.mobile || userObj?.email || "No contact info";
                const dateStr = p.created_at ? new Date(p.created_at).toLocaleDateString("en-IN", { day: '2-digit', month: 'short', year: 'numeric' }) : "";
                const hasAbha = p.abha ? (Array.isArray(p.abha) ? p.abha.length > 0 : !!p.abha.abha_id) : false;
                return (
                  <div key={p.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="w-8 h-8 rounded-xl bg-sage/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-sage text-xs font-bold">
                        {p.full_name ? p.full_name[0] : "P"}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{p.full_name}</p>
                      <p className="text-[10px] text-muted-foreground">{contact}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {hasAbha
                        ? <span className="text-[10px] font-semibold text-herb-green bg-herb-green/10 px-2 py-0.5 rounded-full">ABHA ✓</span>
                        : <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">No ABHA</span>
                      }
                      <span className="text-[10px] text-muted-foreground">{dateStr}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
