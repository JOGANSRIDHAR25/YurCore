import "server-only";

import React from "react";
import QRCode from "qrcode";
import { renderToBuffer } from "@react-pdf/renderer";
import { CertificatePdfDocument, type CertificatePdfData } from "@/components/learning/CertificatePdfDocument";
import { computeTargetProgress, creditYearBounds, creditYearOf, formatCredits, CREDIT_TYPE_LABEL } from "@/shared/learning/credits";
import type { CertificateDto, LearningSettingsPublic, TargetSummary } from "@/shared/learning/types";
import { ROLES } from "@/shared/security/roles";
import { LearningProfileRepository as Repo, type CertificateRow, type LedgerRow, type SettingsRow } from "../repo/learning-profile.repo";

/**
 * Credits, targets and certificates: the single place where credit-year numbers are computed and where
 * certificates are issued and rendered. Issuing itself runs in one database transaction
 * (meyveda_learning_issue_certificate), which re-checks completion and feedback under a lock, so a
 * certificate and its credits are always created together and at most once per learner per course.
 */

/** Base URL for links in emails, QR codes and verification pages. Never a request Host header. */
export function appBaseUrl(): string {
  const url = (process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "").trim().replace(/\/+$/, "");
  if (!url) console.warn("[learning] APP_BASE_URL / NEXT_PUBLIC_APP_URL is not set: email and QR links will be relative");
  return url;
}

export const verifyUrlFor = (number: string) => `${appBaseUrl()}/verify/certificate/${encodeURIComponent(number)}/`;

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
export const formatIstDate = fmtDate;

export function creditsLabel(credits: number, type: "cme" | "participation" | "manual", unit: string): string {
  // "CME credits" is the admin's unit label; a participation course reads "2 Participation credits".
  const label = type === "cme" ? unit : `${CREDIT_TYPE_LABEL[type]} credits`;
  return `${formatCredits(credits)} ${credits === 1 ? label.replace(/s$/, "") : label}`;
}

