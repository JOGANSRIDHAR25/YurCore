"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import { Ban, Download, Mail, Plus, RefreshCw, RotateCw, Search, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery } from "@/hooks/useQuery";
import { CREDIT_TYPE_LABEL, formatCredits } from "@/shared/learning/credits";
import type { AdminCertificateRow, AdminLearningSettings } from "@/shared/learning/types";
import { adminLearningApi } from "../_lib/api";
import { Card, ConfirmDialog, Field, Modal, Spinner, ghostBtn, iconBtn, inputCls, primaryBtn } from "./ui";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
const errMsg = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------
export function CategoriesSection() {
  const { data, loading, error, refetch } = useQuery(() => adminLearningApi.categories(), []);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await adminLearningApi.createCategory(name.trim());
      setName("");
      toast.success("Category added");
      refetch();
    } catch (err) {
      toast.error(errMsg(err, "Could not add the category"));
    } finally {
      setBusy(false);
    }
  }
  async function update(id: string, patch: { name?: string; active?: boolean }) {
    try {
      await adminLearningApi.updateCategory(id, patch);
      refetch();
      return true;
    } catch (err) {
      toast.error(errMsg(err, "Could not update the category"));
      return false;
    }
  }

  return (
    <Card title="Categories" description="Learners choose any number of favourite categories at Learning Setup; courses can have several. Deactivated categories are hidden from setup and filters (learners' saved choices are kept).">
      <form onSubmit={add} className="mb-4 flex gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="e.g. Panchakarma" className={inputCls} aria-label="New category name" />
        <button type="submit" disabled={busy || !name.trim()} className={primaryBtn}><Plus size={15} /> Add</button>
      </form>
      {loading && !data ? <Spinner className="mx-auto" /> : error ? <p className="text-sm text-amber-700">{error}</p> : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {data?.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted-foreground">No categories yet.</li>}
          {data?.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              {renaming?.id === c.id ? (
                <form className="flex flex-1 gap-2" onSubmit={async (e) => { e.preventDefault(); if (await update(c.id, { name: renaming.name })) setRenaming(null); }}>
                  <input autoFocus value={renaming.name} onChange={(e) => setRenaming({ id: c.id, name: e.target.value })} maxLength={80} className={inputCls} />
                  <button type="submit" className={primaryBtn}>Save</button>
                  <button type="button" onClick={() => setRenaming(null)} className={ghostBtn}>Cancel</button>
                </form>
              ) : (
                <>
                  <span className={cn("min-w-0 flex-1 text-sm font-semibold", c.active ? "text-foreground" : "text-muted-foreground line-through")}>{c.name}</span>
                  <span className="text-xs text-muted-foreground">{c.courses} {c.courses === 1 ? "course" : "courses"}</span>
                  <button type="button" onClick={() => setRenaming({ id: c.id, name: c.name })} className="text-xs font-semibold text-herb-green hover:underline">Rename</button>
                  <button type="button" onClick={() => update(c.id, { active: !c.active })} className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", c.active ? "bg-herb-green/10 text-herb-green" : "bg-neutral-100 text-muted-foreground")}>{c.active ? "Active" : "Inactive"}</button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Targets, credit year, issuer, reminders (one settings form)
// ---------------------------------------------------------------------------
export function SettingsForm({ part }: { part: "targets" | "issuer" | "emails" }) {
  const { data, loading, error, refetch } = useQuery(() => adminLearningApi.settings(), []);
  if (loading && !data) return <Spinner className="mx-auto" />;
  if (error || !data) return <p className="text-sm text-amber-700">{error ?? "Settings unavailable"} <button onClick={refetch} className="font-semibold underline">Retry</button></p>;
  return <SettingsEditor key={JSON.stringify(data)} initial={data} part={part} onSaved={refetch} />;
}

function SettingsEditor({ initial, part, onSaved }: { initial: AdminLearningSettings; part: "targets" | "issuer" | "emails"; onSaved: () => void }) {
  const [s, setS] = useState(initial);
  const [yearEnd, setYearEnd] = useState(initial.reminderYearEndDays.join(", "));
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof AdminLearningSettings>(k: K, v: AdminLearningSettings[K]) => setS((p) => ({ ...p, [k]: v }));

  async function save() {
    const days = yearEnd.split(/[,\s]+/).filter(Boolean).map(Number);
    if (days.some((d) => !Number.isInteger(d) || d < 1 || d > 366)) return toast.error("Year-end reminders must be whole numbers of days (1–366)");
    setSaving(true);
    try {
      const { signatureUrl: _sig, ...rest } = s;
      void _sig;
      await adminLearningApi.updateSettings({ ...rest, reminderYearEndDays: days });
      toast.success("Learning settings saved");
      onSaved();
    } catch (err) {
      toast.error(errMsg(err, "Could not save the settings"));
    } finally {
      setSaving(false);
    }
  }

  async function pickSignature(f: File | undefined) {
    if (!f) return;
    if (!["image/png", "image/jpeg"].includes(f.type)) return toast.error("Use a PNG or JPEG image");
    if (f.size > 1_000_000) return toast.error("The image must be 1 MB or smaller");
    const dataUrl = await new Promise<string>((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.onerror = () => rej(r.error);
      r.readAsDataURL(f);
    });
    try {
      await adminLearningApi.setSignature(dataUrl);
      toast.success("Signature uploaded. New certificates use it.");
      onSaved();
    } catch (err) {
      toast.error(errMsg(err, "Could not upload the signature"));
    }
  }

  const num = (v: string) => (v === "" ? 0 : Number(v));
  return (
    <Card
      title={part === "targets" ? "Targets & credit year" : part === "issuer" ? "Certificate issuer" : "Emails & reminders"}
      description={
        part === "targets"
          ? "The NCISM CME guidelines (30 Aug 2024) require 50 credit points within the 5 years before each registration renewal (phased in from 10 points for renewals due 1 Mar 2025 – 28 Feb 2026) and one 10-point elective per year. They set no annual target, so the annual default here is an administrative choice."
          : part === "issuer"
            ? "Printed on every certificate. Do not claim an accreditation or approval that has not been granted."
            : "Emails are sent from the Gmail account configured for the send-email function. Every email is sent at most once per learner and period."
      }
    >
      <div className="space-y-5">
        {part === "targets" && (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Default annual target (doctors)"><input type="number" min={0} step="any" value={s.defaultTarget} onChange={(e) => set("defaultTarget", num(e.target.value))} className={inputCls} /></Field>
              <Field label="Minimum target"><input type="number" min={0} step="any" value={s.minimumTarget} onChange={(e) => set("minimumTarget", num(e.target.value))} className={inputCls} /></Field>
              <Field label="Credit unit"><input value={s.creditUnit} maxLength={40} onChange={(e) => set("creditUnit", e.target.value)} className={inputCls} /></Field>
            </div>
            <Field label="Credit year starts in" hint="Calendar year by default (January). Dates are evaluated in IST. Changing it affects how current and future totals are grouped.">
              <select value={s.creditYearStartMonth} onChange={(e) => set("creditYearStartMonth", Number(e.target.value))} className={inputCls + " !w-56"}>
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </Field>
            <fieldset>
              <legend className="mb-2 text-[13px] font-semibold text-foreground">Credit types that count toward the target</legend>
              <div className="flex flex-wrap gap-4">
                {(Object.keys(CREDIT_TYPE_LABEL) as (keyof typeof CREDIT_TYPE_LABEL)[]).map((t) => (
                  <label key={t} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" className="h-4 w-4 accent-herb-green" checked={s.countedCreditTypes.includes(t)} onChange={(e) => set("countedCreditTypes", e.target.checked ? [...s.countedCreditTypes, t] : s.countedCreditTypes.filter((x) => x !== t))} />
                    {CREDIT_TYPE_LABEL[t]}
                  </label>
                ))}
              </div>
            </fieldset>
          </>
        )}
        {part === "issuer" && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Issuer name" required><input value={s.issuerName} maxLength={160} onChange={(e) => set("issuerName", e.target.value)} className={inputCls} /></Field>
              <Field label="Issuer address"><input value={s.issuerAddress} maxLength={300} onChange={(e) => set("issuerAddress", e.target.value)} className={inputCls} /></Field>
              <Field label="Authorised signatory name"><input value={s.signatoryName} maxLength={120} onChange={(e) => set("signatoryName", e.target.value)} className={inputCls} placeholder="Leave empty to omit" /></Field>
              <Field label="Signatory title"><input value={s.signatoryTitle} maxLength={160} onChange={(e) => set("signatoryTitle", e.target.value)} className={inputCls} /></Field>
            </div>
            <Field label="Accreditation statement" hint="Optional. Only state an accreditation that has actually been granted (e.g. an approval reference). Leave empty otherwise.">
              <textarea rows={2} value={s.accreditationStatement} maxLength={400} onChange={(e) => set("accreditationStatement", e.target.value)} className={inputCls} />
            </Field>
            <div className="flex flex-wrap items-center gap-3">
              {s.signatureUrl ? <img src={s.signatureUrl} alt="Signature" className="h-12 rounded border border-border bg-white px-2" /> : <span className="text-xs text-muted-foreground">No signature image</span>}
              <input ref={fileRef} type="file" accept="image/png,image/jpeg" hidden onChange={(e) => pickSignature(e.target.files?.[0])} />
              <button type="button" onClick={() => fileRef.current?.click()} className={ghostBtn}>Upload signature</button>
              {s.signatureUrl && <button type="button" onClick={async () => { await adminLearningApi.setSignature(null); onSaved(); }} className="text-xs font-semibold text-red-600 hover:underline">Remove</button>}
            </div>
          </>
        )}
        {part === "emails" && (
          <>
            <label className="flex items-center gap-2.5 text-sm"><input type="checkbox" className="h-4 w-4 accent-herb-green" checked={s.newCourseEmailsEnabled} onChange={(e) => set("newCourseEmailsEnabled", e.target.checked)} /> Email learners when a course in their interests is published</label>
            <label className="flex items-center gap-2.5 text-sm"><input type="checkbox" className="h-4 w-4 accent-herb-green" checked={s.remindersEnabled} onChange={(e) => set("remindersEnabled", e.target.checked)} /> Send annual target reminders</label>
            <div className={cn("space-y-3 border-l-2 border-border pl-4", !s.remindersEnabled && "opacity-50")}>
              <label className="flex items-center gap-2.5 text-sm"><input type="checkbox" className="h-4 w-4 accent-herb-green" disabled={!s.remindersEnabled} checked={s.reminderMonthly} onChange={(e) => set("reminderMonthly", e.target.checked)} /> Monthly progress reminder (once per calendar month)</label>
              <label className="flex items-center gap-2.5 text-sm"><input type="checkbox" className="h-4 w-4 accent-herb-green" disabled={!s.remindersEnabled || !s.reminderMonthly} checked={s.reminderOnlyWhenBehind} onChange={(e) => set("reminderOnlyWhenBehind", e.target.checked)} /> Monthly reminder only when the learner is behind</label>
              <Field label="Year-end reminders (days before year end)" hint="e.g. 60, 30, 7. One reminder when each threshold is reached.">
                <input value={yearEnd} disabled={!s.remindersEnabled} onChange={(e) => setYearEnd(e.target.value)} className={inputCls + " !w-56"} />
              </Field>
              <p className="text-xs text-muted-foreground">Learners who have met their target never get reminders. The NCISM guidelines do not prescribe a reminder schedule.</p>
            </div>
          </>
        )}
        <div className="flex justify-end">
          <button type="button" onClick={save} disabled={saving} className={primaryBtn}>{saving ? "Saving…" : "Save settings"}</button>
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Certificates
// ---------------------------------------------------------------------------
export function CertificatesSection() {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  const { data, loading, error, refetch } = useQuery(() => adminLearningApi.certificates(debounced), [debounced]);
  const [revoking, setRevoking] = useState<AdminCertificateRow | null>(null);
  const [reissuing, setReissuing] = useState<AdminCertificateRow | null>(null);

  return (
    <Card title="Certificates" description="Revoking adds a negative credit entry and shows Revoked on the public verify page. Reissuing keeps the number and records a new version.">
      <div className="relative mb-4">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by number, learner or course" className={inputCls + " pl-9"} />
      </div>
      {loading && !data ? <Spinner className="mx-auto" /> : error ? <p className="text-sm text-amber-700">{error}</p> : !data?.length ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No certificates issued{debounced ? " match your search" : " yet"}.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[46rem] text-sm">
            <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground"><th className="py-2 pr-3">Number</th><th className="py-2 pr-3">Learner</th><th className="py-2 pr-3">Course</th><th className="py-2 pr-3">Credits</th><th className="py-2 pr-3">Issued</th><th className="py-2 pr-3">Status</th><th className="py-2" /></tr></thead>
            <tbody>
              {data.map((c) => (
                <tr key={c.id} className="border-b border-border/60 last:border-0">
                  <td className="py-2.5 pr-3 font-mono text-xs">{c.number}{c.version > 1 ? ` v${c.version}` : ""}</td>
                  <td className="py-2.5 pr-3"><span className="font-semibold">{c.learnerName}</span>{c.email && <span className="block text-xs text-muted-foreground">{c.email}</span>}</td>
                  <td className="py-2.5 pr-3">{c.courseTitle}</td>
                  <td className="py-2.5 pr-3 tabular-nums">{c.credits > 0 ? `${formatCredits(c.credits)} ${CREDIT_TYPE_LABEL[c.creditType]}` : "—"}</td>
                  <td className="whitespace-nowrap py-2.5 pr-3">{fmt(c.issuedAt)}</td>
                  <td className="py-2.5 pr-3"><span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", c.status === "valid" ? "bg-herb-green/10 text-herb-green" : "bg-red-50 text-red-700")} title={c.revokeReason ?? undefined}>{c.status === "valid" ? "Valid" : "Revoked"}</span></td>
                  <td className="whitespace-nowrap py-2.5 text-right">
                    <button type="button" title="Download PDF" className={iconBtn} onClick={async () => { try { window.location.assign((await adminLearningApi.certificateDownload(c.id)).url); } catch (err) { toast.error(errMsg(err, "Could not download")); } }}><Download size={15} /></button>
                    {c.status === "valid" && <button type="button" title="Reissue" className={iconBtn} onClick={() => setReissuing(c)}><RotateCw size={15} /></button>}
                    {c.status === "valid" && <button type="button" title="Revoke" className={cn(iconBtn, "hover:text-red-600")} onClick={() => setRevoking(c)}><Ban size={15} /></button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {revoking && <ReasonDialog title={`Revoke ${revoking.number}`} confirm="Revoke certificate" danger message={`${revoking.learnerName} · ${revoking.courseTitle}. Its credits will be reversed.`} onClose={() => setRevoking(null)} onSubmit={async (reason) => { await adminLearningApi.revokeCertificate(revoking.id, reason); toast.success("Certificate revoked and credits reversed"); refetch(); }} />}
      {reissuing && <ReasonDialog title={`Reissue ${reissuing.number}`} confirm="Reissue certificate" withName={reissuing.learnerName} message="Same number, new version. Leave the name as is to use the learner's current profile details." onClose={() => setReissuing(null)} onSubmit={async (reason, name) => { await adminLearningApi.reissueCertificate(reissuing.id, { reason, learnerName: name && name !== reissuing.learnerName ? name : undefined }); toast.success("Certificate reissued"); refetch(); }} />}
    </Card>
  );
}

function ReasonDialog({ title, message, confirm, danger, withName, onClose, onSubmit }: { title: string; message: string; confirm: string; danger?: boolean; withName?: string; onClose: () => void; onSubmit: (reason: string, name?: string) => Promise<void> }) {
  const [reason, setReason] = useState("");
  const [name, setName] = useState(withName ?? "");
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={title} subtitle={message} onClose={onClose} busy={busy} footer={
      <>
        <button type="button" onClick={onClose} disabled={busy} className={ghostBtn}>Cancel</button>
        <button type="button" disabled={busy || reason.trim().length < 3} className={danger ? "inline-flex items-center justify-center gap-1.5 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60" : primaryBtn}
          onClick={async () => { setBusy(true); try { await onSubmit(reason.trim(), withName !== undefined ? name.trim() : undefined); onClose(); } catch (err) { toast.error(errMsg(err, "Could not complete the action")); } finally { setBusy(false); } }}>
          {busy ? "Working…" : confirm}
        </button>
      </>
    }>
      <div className="space-y-4">
        {withName !== undefined && <Field label="Learner name on certificate"><input value={name} onChange={(e) => setName(e.target.value)} maxLength={160} className={inputCls} /></Field>}
        <Field label="Reason" required><textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} className={inputCls} placeholder="Recorded with the certificate" /></Field>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Learner progress + manual credit adjustments
// ---------------------------------------------------------------------------
export function CreditsSection() {
  const { data, loading, error, refetch } = useQuery(() => adminLearningApi.learnerProgress(), []);
  const [adjusting, setAdjusting] = useState<{ userId: string; name: string } | null>(null);
  const STATUS = { target_met: ["Target met", "bg-herb-green/10 text-herb-green"], on_track: ["On track", "bg-neutral-100 text-foreground"], behind: ["Behind", "bg-amber-50 text-amber-800"] } as const;
  return (
    <Card title="Learner progress" description={data ? `Credit year ${data.year}. Manual adjustments are recorded in the learner's ledger with your reason.` : undefined} action={<button type="button" onClick={() => setAdjusting({ userId: "", name: "" })} className={ghostBtn}><Plus size={14} /> Manual adjustment</button>}>
      {loading && !data ? <Spinner className="mx-auto" /> : error ? <p className="text-sm text-amber-700">{error}</p> : !data?.rows.length ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No practitioner has set up their learning profile yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground"><th className="py-2 pr-3">Practitioner</th><th className="py-2 pr-3 text-right">Target</th><th className="py-2 pr-3 text-right">Completed</th><th className="py-2 pr-3 text-right">Remaining</th><th className="py-2 pr-3">Status</th><th className="py-2" /></tr></thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.userId} className="border-b border-border/60 last:border-0">
                  <td className="py-2.5 pr-3"><span className="font-semibold">{r.name}</span>{r.email && <span className="block text-xs text-muted-foreground">{r.email}</span>}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">{formatCredits(r.target)}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">{formatCredits(r.completed)} <span className="text-xs text-muted-foreground">({Math.round(r.percent)}%)</span></td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">{formatCredits(r.remaining)}</td>
                  <td className="py-2.5 pr-3"><span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", STATUS[r.status][1])}>{STATUS[r.status][0]}</span></td>
                  <td className="py-2.5 text-right"><button type="button" onClick={() => setAdjusting({ userId: r.userId, name: r.name })} className="text-xs font-semibold text-herb-green hover:underline">Adjust</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {adjusting && <AdjustDialog initial={adjusting} unit={data?.unit ?? "credits"} onClose={() => setAdjusting(null)} onDone={refetch} />}
    </Card>
  );
}

function AdjustDialog({ initial, unit, onClose, onDone }: { initial: { userId: string; name: string }; unit: string; onClose: () => void; onDone: () => void }) {
  const [who, setWho] = useState(initial);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ id: string; name: string }[]>([]);
  const [credits, setCredits] = useState("");
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }));
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (who.userId || q.trim().length < 2) return setResults([]);
    const t = setTimeout(() => adminLearningApi.searchPractitioners(q.trim()).then(setResults).catch(() => setResults([])), 250);
    return () => clearTimeout(t);
  }, [q, who.userId]);
  const value = Number(credits);
  const ok = who.userId && credits !== "" && Number.isFinite(value) && value !== 0 && reason.trim().length >= 3;
  return (
    <Modal title="Manual credit adjustment" subtitle="Added to the learner's ledger as a Manual adjustment. Use a negative number to deduct." onClose={onClose} busy={busy} footer={
      <>
        <button type="button" onClick={onClose} disabled={busy} className={ghostBtn}>Cancel</button>
        <button type="button" disabled={!ok || busy} className={primaryBtn} onClick={async () => {
          setBusy(true);
          try { await adminLearningApi.adjustCredits({ userId: who.userId, credits: value, reason: reason.trim(), date }); toast.success("Adjustment recorded"); onDone(); onClose(); }
          catch (err) { toast.error(errMsg(err, "Could not record the adjustment")); }
          finally { setBusy(false); }
        }}>{busy ? "Saving…" : "Record adjustment"}</button>
      </>
    }>
      <div className="space-y-4">
        <Field label="Practitioner" required>
          {who.userId ? (
            <div className="flex items-center justify-between rounded-xl border border-border px-3.5 py-2.5 text-sm"><span className="font-semibold">{who.name}</span><button type="button" onClick={() => setWho({ userId: "", name: "" })} className="text-xs font-semibold text-herb-green">Change</button></div>
          ) : (
            <div className="relative">
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name" className={inputCls} autoFocus />
              {results.length > 0 && (
                <ul className="absolute z-10 mt-1 w-full rounded-xl border border-border bg-white p-1 shadow-lg">
                  {results.map((r) => <li key={r.id}><button type="button" onClick={() => setWho({ userId: r.id, name: r.name })} className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-background">{r.name}</button></li>)}
                </ul>
              )}
            </div>
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={`Credits (${unit})`} required><input type="number" step="any" value={credits} onChange={(e) => setCredits(e.target.value)} className={inputCls} placeholder="e.g. 2.5 or -1" /></Field>
          <Field label="Date" hint="Decides the credit year."><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} /></Field>
        </div>
        <Field label="Reason" required><textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} className={inputCls} placeholder="e.g. Credits from an approved external CME (certificate attached to file)" /></Field>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Email deliveries
// ---------------------------------------------------------------------------
const KIND_LABEL = { new_course: "New course", target_reminder: "Target reminder", target_met: "Target met", course_completed: "Course completed" } as const;

export function DeliveriesSection() {
  const [status, setStatus] = useState("");
  const { data, loading, error, refetch } = useQuery(() => adminLearningApi.deliveries(status), [status]);
  const [running, setRunning] = useState(false);
  const [confirmRun, setConfirmRun] = useState(false);
  return (
    <Card
      title="Learning emails"
      description="Every learning email and its delivery status. Failed emails can be retried; a retry never sends a second copy of a delivered email."
      action={
        <div className="flex gap-2">
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls + " !w-auto !py-2"} aria-label="Filter by status">
            <option value="">All</option><option value="failed">Failed</option><option value="sent">Sent</option><option value="pending">Pending</option><option value="skipped">Skipped</option>
          </select>
          <button type="button" onClick={() => setConfirmRun(true)} disabled={running} className={ghostBtn}><Send size={14} /> {running ? "Running…" : "Run reminders now"}</button>
        </div>
      }
    >
      {loading && !data ? <Spinner className="mx-auto" /> : error ? <p className="text-sm text-amber-700">{error}</p> : !data?.length ? (
        <p className="flex flex-col items-center py-8 text-center text-sm text-muted-foreground"><Mail size={22} className="mb-2 opacity-50" /> No learning emails{status ? ` with status ${status}` : " yet"}.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[48rem] text-sm">
            <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground"><th className="py-2 pr-3">Type</th><th className="py-2 pr-3">Recipient</th><th className="py-2 pr-3">Subject</th><th className="py-2 pr-3">Status</th><th className="py-2 pr-3">Created</th><th className="py-2" /></tr></thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.id} className="border-b border-border/60 align-top last:border-0">
                  <td className="py-2.5 pr-3 whitespace-nowrap">{KIND_LABEL[d.kind]}</td>
                  <td className="py-2.5 pr-3"><span className="font-semibold">{d.learnerName}</span><span className="block text-xs text-muted-foreground">{d.recipient ?? "no email"}</span></td>
                  <td className="py-2.5 pr-3">{d.subject}{d.lastError && <span className="mt-0.5 block text-xs text-red-600">{d.lastError}</span>}</td>
                  <td className="py-2.5 pr-3"><span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", d.status === "sent" ? "bg-herb-green/10 text-herb-green" : d.status === "failed" ? "bg-red-50 text-red-700" : "bg-neutral-100 text-muted-foreground")}>{d.status}</span>{d.attempts > 1 && <span className="ml-1 text-xs text-muted-foreground">×{d.attempts}</span>}</td>
                  <td className="py-2.5 pr-3 whitespace-nowrap text-xs text-muted-foreground">{new Date(d.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                  <td className="py-2.5 text-right">{(d.status === "failed" || d.status === "pending") && <button type="button" onClick={async () => { try { await adminLearningApi.retryDelivery(d.id); toast.success("Email sent"); } catch (err) { toast.error(errMsg(err, "Retry failed")); } finally { refetch(); } }} className="inline-flex items-center gap-1 text-xs font-semibold text-herb-green hover:underline"><RefreshCw size={12} /> Retry</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {confirmRun && (
        <ConfirmDialog
          title="Run target reminders now?"
          message="Each practitioner who has not met their target gets at most one reminder for the current period (already-sent periods are skipped)."
          confirmLabel="Run reminders"
          tone="primary"
          onClose={() => setConfirmRun(false)}
          onConfirm={async () => {
            setRunning(true);
            try { const r = await adminLearningApi.runReminders(); toast.success(`${r.sent} reminder${r.sent === 1 ? "" : "s"} sent · ${r.skipped} skipped`); refetch(); }
            catch (err) { toast.error(errMsg(err, "Could not run reminders")); }
            finally { setRunning(false); }
          }}
        />
      )}
    </Card>
  );
}
