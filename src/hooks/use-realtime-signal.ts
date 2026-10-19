"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type RealtimeTopicSet = { inbox: string | null; community: string | null };

const NO_TOPICS: RealtimeTopicSet = { inbox: null, community: null };
const COALESCE_MS = 150;

let topicsPromise: Promise<RealtimeTopicSet> | null = null;

function fetchTopics(): Promise<RealtimeTopicSet> {
  topicsPromise ??= fetch("/api/realtime", { credentials: "include", cache: "no-store" })
    .then(async (response) => {
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || "Unable to load realtime topics");
      return result.data as RealtimeTopicSet;
    })
    .catch((err) => {
      topicsPromise = null; // retry on next mount
      console.warn("Realtime unavailable, falling back to polling:", err);
      return NO_TOPICS;
    });
  return topicsPromise;
}

/** Realtime topic names the signed-in user may listen on (see /api/realtime). */
export function useRealtimeTopics(enabled = true): RealtimeTopicSet {
  const [topics, setTopics] = useState<RealtimeTopicSet>(NO_TOPICS);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void fetchTopics().then((t) => {
      if (!cancelled) setTopics(t);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return topics;
}

/**
 * Calls `onSignal` as soon as the server broadcasts a change on `topic`, and
 * again whenever the socket (re)connects or the tab becomes visible — so
 * anything missed while offline/backgrounded is picked up immediately.
 * Bursts are coalesced into one call.
 */
export function useRealtimeSignal(topic: string | null, onSignal: () => void): void {
  const callbackRef = useRef(onSignal);
  useEffect(() => {
    callbackRef.current = onSignal;
  }, [onSignal]);

  useEffect(() => {
    if (!topic) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const fire = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => callbackRef.current(), COALESCE_MS);
    };

    const supabase = createClient();
    let hasSubscribed = false;
    const channel = supabase
      .channel(topic)
      .on("broadcast", { event: "*" }, fire)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          // First join: the page already loaded its data. Rejoin: catch up.
          if (hasSubscribed) fire();
          hasSubscribed = true;
        }
      });

    const onVisible = () => {
      if (document.visibilityState === "visible") fire();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      void supabase.removeChannel(channel);
    };
  }, [topic]);
}
