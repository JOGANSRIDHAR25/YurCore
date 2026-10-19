


import { SITE_NAME } from "@/shared/config/site";
import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';

// Helvetica (the base14 PDF font used here) has no ₹ glyph, so PDF output uses "Rs." instead.
const formatRupees = (paise: number) => `Rs. ${(paise / 100).toFixed(2)}`;

const styles = StyleSheet.create({
    page: { padding: 40, fontFamily: 'Helvetica', fontSize: 10, color: '#333', backgroundColor: '#fff' },
    header: { borderBottom: '1 solid #e2e8f0', paddingBottom: 15, marginBottom: 20 },
    headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    logoText: { fontSize: 24, fontStyle: 'normal', color: '#10b981' },
    subtitle: { fontSize: 9, color: '#64748b', marginTop: 4 },
    title: { fontSize: 16, textAlign: 'center', marginTop: 15, color: '#0f172a' },
    section: { marginBottom: 15 },
    sectionTitle: { fontSize: 12, borderBottom: '1 solid #e2e8f0', paddingBottom: 5, marginBottom: 10, color: '#1e293b' },
    grid: { flexDirection: 'row', flexWrap: 'wrap' },
    gridItem: { width: '50%', marginBottom: 8 },
    label: { fontSize: 9, color: '#64748b', marginBottom: 2 },
    value: { fontSize: 10, color: '#0f172a' },
    table: { width: 'auto', borderStyle: 'solid', borderWidth: 1, borderColor: '#e2e8f0', borderBottomWidth: 0 },
    tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderColor: '#e2e8f0' },
    tableHeader: { backgroundColor: '#f8fafc' },
    colDesc: { width: '55%', padding: '6 8', borderRightWidth: 1, borderColor: '#e2e8f0' },
    colQty: { width: '15%', padding: '6 8', borderRightWidth: 1, borderColor: '#e2e8f0', textAlign: 'center' },
    colAmt: { width: '30%', padding: '6 8', textAlign: 'right' },
    tableCell: { fontSize: 9 },
    tableCellHeader: { fontSize: 9, color: '#475569' },
    totalsBlock: { marginTop: 12, alignSelf: 'flex-end', width: '45%' },
    totalsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
    totalsLabel: { fontSize: 9, color: '#64748b' },
    totalsValue: { fontSize: 9, color: '#0f172a' },
    grandTotalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderTop: '1 solid #cbd5e1', marginTop: 4 },
    grandTotalLabel: { fontSize: 11, color: '#0f172a' },
    grandTotalValue: { fontSize: 12, color: '#10b981' },
    paymentBox: { marginBottom: 15, padding: 10, backgroundColor: '#ecfdf5', borderRadius: 4, border: '1 solid #a7f3d0' },
    paymentLabel: { fontSize: 8, color: '#047857', textTransform: 'uppercase', marginBottom: 2 },
    paymentValue: { fontSize: 10, color: '#064e3b' },
    signatureBlock: { marginTop: 40, alignSelf: 'flex-end', width: 150, textAlign: 'center' },
    signatureImage: { width: 110, height: 34, alignSelf: 'center', objectFit: 'contain' },
    signatureLine: { borderTop: '1 solid #cbd5e1', paddingTop: 4, marginTop: 2 },
    footer: { position: 'absolute', bottom: 30, left: 40, right: 40, borderTop: '1 solid #e2e8f0', paddingTop: 10, flexDirection: 'row', justifyContent: 'space-between' },
    footerText: { fontSize: 8, color: '#94a3b8' },
});

