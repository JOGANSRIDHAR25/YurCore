"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useAdminPractitioners, useAdminClinics, verifyPractitionerApi, createPractitionerApi } from "@/hooks/use-admin";
import { apiClient } from "@/shared/api/api-client";
import { useQuery } from "@/hooks/useQuery";

function useNewDoctorVerificationQueue() {
  return useQuery<any[]>(() => apiClient<{ data: any[] }>("/api/admin/doctor-verifications").then((r) => r.data), []);
}

async function verifyNewDoctor(verificationId: string, doctorId: string, status: "verified" | "rejected", reason?: string): Promise<void> {
  await apiClient(`/api/admin/doctor-verifications/${verificationId}`, {
    method: "POST",
    body: JSON.stringify({ doctorId, status, reason }),
  });
}

async function getDoctorSignedUrl(path: string): Promise<string | null> {
  const response = await apiClient<{ data: { url: string | null } }>("/api/discover/doctor-signed-url", {
    params: { path },
  });
  return response.data.url;
}
import { toast } from "react-hot-toast";
import { FileText, Award, CheckCircle, XCircle, Search, ExternalLink, ShieldCheck, Mail, Phone, Calendar, AlertTriangle } from "lucide-react";

function getMissingProfileFields(v: any): string[] {
  const doc = v.doctor || {};
  const missing: string[] = [];
  if (!doc.full_name?.trim()) missing.push("Full name");
  if (!doc.user?.mobile) missing.push("Phone number");
  if (!(doc.qualifications?.length > 0)) missing.push("Qualifications");
  if (!(doc.specializations?.length > 0)) missing.push("Specialty");
  if (!(doc.languages?.length > 0)) missing.push("Languages");
  if (!(doc.consultation_fee > 0)) missing.push("Consultation fee");
  if (!v.degree_url || !v.registration_cert_url) missing.push("Verification documents");
  return missing;
}

type Status = "verified" | "pending" | "rejected" | "under_review";
type PracticeType = "independent" | "hospital" | "both";

const SPECIALTIES = ["Ayurveda", "Homeopathy", "Yoga & Naturopathy", "Unani", "Siddha", "Panchakarma", "Kayachikitsa"];
const QUALIFICATIONS = ["BAMS", "BHMS", "BUMS", "BNYS", "BSMS", "MD (Ayu)", "MS (Ayu)"];

const STATUS_STYLE: Record<Status, string> = {
  verified: "bg-herb-green/10 text-herb-green",
  pending: "bg-amber-50 text-amber-700",
  under_review: "bg-amber-50 text-amber-700",
  rejected: "bg-red-50 text-red-600",
};

const PRACTICE_LABEL: Record<PracticeType, string> = {
  independent: "Independent",
  hospital: "Hospital",
  both: "Both",
};

const PRACTICE_STYLE: Record<PracticeType, string> = {
  independent: "bg-blue-50 text-blue-700",
  hospital: "bg-amber-50 text-amber-700",
  both: "bg-herb-green/10 text-herb-green",
};

const EMPTY_FORM: {
  name: string; specialty: string; qualification: string; hprId: string;
  email: string; phone: string; practiceType: PracticeType;
  clinicName: string; hospitalIds: string[]; city: string;
} = {
  name: "", specialty: "Ayurveda", qualification: "BAMS", hprId: "",
  email: "", phone: "", practiceType: "independent",
  clinicName: "", hospitalIds: [], city: "",
};