export const LearningCredentials = {
  async settings(): Promise<SettingsRow> {
    return Repo.getSettings();
  },

  defaultTarget(settings: SettingsRow, role: string = ROLES.DOCTOR): number {
    const v = Number(settings.default_targets?.[role] ?? settings.default_targets?.doctor ?? settings.minimum_target);
    return Math.max(Number.isFinite(v) && v > 0 ? v : 1, Number(settings.minimum_target) || 0);
  },

  publicSettings(settings: SettingsRow): LearningSettingsPublic {
    return {
      creditYearStartMonth: settings.credit_year_start_month,
      defaultTarget: this.defaultTarget(settings),
      minimumTarget: Number(settings.minimum_target),
      creditUnit: settings.credit_unit_label,
    };
  },

  currentYear(settings: SettingsRow, now = new Date()): number {
    return creditYearOf(now, settings.credit_year_start_month);
  },

  yearRange(settings: SettingsRow, year: number) {
    const b = creditYearBounds(year, settings.credit_year_start_month);
    return { from: b.startsAt.toISOString(), before: b.endsBefore.toISOString() };
  },

  /** Ledger rows of one credit year that count toward the target (admin-configured credit types). */
  countedRows(rows: LedgerRow[], settings: SettingsRow): LedgerRow[] {
    const counted = new Set(settings.counted_credit_types);
    return rows.filter((r) => counted.has(r.credit_type));
  },

  /** When the running total (in ledger date order) last reached the target and stayed there. */
  targetMetOn(rows: LedgerRow[], target: number): string | null {
    let sum = 0;
    let metOn: string | null = null;
    for (const r of [...rows].sort((a, b) => a.awarded_on.localeCompare(b.awarded_on) || a.created_at.localeCompare(b.created_at))) {
      const before = sum;
      sum = Math.round((sum + r.credits) * 10) / 10;
      if (before < target && sum >= target) metOn = r.awarded_on;
      if (sum < target) metOn = null;
    }
    return metOn;
  },

  /**
   * Server-side progress for one learner and credit year: completed = Σ counted ledger rows in the year.
   * `target` defaults to the learner's saved target for that year, else the admin default.
   */
  async progress(userId: string, settings: SettingsRow, opts: { year?: number; now?: Date; target?: number } = {}): Promise<TargetSummary & { rows: LedgerRow[] }> {
    const now = opts.now ?? new Date();
    const year = opts.year ?? this.currentYear(settings, now);
    const [saved, ledger] = await Promise.all([opts.target === undefined ? Repo.getTarget(userId, year) : null, Repo.listLedger(userId, this.yearRange(settings, year))]);
    const target = opts.target ?? saved?.target_credits ?? this.defaultTarget(settings);
    const rows = this.countedRows(ledger, settings);
    const completed = rows.reduce((n, r) => n + r.credits, 0);
    const p = computeTargetProgress({ now, creditYear: year, startMonth: settings.credit_year_start_month, target, completed });
    return { ...p, targetMetOn: p.status === "target_met" ? this.targetMetOn(rows, target) : null, creditUnit: settings.credit_unit_label, rows };
  },

  toDto(c: CertificateRow): CertificateDto {
    return {
      id: c.id,
      number: c.certificate_number,
      courseId: c.course_id,
      courseTitle: c.course_title,
      learnerName: c.learner_name,
      credits: Number(c.credits_awarded),
      creditType: c.credit_type,
      completedAt: c.completed_at,
      issuedAt: c.issued_at,
      status: c.status,
      revokeReason: c.revoke_reason,
      version: c.version,
      verifyUrl: verifyUrlFor(c.certificate_number),
      pdfReady: Boolean(c.pdf_path && c.pdf_version === c.version),
    };
  },

  /** Learner identity for the certificate, from the practitioner profile (the source of truth). */
  async identity(userId: string): Promise<{ name: string; qualification: string | null; registrationNumber: string | null }> {
    const p = (await Repo.getPractitionerProfiles([userId])).get(userId);
    const qualification = p?.qualifications?.filter(Boolean).join(", ") || null;
    const registrationNumber = p?.reg_number ? [p.reg_number, p.reg_council].filter(Boolean).join(", ") : null;
    return { name: p?.full_name?.trim() || "Practitioner", qualification, registrationNumber };
  },

  /**
   * Issues the certificate if every rule is met (all content complete, feedback submitted when enabled).
   * Safe to call any number of times and concurrently: the database function issues at most once.
   */
  async issueIfEligible(userId: string, courseId: string): Promise<{ certificate: CertificateRow | null; created: boolean; reason: string }> {
    const who = await this.identity(userId);
    const r = await Repo.issueCertificate({ userId, courseId, learnerName: who.name, qualification: who.qualification, registrationNumber: who.registrationNumber });
    const certificate = r.certificateId ? await Repo.getCertificate(r.certificateId) : null;
    return { certificate, created: r.created, reason: r.reason };
  },

  /** Renders and stores the PDF for the certificate's current version (once per version). Returns the stored path. */
  async ensurePdf(cert: CertificateRow, settings?: SettingsRow): Promise<string> {
    if (cert.pdf_path && cert.pdf_version === cert.version) return cert.pdf_path;
    const s = settings ?? (await this.settings());
    const verifyUrl = verifyUrlFor(cert.certificate_number);
    const qrDataUrl = await QRCode.toDataURL(verifyUrl, { errorCorrectionLevel: "M", margin: 0, width: 300, color: { dark: "#0f172a", light: "#ffffff" } });
    let signatureDataUrl: string | null = null;
    if (s.signature_path) {
      const img = await Repo.downloadAsset(s.signature_path);
      if (img) signatureDataUrl = `data:${s.signature_path.endsWith(".png") ? "image/png" : "image/jpeg"};base64,${img.toString("base64")}`;
    }
    const credits = Number(cert.credits_awarded);
    const data: CertificatePdfData = {
      number: cert.certificate_number,
      learnerName: cert.learner_name,
      qualification: cert.qualification,
      registrationNumber: cert.registration_number,
      courseTitle: cert.course_title,
      creditsLabel: credits > 0 ? creditsLabel(credits, cert.credit_type, s.credit_unit_label) : null,
      completedOn: fmtDate(cert.completed_at),
      issuedOn: fmtDate(cert.issued_at),
      verifyUrl,
      qrDataUrl,
      issuerName: s.issuer_name,
      issuerAddress: s.issuer_address,
      signatoryName: s.signatory_name,
      signatoryTitle: s.signatory_title,
      signatureDataUrl,
      accreditationStatement: s.accreditation_statement,
      version: cert.version,
      revoked: cert.status === "revoked",
    };
    const pdf = await renderToBuffer(React.createElement(CertificatePdfDocument, { data }) as Parameters<typeof renderToBuffer>[0]);
    const path = `certificates/${cert.user_id}/${cert.id}-v${cert.version}.pdf`;
    await Repo.uploadCertificate(path, pdf);
    await Repo.setCertificatePdf(cert.id, path, cert.version);
    return path;
  },

  fileName(cert: CertificateRow) {
    return `${cert.certificate_number}.pdf`;
  },

  /**
   * The stored certificate PDF as an email attachment (same shape the invoice email uses). Renders it first when
   * it is missing or out of date, and refuses to return anything that is not a complete PDF, so an email is never
   * sent with an empty or broken attachment.
   */
  async emailAttachment(cert: CertificateRow, settings?: SettingsRow): Promise<{ filename: string; contentBase64: string }> {
    const path = await this.ensurePdf(cert, settings);
    const bytes = await Repo.downloadAsset(path);
    if (!bytes || !isCompletePdf(bytes)) throw new Error(`certificate ${cert.certificate_number} PDF is missing or invalid`);
    return { filename: attachmentName(cert.certificate_number), contentBase64: bytes.toString("base64") };
  },
};

/** "%PDF-" header and an "%%EOF" trailer near the end: enough to catch empty, truncated or non-PDF storage objects. */
export function isCompletePdf(bytes: Buffer): boolean {
  return bytes.length > 100 && bytes.subarray(0, 5).toString("latin1") === "%PDF-" && bytes.subarray(-1024).toString("latin1").includes("%%EOF");
}

/** YurCore_Certificate_AYL-2026-000001.pdf (anything outside A-Z, 0-9, - and _ removed). */
export function attachmentName(certificateNumber: string): string {
  return `YurCore_Certificate_${certificateNumber.replace(/[^A-Za-z0-9_-]/g, "") || "certificate"}.pdf`;
}
