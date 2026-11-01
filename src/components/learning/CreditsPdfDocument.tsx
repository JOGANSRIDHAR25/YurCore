import { SITE_NAME } from "@/shared/config/site";
import React from "react";
import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

/** Credit ledger statement (Credits page export), for submission to a council or employer. */
export type CreditsPdfData = {
  learnerName: string;
  credentials: string | null;
  periodLabel: string;
  generatedOn: string;
  rows: { date: string; course: string; type: string; credits: string; reason: string; certificate: string }[];
  total: string;
  unit: string;
};

const s = StyleSheet.create({
  page: { padding: 36, fontFamily: "Helvetica", fontSize: 9, color: "#0f172a" },
  brand: { fontSize: 16, fontFamily: "Helvetica-Bold", color: "#10b981" },
  title: { fontSize: 13, fontFamily: "Helvetica-Bold", marginTop: 10 },
  meta: { fontSize: 9, color: "#64748b", marginTop: 3 },
  table: { marginTop: 16, borderWidth: 0.75, borderColor: "#e2e8f0" },
  row: { flexDirection: "row", borderBottomWidth: 0.75, borderColor: "#e2e8f0" },
  head: { backgroundColor: "#f8fafc" },
  c1: { width: "12%", padding: 5 },
  c2: { width: "32%", padding: 5 },
  c3: { width: "13%", padding: 5 },
  c4: { width: "9%", padding: 5, textAlign: "right" },
  c5: { width: "18%", padding: 5 },
  c6: { width: "16%", padding: 5 },
  th: { fontFamily: "Helvetica-Bold", color: "#475569", fontSize: 8 },
  total: { flexDirection: "row", justifyContent: "flex-end", marginTop: 10, fontFamily: "Helvetica-Bold", fontSize: 10 },
  foot: { position: "absolute", bottom: 24, left: 36, right: 36, fontSize: 7.5, color: "#94a3b8" },
});

export function CreditsPdfDocument({ data }: { data: CreditsPdfData }) {
  return (
    <Document title={`Credit statement ${data.periodLabel}`} creator={SITE_NAME}>
      <Page size="A4" orientation="landscape" style={s.page}>
        <Text style={s.brand}>{SITE_NAME} Learning</Text>
        <Text style={s.title}>Credit statement · {data.periodLabel}</Text>
        <Text style={s.meta}>{data.learnerName}{data.credentials ? ` · ${data.credentials}` : ""}</Text>
        <Text style={s.meta}>Generated on {data.generatedOn}</Text>
        <View style={s.table}>
          <View style={[s.row, s.head]} fixed>
            <Text style={[s.c1, s.th]}>Date</Text>
            <Text style={[s.c2, s.th]}>Course</Text>
            <Text style={[s.c3, s.th]}>Type</Text>
            <Text style={[s.c4, s.th]}>Credits</Text>
            <Text style={[s.c5, s.th]}>Reason</Text>
            <Text style={[s.c6, s.th]}>Certificate</Text>
          </View>
          {data.rows.length === 0 ? (
            <View style={s.row}><Text style={{ padding: 8, color: "#64748b" }}>No credits in this period.</Text></View>
          ) : (
            data.rows.map((r, i) => (
              <View key={i} style={s.row} wrap={false}>
                <Text style={s.c1}>{r.date}</Text>
                <Text style={s.c2}>{r.course}</Text>
                <Text style={s.c3}>{r.type}</Text>
                <Text style={s.c4}>{r.credits}</Text>
                <Text style={s.c5}>{r.reason}</Text>
                <Text style={s.c6}>{r.certificate}</Text>
              </View>
            ))
          )}
        </View>
        <View style={s.total}><Text>Total: {data.total} {data.unit}</Text></View>
        <Text style={s.foot} fixed>Certificates can be verified at the address printed on each certificate. Credits are recorded by {SITE_NAME} Learning; recognition for registration renewal is decided by the relevant council.</Text>
      </Page>
    </Document>
  );
}
