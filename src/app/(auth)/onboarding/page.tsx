"use client";

import { SITE_NAME } from "@/shared/config/site";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/auth-context";
import { toast } from "react-hot-toast";
import { Shield, AlertCircle, Stethoscope, HeartPulse, Check, UserCog } from "lucide-react";
import PhoneInput from "react-phone-number-input/max";
import "react-phone-number-input/style.css";
import { isValidPhoneNumber } from "react-phone-number-input/max";
import type { E164Number } from "libphonenumber-js/core";

type Step =
  | "welcome"
  | "phone"
  | "otp"
  | "role";

type Flow = "new" | "returning";

type DoctorSearchResult = {
  id: string;
  fullName: string;
  email: string;
  specializations: string[];
};

export default function OnboardingPage() {
  const router = useRouter();
  const { login } = useAuth();

  const [step, setStep] = useState<Step>("welcome");
  const [flow, setFlow] = useState<Flow>("new");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [resendTimer, setResendTimer] = useState(300);
  const [role, setRole] = useState<"patient" | "doctor" | "assistant" | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [doctorShowValidation, setDoctorShowValidation] = useState(false);
  const [accountExists, setAccountExists] = useState(false);

  // Common intake
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");

  // Assistant intake — links the new account to an existing, verified doctor
  const [doctorQuery, setDoctorQuery] = useState("");
  const [doctorResults, setDoctorResults] = useState<DoctorSearchResult[]>([]);
  const [selectedDoctor, setSelectedDoctor] = useState<DoctorSearchResult | null>(null);
  const [searchingDoctors, setSearchingDoctors] = useState(false);

  const STEPS_NEW: Step[] = ["welcome", "phone", "otp", "role"];
  const STEPS_RETURNING: Step[] = ["welcome", "phone", "otp"];
  const stepsOrder = flow === "returning" ? STEPS_RETURNING : STEPS_NEW;
  const progressPct = step === "welcome" ? 0 : (stepsOrder.indexOf(step) / (stepsOrder.length - 1)) * 100;

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  function startResendTimer() {
    let t = 300;
    setResendTimer(t);
    const interval = setInterval(() => {
      t--;
      setResendTimer(t);
      if (t <= 0) clearInterval(interval);
    }, 1000);
  }

  async function handleSendOTP() {
    if (!email) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/send-otp/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send OTP.");

      startResendTimer();
      setStep("otp");
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to send OTP.");
    } finally {
      setLoading(false);
    }
  }

  function handleOtpInput(index: number, val: string) {
    const numericVal = val.replace(/\D/g, ""); // Allow only digits
    if (!numericVal) {
      const next = [...otp];
      next[index] = "";
      setOtp(next);
      return;
    }
    const next = [...otp];
    next[index] = numericVal.slice(-1);
    setOtp(next);
    if (index < 5) {
      (document.getElementById(`otp-${index + 1}`) as HTMLInputElement)?.focus();
    }
  }

  function handleOtpKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      const next = [...otp];
      if (otp[index]) {
        next[index] = "";
        setOtp(next);
      } else if (index > 0) {
        next[index - 1] = "";
        setOtp(next);
        (document.getElementById(`otp-${index - 1}`) as HTMLInputElement)?.focus();
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      (document.getElementById(`otp-${index - 1}`) as HTMLInputElement)?.focus();
    } else if (e.key === "ArrowRight" && index < 5) {
      (document.getElementById(`otp-${index + 1}`) as HTMLInputElement)?.focus();
    }
  }

  function handleOtpPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const pastedData = e.clipboardData.getData("text").trim();
    if (!/^\d{6}$/.test(pastedData)) return; // Only allow 6-digit numeric codes

    const next = pastedData.split("");
    setOtp(next);

    // Focus the last input
    (document.getElementById("otp-5") as HTMLInputElement)?.focus();
  }

  useEffect(() => {
    if (step === "otp") {
      setTimeout(() => {
        (document.getElementById("otp-0") as HTMLInputElement)?.focus();
      }, 50);
    }
  }, [step]);

  // Debounced doctor search for the assistant role, shown inline on the role step.
  useEffect(() => {
    if (step !== "role" || role !== "assistant" || doctorQuery.trim().length < 2) {
      setDoctorResults([]);
      return;
    }

    let active = true;
    setSearchingDoctors(true);

    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/practitioners/search?q=${encodeURIComponent(doctorQuery.trim())}`,
          { cache: "no-store" }
        );
        const data = await response.json().catch(() => null);
        if (active) {
          setDoctorResults(response.ok ? data?.data ?? [] : []);
        }
      } catch {
        if (active) setDoctorResults([]);
      } finally {
        if (active) setSearchingDoctors(false);
      }
    }, 300);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [doctorQuery, step]);

  async function handleVerifyOTP() {
    const otpString = otp.join("");
    if (otpString.length < 6) return;
    setLoading(true);
    setError("");

    try {
      // Single API call handles both OTP verification and returning user check
      const res = await fetch("/api/auth/login/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp: otpString }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to verify OTP.");
      }

      if (data.data?.returning === false) {
        // New user — OTP is verified, proceed to role selection
        setFlow("new");
        setStep("role");
      } else {
        // Returning user — successfully logged in
        const { user: dbUser } = data.data;
        login({
          id: dbUser.id,
          phone: dbUser.phone || "",
          role: dbUser.role as any,
          name: dbUser.name,
          abhaLinked: true,
          email: dbUser.email,
        });
        router.push(dbUser.role === "doctor" || dbUser.role === "practitioner" ? "/pro" : "/discover");
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to verify OTP.");
    } finally {
      setLoading(false);
    }
  }

  async function finishPatient() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/onboard-patient/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName,
          phone: phone || "",
          email,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || "Failed to create patient account.");

      login({ id: data.data?.userId || "", phone: phone || "", role: "patient", name: fullName, abhaLinked: false, email });
      toast.success("Account created successfully!");
      // Land on profile completion first, not the dashboard — the account exists
      // but the health record itself is still empty at this point.
      router.push("/profile/create-profile");
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to create patient account.");
    } finally {
      setLoading(false);
    }
  }

  async function finishDoctorQuick() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/onboard-doctor/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          phone,
          fullName,
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || "Failed to save profile.");
      }

      // Update frontend AuthContext so client-side routing knows the user is a doctor
      login({
        id: data.data?.userId || "",
        phone: phone || "",
        role: "practitioner",
        name: fullName,
        abhaLinked: false,
        email
      });

      // Land on profile completion first — the practitioner record exists but
      // still needs qualifications/specialty/fee/documents before admin review.
      router.push("/profile/create-profile");
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to save profile.");
    } finally {
      setLoading(false);
    }
  }

  async function finishAssistant() {
    if (!fullName.trim()) {
      setError("Please enter your full name.");
      return;
    }
    if (!selectedDoctor) {
      setError("Please search for and select the doctor you assist.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/onboard-assistant/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          phone,
          fullName,
          practitionerId: selectedDoctor.id,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || "Failed to create assistant account.");
      }

      // Update frontend AuthContext so client-side routing knows the user is an assistant
      login({
        id: data.data?.userId || "",
        phone: phone || "",
        role: "assistant" as any,
        name: fullName,
        abhaLinked: false,
        email,
      });

      router.push("/pro");
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to create assistant account.");
    } finally {
      setLoading(false);
    }
  }


  return (
    <div className="min-h-full flex items-center justify-center bg-background py-6 sm:py-8 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-lg sm:max-w-xl md:max-w-2xl lg:max-w-3xl transition-[max-width] duration-300">
        {step !== "welcome" && (
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-3">
              <button
                onClick={() => {
                  if (step === "otp") setStep("welcome");
                  else if (step === "role") setStep("otp");
                }}
                className="p-1.5 rounded-lg hover:bg-muted transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <div className="flex-1 h-1 bg-border rounded-full overflow-hidden">
                <div
                  className="h-full bg-herb-green rounded-full transition-all duration-500"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {/* ── Welcome ── */}
        {step === "welcome" && (
          <div className="text-center w-full max-w-3xl mx-auto flex flex-col relative z-10 animate-in fade-in slide-in-from-bottom-8 duration-700">
            {/* Background Subtle Glows (Scoped to welcome step container if needed, or just relying on page bg) */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-tr from-blue-100/40 via-purple-100/40 to-transparent rounded-full blur-3xl opacity-60 pointer-events-none -z-10" />

            {/* Hero Section */}
            <div className="mb-10 flex flex-col items-center">
              {/* Brand Logo */}
              <h1 className="text-[48px] md:text-[56px] font-bold tracking-tight mb-4">
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#3B5BFF] to-[#A855F7] drop-shadow-sm">
                  {SITE_NAME}
                </span>
              </h1>

              {/* Tagline */}
              <p className="text-[#6B7280] text-base md:text-lg font-medium leading-relaxed max-w-[500px] mx-auto">
                India&apos;s first AYUSH digital health ecosystem — connecting ancient healing wisdom with verified modern care.
              </p>
            </div>

            {/* Welcome Section */}
            <div className="mb-8 flex flex-col items-center">
              <h2 className="text-[#111827] text-[32px] md:text-[36px] font-bold tracking-tight mb-3 leading-tight">
                Create Your Account
              </h2>
              <p className="text-[#6B7280] text-base md:text-[18px] font-medium max-w-[450px]">
                Begin your journey towards natural, holistic wellness.
              </p>
            </div>

            {/* Email Input section */}
            <div className="w-full flex flex-col items-center justify-center gap-4">
              <div className="w-full max-w-[400px]">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setAccountExists(false); }}
                  onBlur={async () => {
                    if (!email || !email.includes("@")) return;
                    try {
                      const res = await fetch(`/api/auth/check-account?email=${encodeURIComponent(email)}`);
                      const data = await res.json();
                      setAccountExists(!!data?.data?.exists);
                    } catch {
                      setAccountExists(false);
                    }
                  }}
                  placeholder="Enter your email address"
                  className="w-full px-4 py-3 border border-border rounded-xl text-sm focus:outline-none focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/20 bg-white shadow-sm"
                />
              </div>

              {accountExists && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl px-3.5 py-2.5 text-sm text-blue-700 w-full max-w-[400px] text-left">
                  An account with this email already exists.
                </div>
              )}

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5 text-sm text-red-700 w-full max-w-[400px] flex items-start gap-2 text-left">
                  <AlertCircle size={16} className="mt-0.5 min-w-[16px]" />
                  <span>{error}</span>
                </div>
              )}

              <button
                onClick={() => { handleSendOTP(); }}
                disabled={!email || !email.includes("@")}
                className="w-full max-w-[400px] h-[52px] rounded-[14px] bg-gradient-to-r from-[#3B5BFF] to-[#A855F7] text-white text-base font-semibold flex items-center justify-center gap-2 transition-all duration-300 ease-out hover:-translate-y-0.5 hover:shadow-lg hover:shadow-purple-500/25 active:translate-y-0 active:shadow-md cursor-pointer focus:outline-none focus-visible:ring-4 focus-visible:ring-purple-500/30 disabled:opacity-50 disabled:cursor-not-allowed group"
              >
                {loading ? "Sending OTP..." : accountExists ? "Sign In" : "Continue"}
                {!loading && (
                  <svg className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ── OTP ── */}
        {step === "otp" && (
          <div className="text-center">
            {/* Security Shield Icon Header */}
            <div className="mx-auto w-16 h-16 bg-herb-green/10 rounded-2xl flex items-center justify-center mb-6 animate-pulse">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth={2}>
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>

            <h2 className="font-display text-2xl font-bold text-foreground mb-1">Verify OTP</h2>
            <p className="text-sm text-muted-foreground mb-8 leading-relaxed">
              We sent a 6-digit confirmation code to <br/>
              <span className="font-medium text-foreground">{email}</span>
            </p>

            {/* Input boxes with modern styling */}
            <div className="flex gap-2.5 justify-center mb-8">
              {otp.map((digit, i) => (
                <input
                  key={i}
                  id={`otp-${i}`}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleOtpInput(i, e.target.value)}
                  onKeyDown={(e) => handleOtpKeyDown(i, e)}
                  onPaste={handleOtpPaste}
                  className={cn(
                    "w-11 h-14 text-center text-xl font-bold font-mono border rounded-2xl transition-all duration-200 bg-background shadow-sm focus:outline-none focus:ring-4 focus:ring-herb-green/15 focus:scale-105",
                    digit ? "border-herb-green border-2 bg-herb-green/5" : "border-border hover:border-muted-foreground/30 focus:border-herb-green"
                  )}
                />
              ))}
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5 text-sm text-red-700 mb-6 flex items-start gap-2 text-left">
                <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Countdown / Resend UI */}
            <div className="flex justify-between items-center mb-3 max-w-[200px] mx-auto">
              <span className="text-[11px] text-muted-foreground">
                {resendTimer > 0 ? `Expires in ${formatTimer(resendTimer)}` : "OTP Expired"}
              </span>
              {resendTimer === 0 && (
                <button
                  type="button"
                  onClick={handleSendOTP}
                  className="text-[11px] text-herb-green font-medium hover:underline"
                >
                  Resend OTP
                </button>
              )}
            </div>

            <button
              onClick={handleVerifyOTP}
              disabled={otp.join("").length < 6 || loading}
              className={cn(
                "w-full max-w-[200px] mx-auto py-2.5 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2",
                otp.join("").length === 6 && !loading
                  ? "bg-herb-green text-white hover:bg-herb-green/90 shadow-md hover:shadow-lg active:scale-[0.99]"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              )}
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
                  <span>Verifying...</span>
                </>
              ) : (
                <span>{flow === "returning" ? "Sign In" : "Verify & Continue"}</span>
              )}
            </button>
          </div>
        )}

        {/* ── Personal Info & Role Selection ── */}
        {step === "role" && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="font-display text-2xl font-bold text-foreground tracking-tight mb-1.5">Complete Your Profile</h2>
            <p className="text-sm text-muted-foreground mb-6">Tell us a bit about yourself</p>
            
            <div className="space-y-4 mb-6">
             <div>
              <label className="text-xs font-semibold text-foreground block mb-1">
                Full Name <span className="text-red-500">*</span>
              </label>

              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Enter your full name"
                className="w-[570px] h-10 px-3 border border-border rounded-lg text-sm focus:outline-none focus:border-herb-green/50 bg-white"
              />
            </div>
              <div className="w-full max-w-xl">
                <label className="text-xs font-semibold text-foreground block mb-1.5">
                  Phone Number <span className="text-red-500">*</span>
                </label>

                <div className="phone-wrapper">
                  <PhoneInput
                    international
                    defaultCountry="IN"
                    limitMaxLength
                    value={phone as E164Number | undefined}
                    onChange={(value) => setPhone(value || "")}
                    placeholder="Enter phone number"
                    type="tel"
                    autoComplete="tel"
                    className="phone-input"
                  />
                </div>

                <p className="text-[11px] text-muted-foreground mt-1.5">
                  Select your country and enter your phone number
                </p>

                {phone && !isValidPhoneNumber(phone) && (
                  <p className="text-[11px] text-red-500 mt-1">
                    Please enter a valid phone number
                  </p>
                )}
              </div>
            </div>

            <h3 className="font-semibold text-foreground mb-3 text-sm">Select Your Role</h3>
            <div className="space-y-3 mb-6">
              {[
                { id: "patient" as const, Icon: HeartPulse, title: "Patient / Health Seeker", desc: "Book consultations, manage health records, track wellness" },
                { id: "doctor" as const, Icon: Stethoscope, title: "AYUSH Doctor / Specialist", desc: "Consult patients, write digital EMR prescriptions, build practice" },
                { id: "assistant" as const, Icon: UserCog, title: "Doctor's Assistant", desc: "Manage a doctor's appointments, prescriptions and records with their approval" },
              ].map((r) => {
                const selected = role === r.id;
                return (
                  <div key={r.id}>
                    <button
                      onClick={() => setRole(r.id)}
                      className={cn(
                        "w-full flex items-center gap-4 p-4 rounded-2xl border text-left transition-all duration-200 group",
                        selected
                          ? "border-herb-green/40 bg-herb-green/[0.04] shadow-[0_1px_2px_rgba(0,0,0,0.04),0_0_0_1px_rgba(0,0,0,0.02)] ring-1 ring-herb-green/20"
                          : "border-border/70 hover:border-herb-green/25 hover:bg-muted/30 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)]"
                      )}
                    >
                      <div
                        className={cn(
                          "w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors",
                          selected ? "bg-herb-green text-white" : "bg-muted text-muted-foreground group-hover:text-herb-green/70"
                        )}
                      >
                        <r.Icon size={20} strokeWidth={2} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-[15px] text-foreground leading-tight">{r.title}</p>
                        <p className="text-[13px] text-muted-foreground mt-1 leading-snug">{r.desc}</p>
                      </div>
                      <div
                        className={cn(
                          "w-5 h-5 rounded-full border flex items-center justify-center flex-shrink-0 transition-all",
                          selected ? "bg-herb-green border-herb-green" : "border-border/80 bg-white"
                        )}
                      >
                        {selected && <Check size={12} strokeWidth={3} className="text-white" />}
                      </div>
                    </button>
                    {/* Inline Assistant Search */}
                    {selected && r.id === "assistant" && (
                      <div className="mt-3 p-4 bg-muted/30 rounded-xl border border-border/50 animate-in fade-in slide-in-from-top-2 duration-300">
                        <label className="text-xs font-semibold text-foreground block mb-2">
                          Search and Select the Doctor you assist <span className="text-red-500">*</span>
                        </label>
                        {selectedDoctor ? (
                          <div className="flex items-center justify-between rounded-xl border border-herb-green/40 bg-white px-3.5 py-2.5 shadow-sm">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-foreground">{selectedDoctor.fullName}</p>
                              <p className="truncate text-xs text-muted-foreground">{selectedDoctor.email}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedDoctor(null);
                                setDoctorQuery("");
                              }}
                              className="ml-2 flex-shrink-0 text-xs font-medium text-herb-green hover:underline"
                            >
                              Change
                            </button>
                          </div>
                        ) : (
                          <div className="relative">
                            <input
                              type="text"
                              value={doctorQuery}
                              onChange={(e) => setDoctorQuery(e.target.value)}
                              placeholder="Search by doctor name or email"
                              className="w-full px-4 py-2.5 border border-border rounded-xl text-sm focus:outline-none focus:border-herb-green/50 bg-white"
                            />
                            {(searchingDoctors || doctorResults.length > 0) && doctorQuery.trim().length >= 2 && (
                              <div className="absolute z-10 mt-1.5 max-h-56 w-full overflow-y-auto rounded-xl border border-border bg-white shadow-lg">
                                {searchingDoctors ? (
                                  <p className="px-3.5 py-2.5 text-xs text-muted-foreground">Searching…</p>
                                ) : doctorResults.length === 0 ? (
                                  <p className="px-3.5 py-2.5 text-xs text-muted-foreground">No verified doctors found.</p>
                                ) : (
                                  doctorResults.map((doc) => (
                                    <button
                                      key={doc.id}
                                      type="button"
                                      onClick={() => {
                                        setSelectedDoctor(doc);
                                        setDoctorResults([]);
                                      }}
                                      className="block w-full px-3.5 py-2.5 text-left text-sm hover:bg-muted transition-colors"
                                    >
                                      <p className="font-medium text-foreground">{doc.fullName}</p>
                                      <p className="text-xs text-muted-foreground">{doc.email}</p>
                                    </button>
                                  ))
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5 text-sm text-red-700 mb-6 flex items-start gap-2">
                <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              onClick={() => {
                if (!fullName.trim() || !phone.trim()) {
                   setError("Please enter your full name and phone number.");
                   return;
                }
                if (role === "doctor") {
                   finishDoctorQuick();
                } else if (role === "assistant") {
                   finishAssistant();
                } else {
                   finishPatient();
                }
              }}
              disabled={!role || loading}
              className={cn(
                "w-full py-3.5 rounded-xl text-sm font-semibold transition-all duration-200",
                role && !loading
                  ? "bg-herb-green text-white hover:bg-herb-green/90 shadow-md shadow-herb-green/15 active:scale-[0.99]"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              )}
            >
              {loading ? "Please wait..." : "Complete Setup"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}