export default function AdminPractitionersPage() {
  const [activeTab, setActiveTab] = useState<"legacy" | "new_verifications">("legacy");

  // Legacy data
  const { data: practitioners, loading, refetch } = useAdminPractitioners();
  const { data: clinics, loading: clinicsLoading } = useAdminClinics();

  // New Verification data
  const { data: newVerifications, loading: queueLoading, refetch: refetchQueue } = useNewDoctorVerificationQueue();

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | Status>("all");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // Verification review states
  const [rejectingVerification, setRejectingVerification] = useState<{ id: string; doctorId: string } | null>(null);
  const [rejectionReasonText, setRejectionReasonText] = useState("");
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  if (loading || clinicsLoading || queueLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-herb-green border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // Filter legacy practitioners
  const filtered = (practitioners ?? []).filter((p) => {
    const matchSearch =
      p.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      p.disciplines?.some((d: string) => d.toLowerCase().includes(search.toLowerCase())) ||
      p.hpr_id?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "all" || p.verification_status === filterStatus;
    return matchSearch && matchStatus;
  });

  // Filter new doctor verifications
  const filteredQueue = (newVerifications ?? []).filter((v) => {
    const docName = v.doctor?.full_name || "";
    const specialty = v.doctor?.specializations?.join(" ") || "";
    const hprId = v.hpr_id || "";
    const matchSearch =
      docName.toLowerCase().includes(search.toLowerCase()) ||
      specialty.toLowerCase().includes(search.toLowerCase()) ||
      hprId.toLowerCase().includes(search.toLowerCase());
    const matchStatus = v.status === "pending";
    return matchSearch && matchStatus;
  });

  async function changeStatus(id: string, status: "verified" | "rejected") {
    try {
      await verifyPractitionerApi(id, status);
      toast.success(`Practitioner status updated to ${status}`);
      refetch();
    } catch (err: any) {
      toast.error(err.message ?? "Failed to change status");
    }
  }

  async function handleVerifyNewDoc(vId: string, docId: string) {
    if (!confirm("Are you sure you want to verify this doctor? This will activate their profile and assign the 'doctor' role.")) {
      return;
    }
    setVerifyingId(vId);
    try {
      await verifyNewDoctor(vId, docId, "verified");
      toast.success("Doctor verified successfully!");
      refetchQueue();
      refetch();
    } catch (err: any) {
      toast.error(err.message || "Failed to verify doctor");
    } finally {
      setVerifyingId(null);
    }
  }

  async function handleRejectNewDoc(e: React.FormEvent) {
    e.preventDefault();
    if (!rejectionReasonText.trim()) {
      toast.error("Please specify a reason for rejection");
      return;
    }
    try {
      await verifyNewDoctor(rejectingVerification!.id, rejectingVerification!.doctorId, "rejected", rejectionReasonText);
      toast.success("Doctor credentials rejected.");
      setRejectingVerification(null);
      setRejectionReasonText("");
      refetchQueue();
      refetch();
    } catch (err: any) {
      toast.error(err.message || "Failed to reject doctor");
    }
  }

  async function viewCredential(path: string) {
    if (!path) {
      toast.error("Document path is empty");
      return;
    }
    try {
      const url = await getDoctorSignedUrl(path);
      if (url) {
        window.open(url, "_blank");
      } else {
        toast.error("Failed to generate secure URL");
      }
    } catch (err: any) {
      toast.error("Error securing document preview: " + err.message);
    }
  }

  function toggleHospital(hid: string) {
    setForm((f) => ({
      ...f,
      hospitalIds: f.hospitalIds.includes(hid)
        ? f.hospitalIds.filter((x) => x !== hid)
        : [...f.hospitalIds, hid],
    }));
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await createPractitionerApi({
        name: form.name,
        specialty: form.specialty,
        qualification: form.qualification,
        hprId: form.hprId,
        email: form.email,
        phone: form.phone,
        practiceType: form.practiceType,
        clinicName: form.clinicName,
        hospitalIds: form.hospitalIds,
        city: form.city,
      });
      setForm(EMPTY_FORM);
      setShowForm(false);
      toast.success("Practitioner created successfully");
      refetch();
    } catch (err: any) {
      toast.error(err.message ?? "Failed to create practitioner");
    } finally {
      setSaving(false);
    }
  }

  function practiceDisplay(p: any) {
    const clinicsList = p.clinic_practitioners ?? [];
    if (clinicsList.length === 0) return "—";
    return clinicsList.map((cp: any) => cp.clinic?.name).filter(Boolean).join(", ");
  }

  const showClinicField = form.practiceType === "independent" || form.practiceType === "both";
  const showHospitalField = form.practiceType === "hospital" || form.practiceType === "both";

  const hospitalsList = (clinics ?? []).map((c: any) => ({
    id: c.id,
    name: c.name,
    city: c.city,
  }));

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Practitioners & Doctors</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {practitioners?.length ?? 0} legacy accounts · {newVerifications?.filter(v => v.status === "pending").length ?? 0} new doctor verification requests pending
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="bg-herb-green text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-herb-green/90 transition-all active:scale-95 flex-shrink-0"
        >
          + Add Legacy Practitioner
        </button>
      </div>

      {/* Tab Switcher */}
      <div className="flex border-b border-border mb-6">
        <button
          onClick={() => setActiveTab("legacy")}
          className={cn(
            "px-5 py-2.5 text-sm font-medium border-b-2 -mb-[2px] transition-all",
            activeTab === "legacy"
              ? "border-herb-green text-herb-green font-semibold"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          Legacy Registry
        </button>
        <button
          onClick={() => setActiveTab("new_verifications")}
          className={cn(
            "px-5 py-2.5 text-sm font-medium border-b-2 -mb-[2px] transition-all flex items-center gap-2",
            activeTab === "new_verifications"
              ? "border-herb-green text-herb-green font-semibold"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          Verification Queue
          {(newVerifications?.filter((v) => v.status === "pending")?.length ?? 0) > 0 && (
            <span className="w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-[10px] font-bold animate-pulse">
              {newVerifications?.filter((v) => v.status === "pending")?.length ?? 0}
            </span>
          )}
        </button>
      </div>

      {/* Shared Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <input
          type="text"
          placeholder="Search by name, specialty, HPR ID…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-48 px-3.5 py-2 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-herb-green/20 focus:border-herb-green/50 bg-white"
        />
        {activeTab === "legacy" && (
          <div className="flex gap-1.5">
            {(["all", "verified", "pending", "rejected"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={cn(
                  "px-3 py-2 text-xs font-semibold rounded-xl border transition-all capitalize",
                  filterStatus === s
                    ? "bg-herb-green text-white border-herb-green"
                    : "border-border text-muted-foreground bg-white hover:border-herb-green/30"
                )}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Tab contents */}
      {activeTab === "legacy" ? (
        <div className="bg-white rounded-2xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-background">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Practitioner</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Specialty</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">HPR ID</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Practice</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">City</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((p) => {
                  const userObj = Array.isArray(p.user) ? p.user[0] : p.user;
                  const contact = userObj?.email || userObj?.mobile || "—";
                  const spec = (p.specializations ?? [])[0] ?? (p.disciplines ?? [])[0] ?? "General";
                  const qual = (p.qualifications ?? [])[0] ?? "—";
                  const practiceType = (p.clinic_practitioners?.length > 0) ? "hospital" : "independent";
                  const city = p.clinic_practitioners?.[0]?.clinic?.city ?? "—";
                  return (
                    <tr key={p.id} className="hover:bg-background transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-xl bg-herb-green/10 flex items-center justify-center flex-shrink-0">
                            <span className="text-herb-green text-xs font-bold">{p.full_name?.split(" ").slice(-1)[0]?.[0] ?? "P"}</span>
                          </div>
                          <div>
                            <p className="font-medium text-foreground">{p.full_name}</p>
                            <p className="text-[10px] text-muted-foreground">{contact}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <p className="text-foreground">{spec}</p>
                        <p className="text-[10px] text-muted-foreground">{qual}</p>
                      </td>
                      <td className="px-4 py-3.5 font-mono text-xs text-muted-foreground">{p.hpr_id ?? "—"}</td>
                      <td className="px-4 py-3.5">
                        <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full", PRACTICE_STYLE[practiceType])}>
                          {PRACTICE_LABEL[practiceType]}
                        </span>
                        <p className="text-[10px] text-muted-foreground mt-0.5 max-w-[160px] truncate">{practiceDisplay(p)}</p>
                      </td>
                      <td className="px-4 py-3.5 text-xs text-foreground">{city}</td>
                      <td className="px-4 py-3.5">
                        <span className={cn("text-[10px] font-semibold px-2.5 py-1 rounded-full capitalize", STATUS_STYLE[p.verification_status as Status] ?? "bg-gray-100 text-gray-700")}>
                          {p.verification_status}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {p.verification_status !== "verified" && (
                            <button onClick={() => changeStatus(p.id, "verified")} className="text-[10px] font-semibold text-herb-green hover:underline">
                              Verify
                            </button>
                          )}
                          {p.verification_status !== "rejected" && (
                            <button onClick={() => changeStatus(p.id, "rejected")} className="text-[10px] font-semibold text-red-500 hover:underline">
                              Reject / Suspend
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-5 py-12 text-center text-sm text-muted-foreground">No practitioners found</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-background">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Doctor Profile</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Specialty / Languages</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Credentials & Uploads</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Requested Date</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredQueue.map((v) => {
                  const doc = v.doctor || {};
                  const userObj = doc.user || {};
                  const contact = userObj.email || userObj.mobile || "—";
                  const specialty = doc.specializations?.join(", ") || "Ayurveda";
                  const languages = doc.languages?.join(", ") || "English";
                  const fee = doc.consultation_fee ? `₹${doc.consultation_fee.toFixed(0)}` : "Not set";
                  const dateRequested = new Date(v.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
                  const missingFields = getMissingProfileFields(v);
                  const isProfileComplete = missingFields.length === 0;
                  return (
                    <tr key={v.id} className="hover:bg-background transition-colors">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-herb-green/10 flex items-center justify-center flex-shrink-0 overflow-hidden border border-border">
                            {doc.photo_url ? (
                              <img src={doc.photo_url} alt={doc.full_name} className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-herb-green text-sm font-bold">{doc.full_name?.split(" ").slice(-1)[0]?.[0] || "D"}</span>
                            )}
                          </div>
                          <div>
                            <p className="font-semibold text-foreground">{doc.full_name}</p>
                            <p className="text-xs text-muted-foreground">{contact}</p>
                            <p className="text-[10px] text-herb-green font-medium mt-0.5">Fee: {fee}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <p className="text-foreground font-medium text-xs">{specialty}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">Languages: {languages}</p>
                        {v.hpr_id && (
                          <p className="text-[10px] font-mono bg-muted text-muted-foreground px-1.5 py-0.5 rounded inline-block mt-1">
                            HPR ID: {v.hpr_id}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-4 space-y-1.5">
                        <button
                          onClick={() => viewCredential(v.degree_url)}
                          className="flex items-center gap-1.5 text-xs text-herb-green hover:underline font-medium"
                        >
                          <Award size={14} /> Degree Certificate <ExternalLink size={10} />
                        </button>
                        <button
                          onClick={() => viewCredential(v.registration_cert_url)}
                          className="flex items-center gap-1.5 text-xs text-herb-green hover:underline font-medium"
                        >
                          <FileText size={14} /> Registration Cert <ExternalLink size={10} />
                        </button>
                        {doc.signature_url && (
                          <button
                            onClick={() => viewCredential(doc.signature_url)}
                            className="flex items-center gap-1.5 text-xs text-herb-green hover:underline font-medium"
                          >
                            <FileText size={14} /> Doctor Signature <ExternalLink size={10} />
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-4 text-xs text-muted-foreground">{dateRequested}</td>
                      <td className="px-4 py-4">
                        <span className={cn("text-[10px] font-semibold px-2.5 py-1 rounded-full capitalize", STATUS_STYLE[v.status as Status] ?? "bg-gray-100 text-gray-700")}>
                          {v.status}
                        </span>
                        {v.status === "rejected" && v.rejection_reason && (
                          <p className="text-[10px] text-red-500 mt-1 max-w-[200px] break-words italic">
                            &quot;{v.rejection_reason}&quot;
                          </p>
                        )}
                        {v.status === "pending" && (
                          isProfileComplete ? (
                            <span className="flex items-center gap-1 text-[10px] font-semibold text-herb-green bg-herb-green/10 px-2 py-0.5 rounded-full mt-1.5 w-fit">
                              <CheckCircle size={10} /> Profile details completed
                            </span>
                          ) : (
                            <div className="mt-1.5 max-w-[200px]">
                              <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full w-fit">
                                <AlertTriangle size={10} /> Profile details incomplete
                              </span>
                              <p className="text-[9px] text-muted-foreground mt-1 leading-snug">
                                Missing: {missingFields.join(", ")}
                              </p>
                            </div>
                          )
                        )}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {v.status === "pending" && (
                            <>
                              <button
                                disabled={verifyingId === v.id || !isProfileComplete}
                                onClick={() => handleVerifyNewDoc(v.id, v.doctor_id)}
                                title={!isProfileComplete ? `Doctor must complete: ${missingFields.join(", ")}` : undefined}
                                className={cn(
                                  "text-xs font-semibold px-3 py-1.5 rounded-xl transition-all",
                                  !isProfileComplete
                                    ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                                    : "bg-herb-green text-white hover:bg-herb-green/90"
                                )}
                              >
                                {verifyingId === v.id ? "Verifying..." : "Approve"}
                              </button>
                              <button
                                onClick={() => setRejectingVerification({ id: v.id, doctorId: v.doctor_id })}
                                className="border border-red-200 text-red-600 text-xs font-semibold px-3 py-1.5 rounded-xl hover:bg-red-50 transition-all"
                              >
                                Reject
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredQueue.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-12 text-center text-sm text-muted-foreground">No verification requests found</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Reject Dialog */}
      {rejectingVerification && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="font-semibold text-foreground flex items-center gap-2 text-red-600">
                <ShieldCheck className="text-red-500" size={18} /> Reject Credentials
              </h2>
              <button onClick={() => setRejectingVerification(null)} className="text-muted-foreground hover:text-foreground">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <form onSubmit={handleRejectNewDoc} className="px-6 py-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-foreground block mb-2">Rejection Reason</label>
                <textarea
                  required
                  rows={4}
                  value={rejectionReasonText}
                  onChange={(e) => setRejectionReasonText(e.target.value)}
                  placeholder="Provide specific feedback. E.g., State Medical Council Registration Certificate is expired or blurred..."
                  className="w-full px-3.5 py-2.5 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500/50 bg-white placeholder:text-muted-foreground transition-all resize-none"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setRejectingVerification(null)}
                  className="flex-1 py-2.5 border border-border rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 transition-all"
                >
                  Reject Credentials
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Practitioner Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="font-semibold text-foreground">Add New Practitioner</h2>
              <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <form onSubmit={handleAdd} className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {/* Basic info */}
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-foreground block mb-1">Full Name</label>
                  <input
                    required
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Dr. Full Name"
                    className="w-full px-3 py-2 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-herb-green/20"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">Specialty</label>
                  <select
                    value={form.specialty}
                    onChange={(e) => setForm((f) => ({ ...f, specialty: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-border rounded-xl focus:outline-none bg-white"
                  >
                    {SPECIALTIES.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">Qualification</label>
                  <select
                    value={form.qualification}
                    onChange={(e) => setForm((f) => ({ ...f, qualification: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-border rounded-xl focus:outline-none bg-white"
                  >
                    {QUALIFICATIONS.map((q) => <option key={q}>{q}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">HPR ID</label>
                  <input
                    required
                    value={form.hprId}
                    onChange={(e) => setForm((f) => ({ ...f, hprId: e.target.value }))}
                    placeholder="HPR-XXXX-XXXX"
                    className="w-full px-3 py-2 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-herb-green/20"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">Phone</label>
                  <input
                    required
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    placeholder="+91 XXXXX XXXXX"
                    className="w-full px-3 py-2 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-herb-green/20"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-foreground block mb-1">Email</label>
                  <input
                    required
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="doctor@example.com"
                    className="w-full px-3 py-2 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-herb-green/20"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">City</label>
                  <input
                    required
                    value={form.city}
                    onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                    placeholder="City"
                    className="w-full px-3 py-2 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-herb-green/20"
                  />
                </div>

                {/* Practice type */}
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-foreground block mb-2">Practice Type</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(["independent", "hospital", "both"] as PracticeType[]).map((pt) => (
                      <button
                        key={pt}
                        type="button"
                        onClick={() => setForm((f) => ({
                          ...f,
                          practiceType: pt,
                          clinicName: pt === "hospital" ? "" : f.clinicName,
                          hospitalIds: pt === "independent" ? [] : f.hospitalIds,
                        }))}
                        className={cn(
                          "py-2.5 rounded-xl text-xs font-semibold border transition-all capitalize",
                          form.practiceType === pt
                            ? pt === "independent"
                              ? "bg-blue-600 text-white border-blue-600"
                              : pt === "hospital"
                              ? "bg-amber-500 text-white border-amber-500"
                              : "bg-herb-green text-white border-herb-green"
                            : "border-border text-muted-foreground hover:border-herb-green/40"
                        )}
                      >
                        {pt === "independent" ? "Independent" : pt === "hospital" ? "Hospital" : "Both"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Independent practice name */}
                {showClinicField && (
                  <div className="col-span-2">
                    <label className="text-xs font-semibold text-foreground block mb-1">
                      {form.practiceType === "both" ? "Independent Clinic Name" : "Clinic / Practice Name"}
                    </label>
                    <input
                      required={form.practiceType === "independent"}
                      value={form.clinicName}
                      onChange={(e) => setForm((f) => ({ ...f, clinicName: e.target.value }))}
                      placeholder="e.g. Shastri Ayurveda Clinic"
                      className="w-full px-3 py-2 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-herb-green/20"
                    />
                  </div>
                )}

                {/* Hospital affiliation */}
                {showHospitalField && (
                  <div className="col-span-2">
                    <label className="text-xs font-semibold text-foreground block mb-2">
                      Hospital Affiliation{form.practiceType === "both" ? " (select all that apply)" : ""}
                    </label>
                    <div className="space-y-2">
                      {hospitalsList.map((h) => {
                        const selected = form.hospitalIds.includes(h.id);
                        return (
                          <button
                            key={h.id}
                            type="button"
                            onClick={() => toggleHospital(h.id)}
                            className={cn(
                              "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all",
                              selected
                                ? "border-herb-green bg-herb-green/5"
                                : "border-border hover:border-herb-green/30"
                            )}
                          >
                            <div className={cn(
                              "w-4 h-4 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all",
                              selected ? "bg-herb-green border-herb-green" : "border-border"
                            )}>
                              {selected && (
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={3} strokeLinecap="round">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-foreground">{h.name}</p>
                              <p className="text-[10px] text-muted-foreground">{h.city}</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 py-2.5 border border-border rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || (showHospitalField && form.hospitalIds.length === 0)}
                  className="flex-1 py-2.5 bg-herb-green text-white rounded-xl text-sm font-semibold hover:bg-herb-green/90 transition-all disabled:opacity-60"
                >
                  {saving ? "Adding…" : "Add Practitioner"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}