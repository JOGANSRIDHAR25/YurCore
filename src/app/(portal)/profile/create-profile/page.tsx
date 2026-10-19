"use client";

import { SITE_NAME } from "@/shared/config/site";
import { useState, useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import {
  AlertCircle,
  Plus,
  X,
  User,
  CalendarDays,
  Users,
  Droplet,
  MapPin,
  Phone,
  PhoneCall,
  Stethoscope,
  GraduationCap,
  IndianRupee,
  FileCheck2,
  IdCard,
  Building2,
} from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { AYUSH_QUALIFICATIONS, AYUSH_SPECIALTIES, LANGUAGES } from "@/features/doctor/constants/doctor.constants";
import { useIndiaStates, useIndiaCities } from "@/hooks/use-location";

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const MAX_EMERGENCY_CONTACTS = 3;

type EmergencyContact = { name: string; phone: string };

const EMPTY_CONTACT: EmergencyContact = { name: "", phone: "" };

export default function CreateProfilePage() {
  const { user, loading: authLoading, updateUser } = useAuth();
  const router = useRouter();
  const isPractitioner = user?.role === "practitioner";
  const isPatient = user?.role === "patient";
  const isAssistant = user?.role === "assistant";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showValidation, setShowValidation] = useState(false);

  // Shared fields
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState("");
  const [bloodGroup, setBloodGroup] = useState("");

  // Practitioner practice location
  const [state, setState] = useState("");
  const [city, setCity] = useState("");
  const [clinicName, setClinicName] = useState("");
  const [clinicAddress, setClinicAddress] = useState("");

  const { data: statesData, loading: statesLoading } = useIndiaStates();
  const { data: citiesData, loading: citiesLoading } = useIndiaCities(state);
  const states = statesData ?? [];
  const cities = citiesData ?? [];

  // Patient-only fields
  const [address, setAddress] = useState("");
  const [ayushNumber, setAyushNumber] = useState("");
  const [contacts, setContacts] = useState<EmergencyContact[]>([EMPTY_CONTACT]);

  // Assistant-only fields
  const [linkedDoctorName, setLinkedDoctorName] = useState("");

  // Doctor-only fields
  const [hprId, setHprId] = useState("");
  const [consultationFee, setConsultationFee] = useState("");
  const [experience, setExperience] = useState("");
  const [selectedQuals, setSelectedQuals] = useState<string[]>([]);
  const [selectedSpecialties, setSelectedSpecialties] = useState<string[]>([]);
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);
  const [verificationStatus, setVerificationStatus] = useState("");
  const [degreeUrl, setDegreeUrl] = useState("");
  const [registrationCertUrl, setRegistrationCertUrl] = useState("");
  const [degreeFile, setDegreeFile] = useState<File | null>(null);
  const [regCertFile, setRegCertFile] = useState<File | null>(null);
  const [signatureUrl, setSignatureUrl] = useState("");

  // Signature pad
  const signatureCanvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingSignatureRef = useRef(false);
  const [hasSignatureDrawing, setHasSignatureDrawing] = useState(false);

  useEffect(() => {
    if (!authLoading && user && !isPatient && !isPractitioner && !isAssistant) {
      router.replace("/profile");
    }
  }, [authLoading, user, isPatient, isPractitioner, isAssistant, router]);

  useEffect(() => {
    if (!user?.id || (!isPatient && !isPractitioner && !isAssistant)) return;

    if (isAssistant) {
      fetch("/api/profile", { cache: "no-store" })
        .then((res) => res.json())
        .then((json) => {
          const data = json?.data;
          if (!data) return;
          setDob(data.dob || "");
          setGender(data.gender || "");
          setBloodGroup(data.bloodGroup || "");
          setLinkedDoctorName(data.linkedDoctorName || "");
        })
        .catch(() => { })
        .finally(() => setLoading(false));
      return;
    }

    const endpoint = isPractitioner ? "/api/auth/onboard-doctor" : "/api/auth/onboard-patient";
    fetch(endpoint, { cache: "no-store" })
      .then((res) => res.json())
      .then((json) => {
        const data = json?.data;
        if (!data) return;

        // Quick onboarding seeds placeholder DOB/gender to satisfy NOT NULL
        // constraints before this form is filled in — treat both as unset.
        const realDob = data.date_of_birth && data.date_of_birth !== "1970-01-01" ? data.date_of_birth : "";
        const realGender = data.gender && data.gender !== "prefer_not_to_say" ? data.gender : "";
        setDob(realDob);
        setGender(realGender);
        setBloodGroup(data.blood_group || "");

        if (isPractitioner) {
          setHprId(data.hpr_id || "");
          setConsultationFee(data.consultation_fee ? String(data.consultation_fee) : "");
          setExperience(data.experience_years ? String(data.experience_years) : "");
          setSelectedQuals(data.qualifications || []);
          setSelectedSpecialties(data.specializations || []);
          setSelectedLanguages(data.languages || []);
          setVerificationStatus(data.verification_status || "");
          setDegreeUrl(data.degree_url || "");
          setRegistrationCertUrl(data.registration_cert_url || "");
          setSignatureUrl(data.signature_url || "");
          setState(data.state || "");
          setCity(data.city || "");
          setClinicName(data.clinic_hospital_name || "");
          setClinicAddress(data.clinic_hospital_address || "");
        } else {
          setAddress(data.address || "");
          setAyushNumber(data.ayush_number || "");

          if (Array.isArray(data.emergency_contacts) && data.emergency_contacts.length > 0) {
            setContacts(data.emergency_contacts.slice(0, MAX_EMERGENCY_CONTACTS));
          } else if (data.emergency_contact_name || data.emergency_contact_phone) {
            // Legacy single-contact columns — carry the value forward once.
            setContacts([{ name: data.emergency_contact_name || "", phone: data.emergency_contact_phone || "" }]);
          }
        }
      })
      .catch(() => {
        // Non-fatal — the form just starts empty
      })
      .finally(() => setLoading(false));
  }, [user?.id, isPatient, isPractitioner, isAssistant]);

  function toggleQual(q: string) {
    setSelectedQuals((prev) => (prev.includes(q) ? prev.filter((x) => x !== q) : [...prev, q]));
  }

  function toggleLanguage(l: string) {
    setSelectedLanguages((prev) => (prev.includes(l) ? prev.filter((x) => x !== l) : [...prev, l]));
  }

  function updateContact(index: number, field: keyof EmergencyContact, value: string) {
    setContacts((prev) => prev.map((c, i) => (i === index ? { ...c, [field]: value } : c)));
  }

  function addContact() {
    setContacts((prev) => (prev.length >= MAX_EMERGENCY_CONTACTS ? prev : [...prev, { ...EMPTY_CONTACT }]));
  }

  function removeContact(index: number) {
    setContacts((prev) => prev.filter((_, i) => i !== index));
  }

  async function uploadDocuments(): Promise<{ degreeUrl?: string; registrationCertUrl?: string }> {
    if (!degreeFile && !regCertFile) return {};

    const supabase = createClient();
    const prefix = (user?.email || user?.id || "doctor").replace(/[^a-zA-Z0-9]/g, "_");

    const uploadOne = async (file: File, tag: string) => {
      const path = `${prefix}/${tag}_${Date.now()}_${file.name}`;
      const { data, error: uploadError } = await supabase.storage
        .from("doctor-documents")
        .upload(path, file, { cacheControl: "3600", upsert: true });
      if (uploadError) throw uploadError;
      return `doctor-documents/${data.path}`;
    };

    const result: { degreeUrl?: string; registrationCertUrl?: string } = {};
    if (degreeFile) result.degreeUrl = await uploadOne(degreeFile, "degree");
    if (regCertFile) result.registrationCertUrl = await uploadOne(regCertFile, "reg");
    return result;
  }

  function getSignatureCanvasContext() {
    const canvas = signatureCanvasRef.current;
    return canvas ? canvas.getContext("2d") : null;
  }

  function signaturePointFromEvent(e: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function handleSignaturePointerDown(e: ReactPointerEvent<HTMLCanvasElement>) {
    const ctx = getSignatureCanvasContext();
    if (!ctx) return;
    isDrawingSignatureRef.current = true;
    const { x, y } = signaturePointFromEvent(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function handleSignaturePointerMove(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!isDrawingSignatureRef.current) return;
    const ctx = getSignatureCanvasContext();
    if (!ctx) return;
    const { x, y } = signaturePointFromEvent(e);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#0f172a";
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasSignatureDrawing(true);
  }

  function handleSignaturePointerUp() {
    isDrawingSignatureRef.current = false;
  }

  function handleClearSignature() {
    const canvas = signatureCanvasRef.current;
    const ctx = getSignatureCanvasContext();
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignatureDrawing(false);
  }

  /**
   * The canvas is a fixed 500x160 box, but a signature usually only fills a
   * small part of it. Uploading the whole box bakes in a lot of transparent
   * padding, which then shows up as an odd gap above the printed name on
   * the generated PDFs — so crop to the drawn strokes' bounding box first.
   */
  function trimSignatureCanvas(canvas: HTMLCanvasElement): HTMLCanvasElement {
    const ctx = canvas.getContext("2d");
    if (!ctx) return canvas;

    const { width, height } = canvas;
    const { data } = ctx.getImageData(0, 0, width, height);

    let minX = width, minY = height, maxX = -1, maxY = -1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const alpha = data[(y * width + x) * 4 + 3];
        if (alpha > 10) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (maxX < minX || maxY < minY) return canvas; // nothing drawn

    const pad = 6;
    minX = Math.max(0, minX - pad);
    minY = Math.max(0, minY - pad);
    maxX = Math.min(width - 1, maxX + pad);
    maxY = Math.min(height - 1, maxY + pad);

    const trimmedWidth = maxX - minX + 1;
    const trimmedHeight = maxY - minY + 1;

    const trimmed = document.createElement("canvas");
    trimmed.width = trimmedWidth;
    trimmed.height = trimmedHeight;
    trimmed.getContext("2d")?.drawImage(canvas, minX, minY, trimmedWidth, trimmedHeight, 0, 0, trimmedWidth, trimmedHeight);
    return trimmed;
  }

  async function uploadSignature(): Promise<string | undefined> {
    const canvas = signatureCanvasRef.current;
    if (!canvas || !hasSignatureDrawing) return undefined;

    const trimmedCanvas = trimSignatureCanvas(canvas);
    const blob: Blob | null = await new Promise((resolve) => trimmedCanvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("Could not process signature");

    const supabase = createClient();
    const prefix = (user?.email || user?.id || "doctor").replace(/[^a-zA-Z0-9]/g, "_");
    const path = `${prefix}/signature_${Date.now()}.png`;

    const { data, error: uploadError } = await supabase.storage
      .from("doctor-documents")
      .upload(path, blob, { cacheControl: "3600", upsert: true, contentType: "image/png" });
    if (uploadError) throw uploadError;

    return `doctor-documents/${data.path}`;
  }

  const ayushNumberInvalid = isPatient && ayushNumber.length > 0 && ayushNumber.length !== 14;
  const patientMissingRequired = isPatient && (!dob || !gender || !bloodGroup);
  const doctorMissingRequired =
    isPractitioner &&
    (!dob ||
      !gender ||
      !state ||
      !city ||
      !clinicName.trim() ||
      !clinicAddress.trim() ||
      !consultationFee ||
      selectedQuals.length === 0 ||
      selectedSpecialties.length === 0 ||
      selectedLanguages.length === 0 ||
      !(degreeFile || degreeUrl) ||
      !(regCertFile || registrationCertUrl) ||
      !(hasSignatureDrawing || signatureUrl));
  const assistantMissingRequired = isAssistant && (!dob || !gender || !bloodGroup);

  async function handleSubmit() {
    if (!user?.email) {
      setError("Missing account email — please sign in again.");
      return;
    }

    if (patientMissingRequired || ayushNumberInvalid || doctorMissingRequired || assistantMissingRequired) {
      setShowValidation(true);
      setError(
        ayushNumberInvalid && !patientMissingRequired
          ? "AYUSH Number must be exactly 14 characters."
          : "Please fill in all required fields before saving."
      );
      return;
    }

    setSaving(true);
    setError("");

    try {
      if (isPractitioner) {
        const uploaded = await uploadDocuments();
        const uploadedSignatureUrl = await uploadSignature();
        const res = await fetch("/api/auth/onboard-doctor/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: user.email,
            phone: user.phone || "",
            fullName: user.name,
            dateOfBirth: dob || undefined,
            gender: gender || undefined,
            state: state || undefined,
            city: city || undefined,
            clinicName: clinicName.trim() || undefined,
            clinicAddress: clinicAddress.trim() || undefined,
            hprId: hprId || undefined,
            consultationFee: consultationFee ? parseFloat(consultationFee) : undefined,
            experienceYears: experience ? parseInt(experience, 10) : undefined,
            qualifications: selectedQuals,
            specializations: selectedSpecialties,
            languages: selectedLanguages,
            degreeUrl: uploaded.degreeUrl || degreeUrl || undefined,
            registrationCertUrl: uploaded.registrationCertUrl || registrationCertUrl || undefined,
            signatureUrl: uploadedSignatureUrl || signatureUrl || undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || data.error || "Failed to save profile.");
        updateUser({ dob: dob || undefined, gender: gender || undefined });
      } else if (isAssistant) {
        const res = await fetch("/api/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dob, gender, bloodGroup }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || data.error?.message || "Failed to save profile.");
        updateUser({ dob, gender, bloodGroup });
      } else {
        const cleanContacts = contacts
          .map((c) => ({ name: c.name.trim(), phone: c.phone.trim() }))
          .filter((c) => c.name || c.phone);

        const res = await fetch("/api/auth/onboard-patient/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: user.email,
            fullName: user.name,
            phone: user.phone || "",
            dateOfBirth: dob,
            gender,
            bloodGroup,
            address,
            ayushNumber: ayushNumber || undefined,
            emergencyContacts: cleanContacts,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || data.message || "Failed to save profile.");
        updateUser({ dob, gender, bloodGroup });
      }

      toast.success("Profile updated successfully!");
      router.push("/profile");
    } catch (err: any) {
      console.error("Create profile error:", err);
      setError(err.message || "Failed to save profile.");
    } finally {
      setSaving(false);
    }
  }

  if (authLoading || !user || loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-herb-green"></div>
      </div>
    );
  }

  const fieldClass = (hasError: boolean) =>
    cn(
      "w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none bg-white transition-colors",
      hasError
        ? "border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-500/15"
        : "border-border focus:border-herb-green/50"
    );

  const premiumField = (hasError: boolean) =>
    cn(
      "w-full pl-10 pr-4 py-3 border rounded-xl text-sm bg-white transition-all duration-200 focus:outline-none",
      hasError
        ? "border-red-300 focus:border-red-500 focus:ring-4 focus:ring-red-500/10"
        : "border-slate-200 hover:border-indigo-200 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
    );

  // ── Practitioner: premium sectioned layout ──────────────────────────────
  if (isPractitioner) {
    return (
      <div className="px-4 sm:px-6 lg:px-10 py-6 max-w-5xl mx-auto bg-gradient-to-b from-indigo-50/40 via-transparent to-transparent">
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-5">
          <Link href="/profile" className="hover:text-foreground transition-colors">Profile</Link>
          <span>/</span>
          <span className="text-foreground font-medium">Create Profile</span>
        </div>

        <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
          <h1 className="font-display text-xl font-semibold text-slate-900">Create Your Doctor Profile</h1>
          {verificationStatus && verificationStatus !== "verified" && (
            <span className="text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-full whitespace-nowrap">
              {verificationStatus === "rejected" ? "Verification Rejected" : "Verification Pending"}
            </span>
          )}
        </div>
        <p className="text-sm text-slate-500 mb-7">
          Set up your specialty, languages, and practice fee so patients can find and book you. An admin reviews
          your documents before you go live.
        </p>

        <div className="space-y-5">
          {/* ── Personal Information ── */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_1px_3px_rgba(30,41,59,0.04)] p-6 sm:p-7">
            <div className="flex items-start gap-3 mb-6">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-100/70 border border-indigo-100 flex items-center justify-center flex-shrink-0">
                <User size={17} className="text-indigo-600" />
              </div>
              <div>
                <h2 className="text-[15px] font-semibold text-slate-900">Personal Information</h2>
                <p className="text-xs text-slate-500 mt-0.5">Basic details for your practitioner profile</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                  Date of Birth <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <CalendarDays size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-indigo-400 pointer-events-none" />
                  <input
                    type="date"
                    value={dob}
                    onChange={(e) => setDob(e.target.value)}
                    className={cn(premiumField(showValidation && !dob), "text-slate-600")}
                  />
                </div>
                {showValidation && !dob && <p className="text-xs text-red-500 mt-1.5">Date of birth is required</p>}
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                  Gender <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Users size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-indigo-400 pointer-events-none" />
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                    className={cn(premiumField(showValidation && !gender), "appearance-none")}
                  >
                    <option value="">Select gender</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                {showValidation && !gender && <p className="text-xs text-red-500 mt-1.5">Gender is required</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                  State <span className="text-red-500">*</span>
                </label>
                <SearchableSelect
                  options={states}
                  value={state ? [state] : []}
                  onChange={(next) => {
                    setState(next[0] || "");
                    setCity(""); // city list depends on state — drop a now-invalid choice
                  }}
                  icon={MapPin}
                  placeholder={statesLoading ? "Loading states…" : states.length === 0 ? "States unavailable — retry shortly" : "Search states…"}
                  disabled={statesLoading || states.length === 0}
                  hasError={showValidation && !state}
                  emptyMessage="No matching states."
                />
                {showValidation && !state && <p className="text-xs text-red-500 mt-1.5">State is required</p>}
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                  City <span className="text-red-500">*</span>
                </label>
                <SearchableSelect
                  options={cities}
                  value={city ? [city] : []}
                  onChange={(next) => setCity(next[0] || "")}
                  icon={Building2}
                  placeholder={
                    !state
                      ? "Select state first"
                      : citiesLoading
                        ? "Loading cities…"
                        : cities.length === 0
                          ? "No cities found for this state"
                          : "Search cities…"
                  }
                  disabled={!state || citiesLoading || cities.length === 0}
                  hasError={showValidation && !city}
                  emptyMessage="No matching cities."
                />
                {showValidation && !city && <p className="text-xs text-red-500 mt-1.5">City is required</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                  Clinic / Hospital Name <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Building2 size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-indigo-400 pointer-events-none" />
                  <input
                    type="text"
                    value={clinicName}
                    onChange={(e) => setClinicName(e.target.value)}
                    placeholder={`e.g. ${SITE_NAME} Wellness Center`}
                    className={premiumField(showValidation && !clinicName.trim())}
                  />
                </div>
                {showValidation && !clinicName.trim() && (
                  <p className="text-xs text-red-500 mt-1.5">Clinic / hospital name is required</p>
                )}
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                  Clinic / Hospital Address <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <MapPin size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-indigo-400 pointer-events-none" />
                  <input
                    type="text"
                    value={clinicAddress}
                    onChange={(e) => setClinicAddress(e.target.value)}
                    placeholder="Street, area, landmark"
                    className={premiumField(showValidation && !clinicAddress.trim())}
                  />
                </div>
                {showValidation && !clinicAddress.trim() && (
                  <p className="text-xs text-red-500 mt-1.5">Clinic / hospital address is required</p>
                )}
              </div>
            </div>
          </div>

          {/* ── Professional Details ── */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_1px_3px_rgba(30,41,59,0.04)] p-6 sm:p-7">
            <div className="flex items-start gap-3 mb-6">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-100/70 border border-indigo-100 flex items-center justify-center flex-shrink-0">
                <Stethoscope size={17} className="text-indigo-600" />
              </div>
              <div>
                <h2 className="text-[15px] font-semibold text-slate-900">Professional Details</h2>
                <p className="text-xs text-slate-500 mt-0.5">Your registry ID and consultation pricing</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1.5">HPR ID (optional)</label>
                <div className="relative">
                  <FileCheck2 size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-indigo-400 pointer-events-none" />
                  <input
                    type="text"
                    value={hprId}
                    onChange={(e) => setHprId(e.target.value)}
                    placeholder="e.g. HPR-1234-5678"
                    className={premiumField(false)}
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                  Consultation Fee (in INR) <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <IndianRupee size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-indigo-400 pointer-events-none" />
                  <input
                    type="number"
                    min="0"
                    value={consultationFee}
                    onChange={(e) => setConsultationFee(e.target.value)}
                    placeholder="e.g. 500"
                    className={premiumField(showValidation && !consultationFee)}
                  />
                </div>
                {showValidation && !consultationFee && (
                  <p className="text-xs text-red-500 mt-1.5">Consultation fee is required</p>
                )}
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1.5">Experience (in years)</label>
                <div className="relative">
                  <GraduationCap size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-indigo-400 pointer-events-none" />
                  <input
                    type="number"
                    min="0"
                    value={experience}
                    onChange={(e) => setExperience(e.target.value)}
                    placeholder="e.g. 5"
                    className={premiumField(false)}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* ── Qualifications & Expertise ── */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_1px_3px_rgba(30,41,59,0.04)] p-6 sm:p-7">
            <div className="flex items-start gap-3 mb-6">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-100/70 border border-indigo-100 flex items-center justify-center flex-shrink-0">
                <GraduationCap size={17} className="text-indigo-600" />
              </div>
              <div>
                <h2 className="text-[15px] font-semibold text-slate-900">Qualifications &amp; Expertise</h2>
                <p className="text-xs text-slate-500 mt-0.5">Search and select what applies to you</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                  AYUSH Qualifications <span className="text-red-500">*</span>
                </label>
                <SearchableSelect
                  options={AYUSH_QUALIFICATIONS}
                  value={selectedQuals}
                  onChange={setSelectedQuals}
                  multi
                  placeholder="Select qualifications…"
                  hasError={showValidation && selectedQuals.length === 0}
                />
                {showValidation && selectedQuals.length === 0 && (
                  <p className="text-xs text-red-500 mt-1.5">Select at least one qualification</p>
                )}
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                  Specialty <span className="text-red-500">*</span>
                </label>
                <SearchableSelect
                  options={AYUSH_SPECIALTIES}
                  value={selectedSpecialties}
                  onChange={setSelectedSpecialties}
                  multi
                  placeholder="Select specialties…"
                  hasError={showValidation && selectedSpecialties.length === 0}
                />
                {showValidation && selectedSpecialties.length === 0 && (
                  <p className="text-xs text-red-500 mt-1.5">Select at least one specialty</p>
                )}
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                  Languages Spoken <span className="text-red-500">*</span>
                </label>
                <SearchableSelect
                  options={LANGUAGES}
                  value={selectedLanguages}
                  onChange={setSelectedLanguages}
                  multi
                  placeholder="Select languages…"
                  hasError={showValidation && selectedLanguages.length === 0}
                />
                {showValidation && selectedLanguages.length === 0 && (
                  <p className="text-xs text-red-500 mt-1.5">Select at least one language</p>
                )}
              </div>
            </div>
          </div>

          {/* ── Verification Documents ── */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_1px_3px_rgba(30,41,59,0.04)] p-6 sm:p-7">
            <div className="flex items-start gap-3 mb-6">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-100/70 border border-indigo-100 flex items-center justify-center flex-shrink-0">
                <FileCheck2 size={17} className="text-indigo-600" />
              </div>
              <div>
                <h2 className="text-[15px] font-semibold text-slate-900">Verification Documents</h2>
                <p className="text-xs text-slate-500 mt-0.5">Required before an admin can approve your profile</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  className={cn(
                    "border border-dashed rounded-xl p-4 bg-slate-50/60 hover:border-indigo-300 hover:bg-indigo-50/40 transition-all cursor-pointer flex flex-col items-center gap-1.5 text-center",
                    showValidation && !(degreeFile || degreeUrl) ? "border-red-300" : "border-slate-200"
                  )}
                >
                  <span className="text-xs font-semibold text-slate-700">
                    Degree Certificate <span className="text-red-500">*</span>
                  </span>
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={(e) => setDegreeFile(e.target.files?.[0] || null)}
                    className="hidden"
                  />
                  <span className="text-[10px] text-slate-500">
                    {degreeFile ? `✓ ${degreeFile.name}` : degreeUrl ? "✓ Uploaded — click to replace" : "Click to upload"}
                  </span>
                </label>
                {showValidation && !(degreeFile || degreeUrl) && (
                  <p className="text-xs text-red-500 mt-1.5">Degree certificate is required</p>
                )}
              </div>
              <div>
                <label
                  className={cn(
                    "border border-dashed rounded-xl p-4 bg-slate-50/60 hover:border-indigo-300 hover:bg-indigo-50/40 transition-all cursor-pointer flex flex-col items-center gap-1.5 text-center",
                    showValidation && !(regCertFile || registrationCertUrl) ? "border-red-300" : "border-slate-200"
                  )}
                >
                  <span className="text-xs font-semibold text-slate-700">
                    Registration Certificate <span className="text-red-500">*</span>
                  </span>
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={(e) => setRegCertFile(e.target.files?.[0] || null)}
                    className="hidden"
                  />
                  <span className="text-[10px] text-slate-500">
                    {regCertFile ? `✓ ${regCertFile.name}` : registrationCertUrl ? "✓ Uploaded — click to replace" : "Click to upload"}
                  </span>
                </label>
                {showValidation && !(regCertFile || registrationCertUrl) && (
                  <p className="text-xs text-red-500 mt-1.5">Registration certificate is required</p>
                )}
              </div>
            </div>
          </div>

          {/* ── Digital Signature ── */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_1px_3px_rgba(30,41,59,0.04)] p-6 sm:p-7">
            <div className="flex items-start gap-3 mb-6">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-100/70 border border-indigo-100 flex items-center justify-center flex-shrink-0">
                <FileCheck2 size={17} className="text-indigo-600" />
              </div>
              <div>
                <h2 className="text-[15px] font-semibold text-slate-900">
                  Digital Signature <span className="text-red-500">*</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Draw your signature — it will appear on patient invoices and prescription PDFs.
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-500 mb-2">
              Please sign in the center of the box below for the best result.
            </p>

            {signatureUrl && (
              <p className="text-xs text-emerald-600 font-medium mb-2">
                {hasSignatureDrawing ? "✓ Signature saved — replacing it below" : "✓ Signature saved — draw below to replace it"}
              </p>
            )}

            <canvas
              ref={signatureCanvasRef}
              width={500}
              height={160}
              className={cn(
                "w-full h-40 rounded-xl border border-dashed bg-slate-50/60 touch-none cursor-crosshair",
                showValidation && !(hasSignatureDrawing || signatureUrl) ? "border-red-300" : "border-slate-200"
              )}
              onPointerDown={handleSignaturePointerDown}
              onPointerMove={handleSignaturePointerMove}
              onPointerUp={handleSignaturePointerUp}
              onPointerLeave={handleSignaturePointerUp}
            />
            {showValidation && !(hasSignatureDrawing || signatureUrl) && (
              <p className="text-xs text-red-500 mt-1.5">Signature is required</p>
            )}

            <div className="flex justify-end mt-3">
              <button
                type="button"
                onClick={handleClearSignature}
                disabled={!hasSignatureDrawing}
                className="px-4 py-2 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Clear
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5 text-sm text-red-700 flex items-start gap-2">
              <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex justify-end px-1 pt-1">
            <button
              onClick={handleSubmit}
              disabled={saving}
              className={cn(
                "w-full sm:w-auto px-8 py-3.5 rounded-xl text-sm font-semibold text-white transition-all duration-200",
                saving
                  ? "opacity-60 cursor-not-allowed bg-gradient-to-r from-blue-600 to-indigo-600"
                  : "bg-gradient-to-r from-blue-600 to-indigo-600 shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:shadow-indigo-500/30 hover:-translate-y-0.5 active:translate-y-0"
              )}
            >
              {saving ? "Saving…" : "Save Profile"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Assistant: premium sectioned layout ─────────────────────────────────
  if (isAssistant) {
    const disabledField =
      "w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl text-sm bg-slate-50 text-slate-500 cursor-not-allowed";
    return (
      <div className="px-4 sm:px-6 lg:px-10 py-6 max-w-5xl mx-auto bg-gradient-to-b from-indigo-50/40 via-transparent to-transparent">
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-5">
          <Link href="/profile" className="hover:text-foreground transition-colors">Profile</Link>
          <span>/</span>
          <span className="text-foreground font-medium">Create Profile</span>
        </div>

        <h1 className="font-display text-xl font-semibold text-slate-900 mb-1">Create Your Assistant Profile</h1>
        <p className="text-sm text-slate-500 mb-7">Your account details and the profile info your doctor can see.</p>

        <div className="space-y-5">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_1px_3px_rgba(30,41,59,0.04)] p-6 sm:p-7">
            <div className="flex items-start gap-3 mb-6">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-100/70 border border-indigo-100 flex items-center justify-center flex-shrink-0">
                <User size={17} className="text-indigo-600" />
              </div>
              <div>
                <h2 className="text-[15px] font-semibold text-slate-900">Account Details</h2>
                <p className="text-xs text-slate-500 mt-0.5">Set when your account was created — not editable here</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1.5">Full Name</label>
                <div className="relative">
                  <User size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input type="text" value={user?.name || ""} disabled className={disabledField} />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1.5">Phone Number</label>
                <div className="relative">
                  <Phone size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input type="text" value={user?.phone || ""} disabled className={disabledField} />
                </div>
              </div>
            </div>

            <div className="mt-4">
              <label className="text-xs font-semibold text-slate-700 block mb-1.5">Doctor You Assist</label>
              <div className="relative">
                <Stethoscope size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input type="text" value={linkedDoctorName || "—"} disabled className={disabledField} />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_1px_3px_rgba(30,41,59,0.04)] p-6 sm:p-7">
            <div className="flex items-start gap-3 mb-6">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-100/70 border border-indigo-100 flex items-center justify-center flex-shrink-0">
                <Droplet size={17} className="text-indigo-600" />
              </div>
              <div>
                <h2 className="text-[15px] font-semibold text-slate-900">Personal Information</h2>
                <p className="text-xs text-slate-500 mt-0.5">Needed for your profile to be complete</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                  Date of Birth <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <CalendarDays size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-indigo-400 pointer-events-none" />
                  <input
                    type="date"
                    value={dob}
                    onChange={(e) => setDob(e.target.value)}
                    className={cn(premiumField(showValidation && !dob), "text-slate-600")}
                  />
                </div>
                {showValidation && !dob && <p className="text-xs text-red-500 mt-1.5">Date of birth is required</p>}
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                  Gender <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Users size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-indigo-400 pointer-events-none" />
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                    className={cn(premiumField(showValidation && !gender), "appearance-none")}
                  >
                    <option value="">Select gender</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                {showValidation && !gender && <p className="text-xs text-red-500 mt-1.5">Gender is required</p>}
              </div>
            </div>

            <div className="mt-4 sm:w-1/2">
              <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                Blood Group <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Droplet size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-indigo-400 pointer-events-none" />
                <select
                  value={bloodGroup}
                  onChange={(e) => setBloodGroup(e.target.value)}
                  className={cn(premiumField(showValidation && !bloodGroup), "appearance-none")}
                >
                  <option value="">Select blood group</option>
                  {BLOOD_GROUPS.map((bg) => (
                    <option key={bg} value={bg}>{bg}</option>
                  ))}
                </select>
              </div>
              {showValidation && !bloodGroup && <p className="text-xs text-red-500 mt-1.5">Blood group is required</p>}
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5 text-sm text-red-700 flex items-start gap-2">
              <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex justify-end px-1 pt-1">
            <button
              onClick={handleSubmit}
              disabled={saving}
              className={cn(
                "w-full sm:w-auto px-8 py-3.5 rounded-xl text-sm font-semibold text-white transition-all duration-200",
                saving
                  ? "opacity-60 cursor-not-allowed bg-gradient-to-r from-blue-600 to-indigo-600"
                  : "bg-gradient-to-r from-blue-600 to-indigo-600 shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:shadow-indigo-500/30 hover:-translate-y-0.5 active:translate-y-0"
              )}
            >
              {saving ? "Saving…" : "Save Profile"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Patient: premium sectioned layout ───────────────────────────────────
  const patientField = premiumField;

  return (
    <div className="px-4 sm:px-6 lg:px-10 py-6 max-w-5xl mx-auto bg-gradient-to-b from-indigo-50/40 via-transparent to-transparent">
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-5">
        <Link href="/profile" className="hover:text-foreground transition-colors">Profile</Link>
        <span>/</span>
        <span className="text-foreground font-medium">Create Profile</span>
      </div>

      <h1 className="font-display text-xl font-semibold text-slate-900 mb-1">Create Your Health Profile</h1>
      <p className="text-sm text-slate-500 mb-7">Your personal and emergency contact details, for accurate and timely care.</p>

      <div className="space-y-5">
        {/* ── Personal Information ── */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_1px_3px_rgba(30,41,59,0.04)] p-6 sm:p-7">
          <div className="flex items-start gap-3 mb-6">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-100/70 border border-indigo-100 flex items-center justify-center flex-shrink-0">
              <User size={17} className="text-indigo-600" />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-slate-900">Personal Information</h2>
              <p className="text-xs text-slate-500 mt-0.5">Basic details to help personalize your healthcare experience</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                Date of Birth <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <CalendarDays size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-indigo-400 pointer-events-none" />
                <input
                  type="date"
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                  className={cn(patientField(showValidation && !dob), "text-slate-600")}
                />
              </div>
              {showValidation && !dob && <p className="text-xs text-red-500 mt-1.5">Date of birth is required</p>}
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                Gender <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Users size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-indigo-400 pointer-events-none" />
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  className={cn(patientField(showValidation && !gender), "appearance-none")}
                >
                  <option value="">Select gender</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
              {showValidation && !gender && <p className="text-xs text-red-500 mt-1.5">Gender is required</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                Blood Group <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Droplet size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-indigo-400 pointer-events-none" />
                <select
                  value={bloodGroup}
                  onChange={(e) => setBloodGroup(e.target.value)}
                  className={cn(patientField(showValidation && !bloodGroup), "appearance-none")}
                >
                  <option value="">Select blood group</option>
                  {BLOOD_GROUPS.map((bg) => (
                    <option key={bg} value={bg}>{bg}</option>
                  ))}
                </select>
              </div>
              {showValidation && !bloodGroup && <p className="text-xs text-red-500 mt-1.5">Blood group is required</p>}
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1.5">Address</label>
              <div className="relative">
                <MapPin size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-indigo-400 pointer-events-none" />
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="City, State"
                  className={patientField(false)}
                />
              </div>
            </div>
          </div>

          <div className="mt-4">
            <label className="text-xs font-semibold text-slate-700 block mb-1.5">AYUSH Number (optional)</label>
            <div className="relative sm:w-1/2">
              <IdCard size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-indigo-400 pointer-events-none" />
              <input
                type="text"
                value={ayushNumber}
                onChange={(e) => setAyushNumber(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 14))}
                placeholder="14-character AYUSH ID"
                className={patientField(showValidation && ayushNumberInvalid)}
              />
            </div>
            {showValidation && ayushNumberInvalid && (
              <p className="text-xs text-red-500 mt-1.5">Must be exactly 14 characters ({ayushNumber.length}/14)</p>
            )}
          </div>
        </div>

        {/* ── Emergency Contact ── */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_1px_3px_rgba(30,41,59,0.04)] p-6 sm:p-7">
          <div className="flex items-start justify-between gap-3 mb-6">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-100/70 border border-indigo-100 flex items-center justify-center flex-shrink-0">
                <Phone size={16} className="text-indigo-600" />
              </div>
              <div>
                <h2 className="text-[15px] font-semibold text-slate-900">Emergency Contact</h2>
                <p className="text-xs text-slate-500 mt-0.5">Add someone we can reach in case of an emergency</p>
              </div>
            </div>
            {contacts.length < MAX_EMERGENCY_CONTACTS && (
              <button
                type="button"
                onClick={addContact}
                className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700 whitespace-nowrap flex-shrink-0 mt-1"
              >
                <Plus size={13} strokeWidth={2.5} /> Add Another Contact
              </button>
            )}
          </div>

          <div className="space-y-3">
            {contacts.map((contact, index) => (
              <div
                key={index}
                className={cn(
                  "grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl",
                  index > 0 && "border border-slate-100 bg-slate-50/60 p-4"
                )}
              >
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                    {index > 0 ? `Contact ${index + 1} Name` : "Contact Name"}
                  </label>
                  <div className="relative">
                    <User size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-indigo-400 pointer-events-none" />
                    <input
                      type="text"
                      value={contact.name}
                      onChange={(e) => updateContact(index, "name", e.target.value)}
                      placeholder="Name"
                      className={patientField(false)}
                    />
                  </div>
                </div>
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                      {index > 0 ? `Contact ${index + 1} Phone` : "Contact Phone"}
                    </label>
                    <div className="relative">
                      <PhoneCall size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-indigo-400 pointer-events-none" />
                      <input
                        type="tel"
                        value={contact.phone}
                        onChange={(e) => updateContact(index, "phone", e.target.value)}
                        placeholder="Phone"
                        className={patientField(false)}
                      />
                    </div>
                  </div>
                  {index > 0 && (
                    <button
                      type="button"
                      onClick={() => removeContact(index)}
                      aria-label="Remove contact"
                      className="flex-shrink-0 p-3 rounded-xl border border-slate-200 text-slate-400 hover:border-red-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <X size={15} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5 text-sm text-red-700 flex items-start gap-2">
            <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* ── Save area ── */}
        <div className="flex justify-end px-1 pt-1">
          <button
            onClick={handleSubmit}
            disabled={saving}
            className={cn(
              "w-full sm:w-auto px-8 py-3.5 rounded-xl text-sm font-semibold text-white transition-all duration-200",
              saving
                ? "opacity-60 cursor-not-allowed bg-gradient-to-r from-blue-600 to-indigo-600"
                : "bg-gradient-to-r from-blue-600 to-indigo-600 shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:shadow-indigo-500/30 hover:-translate-y-0.5 active:translate-y-0"
            )}
          >
            {saving ? "Saving…" : "Save Profile"}
          </button>
        </div>
      </div>
    </div>
  );
}