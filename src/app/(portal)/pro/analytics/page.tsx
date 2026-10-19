"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/auth-context";
import { usePractitionerAnalytics } from "@/hooks/use-analytics";

type Period = "7d" | "30d" | "90d";

const WEEKLY_REVENUE_FALLBACK = [
  { day: "Mon", consults: 3, revenue: 2400 },
  { day: "Tue", consults: 5, revenue: 4000 },
  { day: "Wed", consults: 2, revenue: 1600 },
  { day: "Thu", consults: 4, revenue: 3200 },
  { day: "Fri", consults: 6, revenue: 4800 },
  { day: "Sat", consults: 0, revenue: 0 },
  { day: "Sun", consults: 0, revenue: 0 },
];

const TOP_CONDITIONS = [
  { label: "Digestive disorders", count: 18, pct: 38 },
  { label: "Stress & sleep", count: 12, pct: 25 },
  { label: "Joint & musculoskeletal", count: 9, pct: 19 },
  { label: "Skin conditions", count: 5, pct: 10 },
  { label: "Others", count: 4, pct: 8 },
];

const RATING_DIST = [75, 18, 5, 2, 0];

export default function AnalyticsPage() {
  const { user } = useAuth();
  const { data: analytics, loading } = usePractitionerAnalytics(user?.id);
  const [period, setPeriod] = useState<Period>("30d");

  const maxRevenue = Math.max(...WEEKLY_REVENUE_FALLBACK.map((d) => d.revenue));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 rounded-full border-2 border-herb-green border-t-transparent animate-spin" />
      </div>
    );
  }

  const stats = analytics || {
    totalConsultations: 0,
    completedThisMonth: 0,
    totalRevenue: 0,
    revenueThisMonth: 0,
    avgRating: 0,
    totalRatings: 0,
    avgDuration: 0,
  };

  // Calculate gross, platform fee, and net payouts
  const grossEarned = stats.revenueThisMonth;
  const platformFee = Math.round(grossEarned * 0.05);
  const netPayout = grossEarned - platformFee;

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="font-display text-xl font-semibold text-foreground">Analytics</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Practice insights and performance metrics</p>
        </div>
        <div className="flex gap-1 bg-muted rounded-xl p-1">
          {(["7d", "30d", "90d"] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={cn(
                "px-4 py-2 text-xs font-medium rounded-lg transition-all",
                period === p ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {p === "7d" ? "This week" : p === "30d" ? "This month" : "Last 90 days"}
            </button>
          ))}
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          {
            label: "Consultations",
            value: period === "30d" ? stats.completedThisMonth.toString() : stats.totalConsultations.toString(),
            delta: period === "30d" ? "This Month" : "Total",
            up: true
          },
          {
            label: "Revenue",
            value: `₹${(period === "30d" ? stats.revenueThisMonth : stats.totalRevenue).toLocaleString()}`,
            delta: period === "30d" ? "This Month" : "Total Gross",
            up: true
          },
          {
            label: "Avg Rating",
            value: `${stats.avgRating} ★`,
            delta: `${stats.totalRatings} Reviews`,
            up: true
          },
          {
            label: "Avg Session",
            value: `${stats.avgDuration}m`,
            delta: "Duration",
            up: true
          },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-border p-4">
            <p className="font-display text-2xl font-bold text-foreground">{s.value}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{s.label}</p>
            <p className="text-[10px] font-medium mt-1 text-herb-green">
              {s.delta}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
        {/* Left */}
        <div className="space-y-5">
          {/* Revenue bar chart */}
          <div className="bg-white rounded-2xl border border-border p-5">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-semibold text-foreground text-sm">Revenue Distribution (Recent)</h3>
              <span className="text-xs text-muted-foreground font-medium">₹{(period === "30d" ? stats.revenueThisMonth : stats.totalRevenue).toLocaleString()}</span>
            </div>
            <div className="flex items-end gap-2 h-32">
              {WEEKLY_REVENUE_FALLBACK.map((d) => (
                <div key={d.day} className="flex-1 flex flex-col items-center gap-1.5">
                  <span className="text-[9px] text-muted-foreground">
                    {d.revenue > 0 ? `₹${(d.revenue / 1000).toFixed(0)}K` : ""}
                  </span>
                  <div
                    className={cn("w-full rounded-t-lg transition-all", d.revenue > 0 ? "bg-herb-green/80" : "bg-muted")}
                    style={{
                      height: maxRevenue > 0 ? `${Math.max((d.revenue / maxRevenue) * 88, d.revenue > 0 ? 8 : 0)}%` : "0%",
                    }}
                  />
                  <span className="text-[10px] text-muted-foreground">{d.day}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Consult volume */}
          <div className="bg-white rounded-2xl border border-border p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-foreground text-sm">Weekly Activity Trends</h3>
              <span className="text-xs text-muted-foreground">Completed consultations</span>
            </div>
            <div className="flex items-end gap-2 h-20">
              {WEEKLY_REVENUE_FALLBACK.map((d) => (
                <div key={d.day} className="flex-1 flex flex-col items-center gap-1.5">
                  <div
                    className={cn("w-full rounded-t-md", d.consults > 0 ? "bg-copper/60" : "bg-muted")}
                    style={{ height: `${(d.consults / 14) * 100}%`, minHeight: d.consults > 0 ? "4px" : "0" }}
                  />
                  <span className="text-[10px] text-muted-foreground">{d.day}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Top conditions */}
          <div className="bg-white rounded-2xl border border-border p-5">
            <h3 className="font-semibold text-foreground text-sm mb-4">Top Conditions Treated</h3>
            <div className="space-y-3">
              {TOP_CONDITIONS.map((c) => (
                <div key={c.label}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-foreground font-medium">{c.label}</span>
                    <span className="text-muted-foreground">{c.count} ({c.pct}%)</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-herb-green rounded-full transition-all"
                      style={{ width: `${c.pct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right */}
        <div className="space-y-4">
          {/* Mode split */}
          <div className="bg-white rounded-2xl border border-border p-5">
            <h3 className="font-semibold text-foreground text-sm mb-4">Consultation Mode</h3>
            <div className="space-y-3">
              {[
                { label: "Video Consultations", pct: 85, count: Math.round(stats.totalConsultations * 0.85), color: "bg-herb-green" },
                { label: "In-Clinic visits", pct: 15, count: Math.round(stats.totalConsultations * 0.15), color: "bg-copper" },
              ].map((m) => (
                <div key={m.label}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-medium text-foreground">{m.label}</span>
                    <span className="text-muted-foreground">{m.pct}% · {m.count} sessions</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full">
                    <div className={cn("h-full rounded-full", m.color)} style={{ width: `${m.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Ratings */}
          <div className="bg-ivory-deep rounded-2xl border border-border p-5">
            <h3 className="font-semibold text-foreground text-sm mb-3">Patient Feedback</h3>
            <div className="flex items-center gap-3 mb-4">
              <p className="font-display text-4xl font-bold text-foreground">{stats.avgRating || "0.0"}</p>
              <div>
                <div className="flex gap-0.5 text-amber-400">★★★★★</div>
                <p className="text-xs text-muted-foreground mt-0.5">{stats.totalRatings} ratings</p>
              </div>
            </div>
            {[5, 4, 3, 2, 1].map((star, i) => (
              <div key={star} className="flex items-center gap-2 mb-1.5">
                <span className="text-xs text-muted-foreground w-4">{star}</span>
                <div className="flex-1 h-1.5 bg-muted rounded-full">
                  <div
                    className="h-full bg-amber-400 rounded-full"
                    style={{ width: `${RATING_DIST[i]}%` }}
                  />
                </div>
                <span className="text-[10px] text-muted-foreground w-6 text-right">{RATING_DIST[i]}%</span>
              </div>
            ))}
          </div>

          {/* Earnings summary */}
          <div className="bg-white rounded-2xl border border-border p-5">
            <h3 className="font-semibold text-foreground text-sm mb-3">Earnings · This Month</h3>
            {[
              { label: "Gross Earnings", value: `₹${grossEarned.toLocaleString()}` },
              { label: "Platform fee (5%)", value: `−₹${platformFee.toLocaleString()}` },
              { label: "Net Payout Estimate", value: `₹${netPayout.toLocaleString()}` },
            ].map((e, i) => (
              <div
                key={e.label}
                className={cn(
                  "flex justify-between text-xs py-2 border-b border-border last:border-0",
                  i === 2 && "font-semibold text-herb-green"
                )}
              >
                <span className={i === 2 ? "text-foreground font-semibold" : "text-muted-foreground"}>
                  {e.label}
                </span>
                <span>{e.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
