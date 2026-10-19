"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Bell,
  BellOff,
  CalendarCheck2,
  CalendarClock,
  CalendarX2,
  CheckCheck,
  ChevronRight,
  ClipboardList,
  Receipt,
  UserRoundX,
  Video,
  Building2,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/auth-context";
import { usePatientUpcomingCalls } from "@/hooks/use-consultations";
import { useAppointments } from "@/hooks/use-appointments";
import {
  useNotifications,
  markNotificationReadApi,
  markAllNotificationsReadApi,
  emitNotificationsChanged,
} from "@/hooks/use-notification";

type FilterTab = "all" | "unread" | "upcoming" | "expired";

const TABS: { id: FilterTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "upcoming", label: "Upcoming" },
  { id: "expired", label: "Expired" },
];

type Category = "upcoming" | "missed" | "cancelled" | "confirmed" | "prescription" | "payment" | "general";

const CATEGORY_STYLE: Record<Category, { icon: LucideIcon; tone: string }> = {
  upcoming: { icon: CalendarClock, tone: "bg-emerald-50 text-emerald-700 ring-emerald-100" },
  confirmed: { icon: CalendarCheck2, tone: "bg-emerald-50 text-emerald-700 ring-emerald-100" },
  missed: { icon: UserRoundX, tone: "bg-amber-50 text-amber-700 ring-amber-100" },
  cancelled: { icon: CalendarX2, tone: "bg-rose-50 text-rose-600 ring-rose-100" },
  prescription: { icon: ClipboardList, tone: "bg-indigo-50 text-indigo-700 ring-indigo-100" },
  payment: { icon: Receipt, tone: "bg-sky-50 text-sky-700 ring-sky-100" },
  general: { icon: Bell, tone: "bg-slate-100 text-slate-600 ring-slate-200" },
};

type FeedItem = {
  id: string;
  /** DB notification id — only these can be marked read. */
  notificationId?: string;
  category: Category;
  title: string;
  body: string;
  isRead: boolean;
  /** When the item was created (sort key for activity). */
  createdAt: string;
  /** The appointment/session date this item is about, YYYY-MM-DD, if any. */
  eventDate?: string;
  /** Short right-hand label: "2h ago", "Tomorrow", … */
  meta: string;
  deepLink?: string | null;
  modeIcon?: LucideIcon;
};

function categorize(title: string, type: string): Category {
  const t = `${title} ${type}`.toLowerCase();
  if (t.includes("missed") || t.includes("closed") || t.includes("not available")) return "missed";
  if (t.includes("cancel")) return "cancelled";
  if (t.includes("prescription") || t.includes("medicine")) return "prescription";
  if (t.includes("payment") || t.includes("invoice")) return "payment";
  if (t.includes("appointment") || t.includes("session") || t.includes("waiting")) return "confirmed";
  return "general";
}

