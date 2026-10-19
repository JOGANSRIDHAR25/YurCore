import { SITE_NAME } from "@/shared/config/site";
import React from 'react';
import { Document, Page, Text, View, StyleSheet, Svg, Path, Image } from '@react-pdf/renderer';

const parseFrequency = (freq: string) => {
  const f = freq?.toLowerCase() || "";
  let m = false, a = false, e = false, n = false;
  
  if (f.includes("-")) {
    const parts = f.split("-").map(p => p.trim());
    if (parts.length === 3) {
      m = parts[0] !== "0";
      a = parts[1] !== "0";
      n = parts[2] !== "0";
    } else if (parts.length === 4) {
      m = parts[0] !== "0";
      a = parts[1] !== "0";
      e = parts[2] !== "0";
      n = parts[3] !== "0";
    }
  } else {
    if (f.includes("morning") || f.includes("bd") || f.includes("tds") || f.includes("twice") || f.includes("thrice")) m = true;
    if (f.includes("afternoon") || f.includes("tds") || f.includes("thrice")) a = true;
    if (f.includes("evening")) e = true;
    if (f.includes("night") || f.includes("bd") || f.includes("twice") || f.includes("tds") || f.includes("thrice")) n = true;
  }
  return { m, a, e, n };
};

const parseTiming = (timing: string) => {
  const t = (timing || "").toLowerCase();
  const bf = t.includes("before") || t.includes("empty");
  const af = t.includes("after") || t.includes("post") || !bf;
  return { bf, af: af && !bf };
};

const Checkmark = () => (
  <Svg viewBox="0 0 24 24" style={{ width: 10, height: 10 }}>
    <Path
      d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"
      fill="#10b981"
    />
  </Svg>
);

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
  tableColMedicine: { width: '40%', padding: '6 8', borderRightWidth: 1, borderColor: '#e2e8f0' },
  tableColTick: { width: '10%', padding: '6 4', borderRightWidth: 1, borderColor: '#e2e8f0', justifyContent: 'center', alignItems: 'center' },
  tableColTickLast: { width: '10%', padding: '6 4', justifyContent: 'center', alignItems: 'center' },
  tableCell: { fontSize: 9 },
  tableCellHeader: { fontSize: 9, color: '#475569' },
  tickText: { fontSize: 10, color: '#10b981', textAlign: 'center' },
  headerCellTick: { fontSize: 8, color: '#475569', textAlign: 'center' },
  signatureBlock: { marginTop: 40, alignSelf: 'flex-end', width: 150, textAlign: 'center' },
  signatureImage: { width: 110, height: 34, alignSelf: 'center', objectFit: 'contain' },
  signatureLine: { borderTop: '1 solid #cbd5e1', paddingTop: 4, marginTop: 2 },
  footer: { position: 'absolute', bottom: 30, left: 40, right: 40, borderTop: '1 solid #e2e8f0', paddingTop: 10, flexDirection: 'row', justifyContent: 'space-between' },
  footerText: { fontSize: 8, color: '#94a3b8' }
});