export function InvoicePdfDocument({ data }: { data: any }) {
    const patient = data.patients || {};
    const practitioner = data.practitioners || {};
    const invoice = data.invoice || { doctorFeePaise: 0, totalPaise: 0, paymentMethod: null };
    const paymentMethodLabel = invoice.paymentMethod === "cash" ? "Cash" : invoice.paymentMethod === "online" ? "Online" : null;

    const formatDate = (dateString: string) => {
        if (!dateString) return "";
        return new Date(dateString).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    };

    return (
        <Document>
            <Page size="A4" style={styles.page}>
                <View style={styles.header}>
                    <View style={styles.headerTop}>
                        <View>
                            <Text style={styles.logoText}>{SITE_NAME}</Text>
                            <Text style={styles.subtitle}>India's First AYUSH Digital Health Platform</Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                            <Text style={styles.value}>Dr. {practitioner.full_name}</Text>
                            <Text style={styles.subtitle}>{Array.isArray(practitioner.specializations) ? practitioner.specializations.join(", ") : practitioner.specializations} | {Array.isArray(practitioner.qualifications) ? practitioner.qualifications.join(", ") : practitioner.qualifications}</Text>
                        </View>
                    </View>
                    <Text style={styles.title}>Bill Invoice</Text>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Patient Information</Text>
                    <View style={styles.grid}>
                        <View style={styles.gridItem}>
                            <Text style={styles.label}>Patient Name</Text>
                            <Text style={styles.value}>{patient.full_name}</Text>
                        </View>
                        <View style={styles.gridItem}>
                            <Text style={styles.label}>Invoice Date</Text>
                            <Text style={styles.value}>{formatDate(data.created_at)}</Text>
                        </View>
                        <View style={styles.gridItem}>
                            <Text style={styles.label}>Consultation ID</Text>
                            <Text style={styles.value}>{data.id.split('-')[0].toUpperCase()}</Text>
                        </View>
                        <View style={styles.gridItem}>
                            <Text style={styles.label}>Gender</Text>
                            <Text style={styles.value}>{patient.gender || "N/A"}</Text>
                        </View>
                    </View>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Charges</Text>

                    {paymentMethodLabel && (
                        <View style={styles.paymentBox}>
                            <Text style={styles.paymentLabel}>Payment Method</Text>
                            <Text style={styles.paymentValue}>Payment via {paymentMethodLabel}</Text>
                        </View>
                    )}

                    <View style={styles.table}>
                        <View style={[styles.tableRow, styles.tableHeader]}>
                            <View style={styles.colDesc}><Text style={styles.tableCellHeader}>Description</Text></View>
                            <View style={styles.colQty}><Text style={styles.tableCellHeader}>Qty</Text></View>
                            <View style={styles.colAmt}><Text style={styles.tableCellHeader}>Amount</Text></View>
                        </View>

                        <View style={styles.tableRow}>
                            <View style={styles.colDesc}>
                                <Text style={styles.tableCell}>Doctor Consultation Fee</Text>
                                <Text style={{ ...styles.tableCell, fontSize: 8, color: '#64748b', marginTop: 1 }}>Dr. {practitioner.full_name}</Text>
                            </View>
                            <View style={styles.colQty}><Text style={styles.tableCell}>1</Text></View>
                            <View style={styles.colAmt}><Text style={styles.tableCell}>{formatRupees(invoice.doctorFeePaise)}</Text></View>
                        </View>
                    </View>

                    <View style={styles.totalsBlock}>
                        <View style={styles.grandTotalRow}>
                            <Text style={styles.grandTotalLabel}>Grand Total</Text>
                            <Text style={styles.grandTotalValue}>{formatRupees(invoice.totalPaise)}</Text>
                        </View>
                    </View>
                </View>

                <View style={styles.signatureBlock} wrap={false}>
                    {practitioner.signature_url && (
                        <Image style={styles.signatureImage} src={practitioner.signature_url} />
                    )}
                    <View style={styles.signatureLine}>
                        <Text style={styles.value}>Dr. {practitioner.full_name}</Text>
                        <Text style={styles.subtitle}>Signature</Text>
                    </View>
                </View>

                <View style={styles.footer} fixed>
                    <Text style={styles.footerText}>{SITE_NAME} Digital Health · Generated on {new Date().toLocaleString('en-IN')}</Text>
                    <Text style={styles.footerText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
                </View>
            </Page>
        </Document>
    );
}