function toDayStart(dateStr: string): number | null {
  const d = new Date(dateStr.length === 10 ? `${dateStr}T00:00:00` : dateStr);
  if (isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function relativeDayLabel(dateStr: string): string {
  const day = toDayStart(dateStr);
  if (day === null) return "";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((day - today.getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return new Date(day).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

export default function NotificationsPage() {
  const { user } = useAuth();
  const isPatient = user?.role === "patient";
  const { data: notifications, loading, refetch } = useNotifications(user?.id);
  const { data: upcomingCalls } = usePatientUpcomingCalls(isPatient ? user?.id : undefined);
  const { data: appointments } = useAppointments(user?.id);
  const [filter, setFilter] = useState<FilterTab>("all");

  const todayStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, []);

  const feed = useMemo<FeedItem[]>(() => {
    const appts = (appointments ?? []) as any[];
    const apptDateById = new Map<string, string>(appts.map((a) => [a.id, a.dateRaw]));

    // Real notifications (missed, closed, cancelled, waiting-room, …).
    const activity: FeedItem[] = (notifications ?? []).map((n) => ({
      id: n.id,
      notificationId: n.id,
      category: categorize(n.title, n.type),
      title: n.title,
      body: n.body,
      isRead: n.isRead,
      createdAt: n.createdAt,
      eventDate: n.referenceType === "appointment" && n.referenceId ? apptDateById.get(n.referenceId) : undefined,
      meta: n.timeAgo,
      deepLink: n.deepLink,
    }));

    // Reminders for appointments that are still ahead (not cancelled/completed/missed).
    const reminders: FeedItem[] = appts
      .filter((a) => a.status === "upcoming")
      .map((a) => {
        const forName = a.bookedFor?.isFamilyMember ? ` for ${a.bookedFor.name}` : "";
        const withWhom = isPatient
          ? `Dr. ${String(a.doctor || "").replace(/^Dr\.?\s*/i, "")}`
          : a.bookedFor?.name || "your patient";
        const modeLabel = a.mode === "video" ? "Video consultation" : "In-clinic visit";
        return {
          id: `appt-${a.id}`,
          category: "upcoming" as const,
          title: isPatient ? `Upcoming appointment${forName}` : "Upcoming appointment",
          body: `${modeLabel} with ${withWhom} · ${a.date}`,
          isRead: true,
          createdAt: `${a.dateRaw}T${a.timeRaw || "00:00:00"}`,
          eventDate: a.dateRaw,
          meta: relativeDayLabel(a.dateRaw),
          deepLink: isPatient ? "/appointments" : "/pro",
          modeIcon: a.mode === "video" ? Video : Building2,
        };
      });

    // Follow-up sessions fixed from a prescription that have no appointment row yet.
    const sessions: FeedItem[] = (upcomingCalls ?? [])
      .filter((call: any) => !appts.some((a) => a.dateRaw === call.date && a.status !== "cancelled"))
      .map((call: any) => ({
        id: `session-${call.id}`,
        category: "upcoming" as const,
        title: "Follow-up session fixed",
        body: `With Dr. ${String(call.practitionerName || "").replace(/^Dr\.?\s*/i, "")} on ${call.date} at ${call.time}`,
        isRead: true,
        createdAt: call.createdAt,
        eventDate: call.date,
        meta: relativeDayLabel(call.date),
        deepLink: "/prescription",
      }));

    return [...activity, ...reminders, ...sessions];
  }, [notifications, appointments, upcomingCalls, isPatient]);

  const unreadCount = feed.filter((n) => !n.isRead).length;

  const counts: Record<FilterTab, number> = {
    all: feed.length,
    unread: unreadCount,
    upcoming: feed.filter((n) => n.eventDate && (toDayStart(n.eventDate) ?? 0) >= todayStart && n.category === "upcoming").length,
    expired: feed.filter((n) => n.eventDate && (toDayStart(n.eventDate) ?? Infinity) < todayStart).length,
  };

  const filtered = feed
    .filter((n) => {
      if (filter === "unread") return !n.isRead;
      if (filter === "upcoming") return n.category === "upcoming" && !!n.eventDate && (toDayStart(n.eventDate) ?? 0) >= todayStart;
      if (filter === "expired") return !!n.eventDate && (toDayStart(n.eventDate) ?? Infinity) < todayStart;
      return true;
    })
    .sort((a, b) => {
      // Upcoming reads soonest-first; everything else newest-first.
      if (filter === "upcoming") return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (a.isRead !== b.isRead) return a.isRead ? 1 : -1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  async function handleMarkRead(item: FeedItem) {
    if (!item.notificationId || item.isRead) return;
    await markNotificationReadApi(item.notificationId);
    refetch();
    emitNotificationsChanged();
  }

  async function handleMarkAllRead() {
    if (!user?.id) return;
    await markAllNotificationsReadApi();
    refetch();
    emitNotificationsChanged();
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-3xl mx-auto">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-xl font-semibold text-foreground">Notifications</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {unreadCount > 0 ? `${unreadCount} unread` : "You're all caught up"}
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={handleMarkAllRead}
            className="inline-flex items-center gap-1.5 text-xs text-herb-green font-semibold px-3 py-1.5 rounded-lg hover:bg-herb-green/5 transition-colors"
          >
            <CheckCheck size={14} />
            Mark all as read
          </button>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 bg-muted rounded-xl p-1 mb-6 w-full sm:w-fit" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={filter === tab.id}
            onClick={() => setFilter(tab.id)}
            className={cn(
              "px-4 py-2 text-sm font-medium rounded-lg transition-all whitespace-nowrap flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5",
              filter === tab.id ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
            {counts[tab.id] > 0 && (
              <span
                className={cn(
                  "text-[10px] font-semibold px-1.5 py-0.5 rounded-full tabular-nums",
                  tab.id === "unread" ? "bg-herb-green/15 text-herb-green" : "bg-slate-200/70 text-slate-600"
                )}
              >
                {counts[tab.id]}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading && !notifications && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-2xl border border-border p-4 h-20 animate-pulse">
              <div className="w-1/3 h-3 bg-muted rounded mb-2" />
              <div className="w-2/3 h-3 bg-muted rounded" />
            </div>
          ))}
        </div>
      )}

      {!(loading && !notifications) && filtered.length === 0 && (
        <div className="bg-white rounded-2xl border border-border p-12 text-center">
          <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mx-auto">
            <BellOff size={20} className="text-muted-foreground" />
          </div>
          <p className="font-semibold text-foreground mt-3">Nothing here</p>
          <p className="text-xs text-muted-foreground mt-1">
            {filter === "unread"
              ? "You have no unread notifications."
              : filter === "upcoming"
              ? "You have no upcoming appointments."
              : filter === "expired"
              ? "No past appointment updates."
              : "Notifications about your appointments will appear here."}
          </p>
        </div>
      )}

      {!(loading && !notifications) && filtered.length > 0 && (
        <ul className="space-y-3">
          {filtered.map((item) => {
            const style = CATEGORY_STYLE[item.category];
            const Icon = style.icon;
            const ModeIcon = item.modeIcon;
            const isPast = item.eventDate ? (toDayStart(item.eventDate) ?? Infinity) < todayStart : false;
            return (
              <li key={item.id}>
                <div
                  onClick={() => handleMarkRead(item)}
                  className={cn(
                    "group w-full text-left bg-white rounded-2xl border transition-all duration-200 relative",
                    item.notificationId && !item.isRead ? "cursor-pointer" : "",
                    item.isRead
                      ? "border-border/60 shadow-sm hover:shadow-md"
                      : "border-herb-green/30 shadow-[0_4px_20px_-4px_rgba(27,107,74,0.12)] bg-gradient-to-br from-white to-herb-green/[0.03]"
                  )}
                >
                  <div className="p-4 sm:p-5 flex items-start gap-4">
                    <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ring-1", style.tone)}>
                      <Icon size={18} strokeWidth={2} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <p className={cn("text-[15px] font-semibold leading-snug flex items-center gap-2", item.isRead ? "text-foreground/80" : "text-foreground")}>
                          {!item.isRead && <span className="w-2 h-2 rounded-full bg-herb-green flex-shrink-0" aria-label="Unread" />}
                          {item.title}
                        </p>
                        <span
                          className={cn(
                            "text-[11px] font-semibold flex-shrink-0 px-2 py-0.5 rounded-full border whitespace-nowrap",
                            !item.isRead
                              ? "text-herb-green border-herb-green/20 bg-herb-green/5"
                              : isPast
                              ? "text-slate-400 border-slate-200 bg-slate-50"
                              : "text-muted-foreground border-border bg-muted/50"
                          )}
                        >
                          {item.meta}
                        </span>
                      </div>

                      <p className="text-sm mt-1 leading-relaxed text-muted-foreground flex items-start gap-1.5">
                        {ModeIcon && <ModeIcon size={14} className="mt-[3px] flex-shrink-0 text-muted-foreground/70" />}
                        <span className="line-clamp-2">{item.body}</span>
                      </p>

                      {item.deepLink && (
                        <Link
                          href={item.deepLink}
                          onClick={(e) => e.stopPropagation()}
                          className="mt-2.5 inline-flex items-center gap-0.5 text-[12px] font-semibold text-herb-green hover:text-herb-green/80"
                        >
                          View details <ChevronRight size={13} />
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
