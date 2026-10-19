import { cn } from "@/lib/utils";

interface HPRBadgeProps {
  hprId?: string;
  className?: string;
  showId?: boolean;
}

export function HPRBadge({ hprId, className, showId = false }: HPRBadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wider uppercase text-white bg-herb-green",
        className
      )}
      title={`Healthcare Professional Registry Verified${hprId ? ` · ${hprId}` : ""}`}
    >
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
        <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
      </svg>
      HPR Verified
      {showId && hprId && <span className="opacity-75 ml-0.5">· {hprId}</span>}
    </div>
  );
}

interface ABHABadgeProps {
  abhaId?: string;
  linked?: boolean;
  className?: string;
}

export function ABHABadge({ abhaId, linked = true, className }: ABHABadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border",
        linked
          ? "bg-herb-green/8 border-herb-green/20 text-herb-green"
          : "bg-muted border-border text-muted-foreground",
        className
      )}
    >
      <div className={cn("w-1.5 h-1.5 rounded-full", linked ? "bg-herb-green" : "bg-muted-foreground")} />
      <span>ABHA {linked ? "Linked" : "Not Linked"}</span>
      {abhaId && <span className="opacity-60">· {abhaId}</span>}
    </div>
  );
}
