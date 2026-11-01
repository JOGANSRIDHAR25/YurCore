import { SITE_NAME, SITE_NAME_PARTS } from "@/shared/config/site";
import React from "react";
import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

/**
 * Course completion certificate: A4 landscape, server-rendered once and stored (AyurLearn spec, Feature 1).
 * Only base-14 PDF fonts are used, so rendering needs no network access. Every value comes from the
 * certificate record (snapshotted at completion) and the admin's issuer settings; nothing is invented here.
 */
export type CertificatePdfData = {
  number: string;
  learnerName: string;
  qualification: string | null;
  registrationNumber: string | null;
  courseTitle: string;
  creditsLabel: string | null; // e.g. "2.5 CME credits"; null when the course awards none
  completedOn: string; // formatted date
  issuedOn: string;
  verifyUrl: string;
  qrDataUrl: string;
  issuerName: string;
  issuerAddress: string;
  signatoryName: string;
  signatoryTitle: string;
  signatureDataUrl: string | null;
  accreditationStatement: string;
  version: number;
  revoked: boolean;
};

const INK = "#0f172a";
const MUTED = "#64748b";
const GREEN = "#047857";
const COPPER = "#b45309";

const s = StyleSheet.create({
  page: { padding: 22, backgroundColor: "#ffffff", fontFamily: "Helvetica", color: INK },
  frame: { flex: 1, borderWidth: 2, borderColor: GREEN, padding: 6 },
  inner: { flex: 1, borderWidth: 0.75, borderColor: "#a7f3d0", paddingHorizontal: 46, paddingTop: 30, paddingBottom: 24, position: "relative" },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  brand: { flexDirection: "row", alignItems: "baseline" },
  brandA: { fontSize: 22, fontFamily: "Helvetica-Bold", color: "#10b981" },
  brandB: { fontSize: 22, fontFamily: "Helvetica-Bold", color: COPPER },
  brandSub: { fontSize: 8.5, color: MUTED, marginTop: 3, letterSpacing: 0.6 },
  numberBox: { alignItems: "flex-end" },
  numberLabel: { fontSize: 7.5, color: MUTED, letterSpacing: 1, textTransform: "uppercase" },
  numberValue: { fontSize: 10.5, fontFamily: "Courier-Bold", marginTop: 2 },
  title: { marginTop: 22, textAlign: "center", fontSize: 30, fontFamily: "Times-Bold", color: GREEN, letterSpacing: 1.2 },
  subtitle: { marginTop: 4, textAlign: "center", fontSize: 10, color: MUTED, letterSpacing: 3, textTransform: "uppercase" },
  rule: { marginTop: 14, alignSelf: "center", width: 90, height: 1.5, backgroundColor: COPPER },
  lead: { marginTop: 16, textAlign: "center", fontSize: 11, color: MUTED },
  name: { marginTop: 6, textAlign: "center", fontSize: 26, fontFamily: "Times-BoldItalic", color: INK },
  credentials: { marginTop: 4, textAlign: "center", fontSize: 9.5, color: MUTED },
  body: { marginTop: 12, textAlign: "center", fontSize: 11, color: MUTED },
  course: { marginTop: 5, textAlign: "center", fontSize: 17, fontFamily: "Helvetica-Bold", color: INK, paddingHorizontal: 30 },
  facts: { marginTop: 16, flexDirection: "row", justifyContent: "center" },
  fact: { alignItems: "center", paddingHorizontal: 22, borderRightWidth: 0.75, borderColor: "#e2e8f0" },
  factLast: { alignItems: "center", paddingHorizontal: 22 },
  factLabel: { fontSize: 7.5, color: MUTED, letterSpacing: 1, textTransform: "uppercase" },
  factValue: { marginTop: 3, fontSize: 11.5, fontFamily: "Helvetica-Bold", color: INK },
  bottom: { position: "absolute", left: 46, right: 46, bottom: 22, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  sign: { width: 210 },
  signImg: { height: 38, objectFit: "contain", marginBottom: 2, alignSelf: "flex-start" },
  signLine: { borderTopWidth: 0.75, borderColor: "#94a3b8", paddingTop: 4 },
  signName: { fontSize: 10, fontFamily: "Helvetica-Bold" },
  signRole: { fontSize: 8.5, color: MUTED, marginTop: 1 },
  issuer: { flex: 1, alignItems: "center", paddingHorizontal: 12 },
  issuerText: { fontSize: 8.5, color: MUTED, textAlign: "center" },
  accreditation: { fontSize: 7.5, color: MUTED, textAlign: "center", marginTop: 4, maxWidth: 300 },
  qrBox: { width: 130, alignItems: "flex-end" },
  qr: { width: 74, height: 74 },
  qrLabel: { fontSize: 7, color: MUTED, marginTop: 3, textAlign: "right" },
  watermark: { position: "absolute", top: 210, left: 0, right: 0, textAlign: "center", fontSize: 72, fontFamily: "Helvetica-Bold", color: "#dc2626", opacity: 0.18, transform: "rotate(-18deg)" },
});

export function CertificatePdfDocument({ data }: { data: CertificatePdfData }) {
  const credentials = [data.qualification, data.registrationNumber && `Reg. No. ${data.registrationNumber}`].filter(Boolean).join("  ·  ");
  const facts = [
    data.creditsLabel ? { label: "Credits awarded", value: data.creditsLabel } : null,
    { label: "Completed on", value: data.completedOn },
    { label: "Issued on", value: data.issuedOn },
  ].filter(Boolean) as { label: string; value: string }[];

  return (
    <Document title={`Certificate ${data.number}`} author={data.issuerName} subject={data.courseTitle} creator={SITE_NAME}>
      <Page size="A4" orientation="landscape" style={s.page}>
        <View style={s.frame}>
          <View style={s.inner}>
            <View style={s.topRow}>
              <View>
                <View style={s.brand}>
                  <Text style={s.brandA}>{SITE_NAME_PARTS[0]}</Text>
                  <Text style={s.brandB}>{SITE_NAME_PARTS[1]}</Text>
                </View>
                <Text style={s.brandSub}>{SITE_NAME.toUpperCase()} LEARNING</Text>
              </View>
              <View style={s.numberBox}>
                <Text style={s.numberLabel}>Certificate No.</Text>
                <Text style={s.numberValue}>{data.number}</Text>
                {data.version > 1 && <Text style={[s.numberLabel, { marginTop: 2 }]}>Version {data.version}</Text>}
              </View>
            </View>

            <Text style={s.title}>Certificate of Completion</Text>
            <Text style={s.subtitle}>Continuing professional learning</Text>
            <View style={s.rule} />

            <Text style={s.lead}>This is to certify that</Text>
            <Text style={s.name}>{data.learnerName}</Text>
            {credentials ? <Text style={s.credentials}>{credentials}</Text> : null}
            <Text style={s.body}>has successfully completed the course</Text>
            <Text style={s.course}>{data.courseTitle}</Text>

            <View style={s.facts}>
              {facts.map((f, i) => (
                <View key={f.label} style={i === facts.length - 1 ? s.factLast : s.fact}>
                  <Text style={s.factLabel}>{f.label}</Text>
                  <Text style={s.factValue}>{f.value}</Text>
                </View>
              ))}
            </View>

            <View style={s.bottom}>
              <View style={s.sign}>
                {data.signatureDataUrl ? <Image src={data.signatureDataUrl} style={s.signImg} /> : null}
                {data.signatoryName ? (
                  <View style={s.signLine}>
                    <Text style={s.signName}>{data.signatoryName}</Text>
                    {data.signatoryTitle ? <Text style={s.signRole}>{data.signatoryTitle}</Text> : null}
                  </View>
                ) : null}
              </View>
              <View style={s.issuer}>
                <Text style={s.issuerText}>Issued by {data.issuerName}</Text>
                {data.issuerAddress ? <Text style={s.issuerText}>{data.issuerAddress}</Text> : null}
                {data.accreditationStatement ? <Text style={s.accreditation}>{data.accreditationStatement}</Text> : null}
              </View>
              <View style={s.qrBox}>
                <Image src={data.qrDataUrl} style={s.qr} />
                <Text style={s.qrLabel}>Scan to verify · {data.verifyUrl.replace(/^https?:\/\//, "")}</Text>
              </View>
            </View>

            {data.revoked ? <Text style={s.watermark}>REVOKED</Text> : null}
          </View>
        </View>
      </Page>
    </Document>
  );
}