export function ConsultationPdfDocument({ data }: { data: any }) {
  const emr = data.emr_notes?.[0] || {};
  const prescriptions = data.prescriptions?.[0] || {};
  const patient = data.patients || {};
  let calculatedAge = "N/A";
  if (patient.date_of_birth) {
    const birthDate = new Date(patient.date_of_birth);
    calculatedAge = String(new Date().getFullYear() - birthDate.getFullYear());
  }
  const practitioner = data.practitioners || {};
  
  let chiefComplaints = [];
  try { chiefComplaints = JSON.parse(emr.chief_complaint || "[]"); } catch(e){}
  
  let assessment: any = {};
  try { assessment = JSON.parse(emr.assessment || "{}"); } catch(e){}

  let findings: any = {};
  try { findings = JSON.parse(emr.objective_findings || "{}"); } catch(e){}

  const vitals = findings.vitals || {};
  const rxItems = prescriptions.prescription_items || [];
  
  const dosha = assessment.dosha || {};
  const vikriti = assessment.vikriti || {};
  const doshaString = Object.entries(dosha).filter(([_, v]) => v).map(([k]) => k).join(", ");
  const vikritiString = Object.entries(vikriti).filter(([_, v]) => v).map(([k]) => k).join(", ");

  const formatDate = (dateString: string) => {
    if (!dateString) return "";
    return new Date(dateString).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  };

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <View>
              <Text style={styles.logoText}>{SITE_NAME}</Text>
              <Text style={styles.subtitle}>India's First AYUSH Digital Health Platform</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.value}>Dr. {practitioner.full_name}</Text>
              <Text style={styles.subtitle}>{practitioner.specialty} | {practitioner.qualifications}</Text>
              {practitioner.registration_number && (
                <Text style={styles.subtitle}>Reg: {practitioner.registration_number}</Text>
              )}
            </View>
          </View>
          <Text style={styles.title}>Patient Consultation Report</Text>
        </View>

        {/* Patient Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Patient Information</Text>
          <View style={styles.grid}>
            <View style={styles.gridItem}>
              <Text style={styles.label}>Patient Name</Text>
              <Text style={styles.value}>{patient.full_name}</Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.label}>Consultation Date</Text>
              <Text style={styles.value}>{formatDate(data.created_at)}</Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.label}>Age / Gender</Text>
              <Text style={styles.value}>{calculatedAge} y / {patient.gender || "N/A"}</Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.label}>ABHA ID</Text>
              <Text style={styles.value}>{patient.abha || "N/A"}</Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.label}>Contact</Text>
              <Text style={styles.value}>{patient.phone || "N/A"}</Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.label}>Consultation ID</Text>
              <Text style={styles.value}>{data.id.split('-')[0].toUpperCase()}</Text>
            </View>
          </View>
        </View>

        {/* Clinical Overview */}
        {(assessment.visitReason || chiefComplaints.length > 0 || emr.history_present) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Clinical Overview</Text>
            {assessment.visitReason && (
              <View style={{ marginBottom: 8 }}>
                <Text style={styles.label}>Reason for Visit</Text>
                <Text style={styles.value}>{assessment.visitReason}</Text>
              </View>
            )}
            {chiefComplaints.length > 0 && (
              <View style={{ marginBottom: 8 }}>
                <Text style={styles.label}>Chief Complaints</Text>
                <Text style={styles.value}>{chiefComplaints.join(", ")}</Text>
              </View>
            )}
            {emr.history_present && (
              <View style={{ marginBottom: 8 }}>
                <Text style={styles.label}>History of Present Illness</Text>
                <Text style={styles.value}>{emr.history_present}</Text>
              </View>
            )}
          </View>
        )}

        {/* Examination & Assessment */}
        {(vitals.bpSys || vitals.bpDia || vitals.pulse || vitals.weight || doshaString || vikritiString || assessment.diagnosis) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Examination & Assessment</Text>
            
            {(vitals.bpSys || vitals.bpDia || vitals.pulse || vitals.weight) && (
              <View style={{ marginBottom: 8 }}>
                <Text style={styles.label}>Recorded Vitals</Text>
                <Text style={styles.value}>
                  {vitals.bpSys && vitals.bpDia ? `BP: ${vitals.bpSys}/${vitals.bpDia}  |  ` : ""}
                  {vitals.pulse ? `Pulse: ${vitals.pulse} bpm  |  ` : ""}
                  {vitals.weight ? `Weight: ${vitals.weight} kg` : ""}
                </Text>
              </View>
            )}
            
            {(doshaString || vikritiString || patient.prakriti) && (
              <View style={{ marginBottom: 8 }}>
                <Text style={styles.label}>Ayurvedic Profile</Text>
                <Text style={styles.value}>
                  {patient.prakriti ? `Prakriti: ${patient.prakriti}  |  ` : ""}
                  {doshaString ? `Dosha: ${doshaString}  |  ` : ""}
                  {vikritiString ? `Vikriti: ${vikritiString}` : ""}
                </Text>
              </View>
            )}

            {assessment.diagnosis && (
              <View style={{ marginBottom: 8 }}>
                <Text style={styles.label}>Diagnosis</Text>
                <Text style={{...styles.value, textTransform: 'capitalize'}}>{assessment.diagnosis.replace(/_/g, ' ')}</Text>
              </View>
            )}
          </View>
        )}

        {/* Formulations & Prescriptions */}
        {rxItems.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Prescription & Formulations</Text>
            <View style={styles.table}>
              <View style={[styles.tableRow, styles.tableHeader]}>
                <View style={styles.tableColMedicine}><Text style={styles.tableCellHeader}>Medicine</Text></View>
                <View style={styles.tableColTick}><Text style={styles.headerCellTick}>Morn</Text></View>
                <View style={styles.tableColTick}><Text style={styles.headerCellTick}>Aft</Text></View>
                <View style={styles.tableColTick}><Text style={styles.headerCellTick}>Eve</Text></View>
                <View style={styles.tableColTick}><Text style={styles.headerCellTick}>Night</Text></View>
                <View style={styles.tableColTick}><Text style={styles.headerCellTick}>B.F.</Text></View>
                <View style={styles.tableColTickLast}><Text style={styles.headerCellTick}>A.F.</Text></View>
              </View>
              {rxItems.map((item: any, i: number) => {
                const { m, a, e, n } = parseFrequency(item.frequency);
                const { bf, af } = parseTiming(item.time_of_intake || item.anupana);
                return (
                  <View style={styles.tableRow} key={i}>
                    <View style={styles.tableColMedicine}>
                      <Text style={styles.tableCell}>{item.medicine_name}</Text>
                      <Text style={{ ...styles.tableCell, fontSize: 8, color: '#64748b', marginTop: 1 }}>
                        {item.classical_type || "Tablet"} ({item.dose || "—"}){item.duration_days ? ` · ${item.duration_days} days` : ""}
                      </Text>
                      {item.special_instructions && (
                        <Text style={{ ...styles.tableCell, fontSize: 7, color: '#94a3b8', marginTop: 2, fontStyle: 'italic' }}>
                          Note: {item.special_instructions}
                        </Text>
                      )}
                    </View>
                    <View style={styles.tableColTick}>
                      {m ? <Checkmark /> : null}
                    </View>
                    <View style={styles.tableColTick}>
                      {a ? <Checkmark /> : null}
                    </View>
                    <View style={styles.tableColTick}>
                      {e ? <Checkmark /> : null}
                    </View>
                    <View style={styles.tableColTick}>
                      {n ? <Checkmark /> : null}
                    </View>
                    <View style={styles.tableColTick}>
                      {bf ? <Checkmark /> : null}
                    </View>
                    <View style={styles.tableColTickLast}>
                      {af ? <Checkmark /> : null}
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Plan & Follow up */}
        {(prescriptions.dietary_advice || prescriptions.lifestyle_advice || emr.plan || prescriptions.followup_date) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Instructions & Care Plan</Text>
            
            {prescriptions.dietary_advice && (
              <View style={{ marginBottom: 8 }}>
                <Text style={styles.label}>Dietary Advice</Text>
                <Text style={styles.value}>{prescriptions.dietary_advice}</Text>
              </View>
            )}

            {prescriptions.lifestyle_advice && (
              <View style={{ marginBottom: 8 }}>
                <Text style={styles.label}>Lifestyle Advice</Text>
                <Text style={styles.value}>{prescriptions.lifestyle_advice}</Text>
              </View>
            )}

            {emr.plan && (
              <View style={{ marginBottom: 8 }}>
                <Text style={styles.label}>Clinical Notes</Text>
                <Text style={styles.value}>{emr.plan}</Text>
              </View>
            )}

            {prescriptions.followup_date && (
              <View style={{ marginTop: 8 }}>
                <Text style={styles.label}>Follow-up</Text>
                <Text style={styles.value}>Scheduled for {formatDate(prescriptions.followup_date)}</Text>
              </View>
            )}
          </View>
        )}

        {/* Footer */}
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