"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, Paperclip, RefreshCw, Trash2, UploadCloud, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { UPLOAD_RULES, formatBytes } from "@/shared/learning/content";
import type { UploadKind } from "@/shared/learning/types";
import { uploadFile, type UploadHandle, type UploadedFile } from "../_lib/api";
import { ProgressBar, ghostBtn } from "./ui";

const typeLabel = (mime: string, name: string) => (name.includes(".") ? name.split(".").pop()!.toUpperCase() : mime.split("/").pop()?.toUpperCase() ?? "FILE");

/**
 * Drop zone → upload with progress → preview, with Replace and Remove.
 * Uploads go straight to Supabase Storage; `onUploaded` reports every new object so the editor can
 * discard uploads that end up unused.
 */
export function FileDrop({ courseId, kind, value, onChange, onUploaded, onBusy }: { courseId: string; kind: UploadKind; value: UploadedFile | null; onChange: (file: UploadedFile | null) => void; onUploaded: (path: string) => void; onBusy?: (busy: boolean) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const handle = useRef<UploadHandle | null>(null);
  const [drag, setDrag] = useState(false);
  const [progress, setProgress] = useState<{ name: string; sent: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rule = UPLOAD_RULES[kind];

  useEffect(() => () => handle.current?.cancel(), []);

  async function start(file: File) {
    setError(null);
    setProgress({ name: file.name, sent: 0, total: file.size });
    onBusy?.(true);
    const h = uploadFile(courseId, kind, file, (sent, total) => setProgress({ name: file.name, sent, total }));
    handle.current = h;
    try {
      const uploaded = await h.promise;
      onUploaded(uploaded.path);
      onChange(uploaded);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      if (msg !== "Upload cancelled") setError(msg);
    } finally {
      handle.current = null;
      setProgress(null);
      onBusy?.(false);
    }
  }

  const pick = () => input.current?.click();
  const fileInput = (
    <input
      ref={input}
      type="file"
      accept={rule.accept || undefined}
      className="hidden"
      onChange={(e) => {
        const f = e.target.files?.[0];
        e.target.value = "";
        if (f) start(f);
      }}
    />
  );

  if (progress) {
    const pct = progress.total ? Math.round((progress.sent / progress.total) * 100) : 0;
    return (
      <div className="rounded-2xl border border-herb-green/30 bg-herb-green/[0.03] p-5">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="min-w-0 truncate font-semibold text-foreground">Uploading {progress.name}</span>
          <button type="button" onClick={() => handle.current?.cancel()} className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"><X size={14} /> Cancel</button>
        </div>
        <ProgressBar value={pct} className="mt-3 h-2" />
        <p className="mt-2 text-xs text-muted-foreground">{pct}% · {formatBytes(progress.sent)} of {formatBytes(progress.total)}. Keep this window open until the upload finishes.</p>
      </div>
    );
  }

  if (value) {
    return (
      <div className="overflow-hidden rounded-2xl border border-border">
        {kind === "image" || kind === "thumbnail" ? (
          value.url && <img src={value.url} alt="" className="max-h-80 w-full bg-neutral-50 object-contain" />
        ) : kind === "video" ? (
          value.url && <video src={value.url} controls preload="metadata" className="max-h-80 w-full bg-black" />
        ) : value.mimeType === "application/pdf" && value.url ? (
          <iframe src={value.url} title={value.name} className="h-72 w-full bg-neutral-50" />
        ) : null}
        <div className="flex flex-wrap items-center gap-3 border-t border-border bg-background/60 px-4 py-3">
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-white text-muted-foreground ring-1 ring-border">
            {kind === "document" ? <FileText size={16} /> : <Paperclip size={16} />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">{value.name}</p>
            <p className="text-xs text-muted-foreground">{typeLabel(value.mimeType, value.name)} · {formatBytes(value.size)}</p>
          </div>
          {value.url && <a href={value.url} target="_blank" rel="noreferrer" className={ghostBtn + " !py-1.5 !text-xs"}>Open</a>}
          <button type="button" onClick={pick} className={ghostBtn + " !py-1.5 !text-xs"}><RefreshCw size={13} /> Replace</button>
          <button type="button" onClick={() => onChange(null)} className="inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"><Trash2 size={13} /> Remove</button>
        </div>
        {error && <p className="border-t border-red-100 bg-red-50 px-4 py-2 text-xs text-red-700">{error}</p>}
        {fileInput}
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={pick}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files?.[0];
          if (f) start(f);
        }}
        className={cn("flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors", drag ? "border-herb-green bg-herb-green/5" : "border-border hover:border-herb-green/50 hover:bg-background")}
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-herb-green/10 text-herb-green"><UploadCloud size={22} /></span>
        <span className="mt-3 text-sm font-semibold text-foreground">Drop a file here or <span className="text-herb-green">browse</span></span>
        <span className="mt-1 text-xs text-muted-foreground">{rule.label}</span>
      </button>
      {error && <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      {fileInput}
    </div>
  );
}
