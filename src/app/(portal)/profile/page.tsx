"use client";

import { SITE_NAME } from "@/shared/config/site";
import { useState, useEffect, type ChangeEvent } from "react";
import Link from "next/link";
import { LogOut, MapPin, Building2 } from "lucide-react";
import { ABHABadge } from "@/components/Badges";
import { Progress } from "@/components/ui/progress";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useAuth } from "@/contexts/auth-context";
import { usePatientProfile } from "@/hooks/use-profile";
import { useDinacharyaTasks } from "@/hooks/use-dinacharya";
import { usePractitionerAnalytics } from "@/hooks/use-analytics";
import { usePatientRecordStats } from "@/hooks/use-consultations";
import { usePractitionerPrescriptions } from "@/hooks/use-prescriptions";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useIndiaStates, useIndiaCities } from "@/hooks/use-location";
import type { DinacharTask } from "@/lib/types";

const SHOW_PROFILE_SETTINGS_CARD = true;

const BLOOD_GROUPS = ["A+", "A−", "B+", "B−", "AB+", "AB−", "O+", "O−"];
const GENDERS = ["Male", "Female", "Non-binary", "Prefer not to say"];

const PATIENT_MENU = [
  { icon: "📝", label: "Create Profile", desc: "Complete your health record profile", href: "/profile/create-profile" },
  { icon: "👨‍👩‍👧‍👦", label: "Family Profiles", desc: "Manage linked members", href: "/profile/family" },
];

const PRACTITIONER_MENU = [
  { icon: "📝", label: "Create Profile", desc: "Set up your specialty, fee, and qualifications", href: "/profile/create-profile" },
  { icon: "📄", label: "Terms & Privacy Policy", desc: "Legal documentation", href: "/profile/terms" },
];

const ASSISTANT_MENU = [
  { icon: "📝", label: "Create Profile", desc: "Complete your assistant profile", href: "/profile/create-profile" },
  { icon: "🔔", label: "Notification Preferences", desc: "Appointment and follow-up alerts", href: "/profile/notification-prefs" },
  { icon: "❓", label: "Help & Support", desc: "FAQs and live support", href: "/profile/help" },
  { icon: "📄", label: "Terms & Privacy Policy", desc: "Legal documentation", href: "/profile/terms" },
];

/* Stats are now derived from context/DB — no hardcoded arrays */

function normalizeGender(g?: string): string {
  if (!g) return "";
  const lower = g.toLowerCase();
  if (lower === "male") return "Male";
  if (lower === "female") return "Female";
  if (lower === "other") return "Prefer not to say";
  if (lower === "non-binary") return "Non-binary";
  return g.charAt(0).toUpperCase() + g.slice(1).toLowerCase();
}

function normalizeBloodGroup(b?: string): string {
  if (!b) return "";
  return b.replace("-", "−");
}

export default function ProfilePage() {
  const { user, loading, updateUser, logout } = useAuth();
  const { data: profile } = usePatientProfile(user?.role === "patient" ? user?.id : undefined);
  const { data: assistantProfile, refetch: refetchAssistantProfile } = usePatientProfile(
    user?.role === "assistant" ? user?.id : undefined
  );
  const { data: practitionerProfile, refetch: refetchPractitionerProfile } = usePatientProfile(
    user?.role === "practitioner" ? user?.id : undefined
  );
  const { data: dbTasks } = useDinacharyaTasks(user?.role === "patient" ? user?.id : undefined);

  // Patient details hooks
  const { data: patientStats } = usePatientRecordStats(user?.role === "patient" ? user?.id : undefined);

  // Practitioner details hooks
  const { data: pracAnalytics } = usePractitionerAnalytics(user?.role === "practitioner" ? user?.id : undefined);
  const { data: pracPrescriptions } = usePractitionerPrescriptions(user?.role === "practitioner" ? user?.id : undefined);

  const [tasks, setTasks] = useState<DinacharTask[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [experience, setExperience] = useState("");

  // Practitioner practice location
  const [state, setState] = useState("");
  const [city, setCity] = useState("");
  const [clinicName, setClinicName] = useState("");
  const [clinicAddress, setClinicAddress] = useState("");

  const { data: statesData, loading: statesLoading } = useIndiaStates();
  const { data: citiesData, loading: citiesLoading } = useIndiaCities(state);
  const states = statesData ?? [];
  const cities = citiesData ?? [];
  const [showSignOut, setShowSignOut] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState("");

  const [form, setForm] = useState({
    name: user?.name ?? "",
    email: user?.email ?? "",
    phone: user?.phone ?? "",
    dob: user?.dob ?? "",
    gender: normalizeGender(user?.gender),
    bloodGroup: normalizeBloodGroup(user?.bloodGroup),
  });

  useEffect(() => {
    if (dbTasks && dbTasks.length > 0) setTasks(dbTasks);
  }, [dbTasks]);

  useEffect(() => {
    if (practitionerProfile) {
      setExperience(practitionerProfile.experience != null ? String(practitionerProfile.experience) : "");
      setState(practitionerProfile.state ?? "");
      setCity(practitionerProfile.city ?? "");
      setClinicName(practitionerProfile.clinicName ?? "");
      setClinicAddress(practitionerProfile.clinicAddress ?? "");
    }
  }, [practitionerProfile]);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("edit") === "1") setEditMode(true);
  }, []);

  useEffect(() => {
    if (user) {
      setForm({
        name: user.name ?? "",
        email: user.email ?? "",
        phone: user.phone ?? "",
        dob: user.dob ?? "",
        gender: normalizeGender(user.gender),
        bloodGroup: normalizeBloodGroup(user.bloodGroup),
      });
    }
  }, [user]);

  if (loading || !user) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-herb-green"></div>
      </div>
    );
  }

  const completedCount = tasks.filter((t) => t.done).length;
  const progressPct = tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0;
  const wellnessScore = tasks.length > 0 ? progressPct : 74;

  // Prakriti Assessment Mapping
  let prakritiComposition = [
    { dosha: "Vata", pct: 33, color: "bg-sky-100 text-sky-700" },
    { dosha: "Pitta", pct: 33, color: "bg-amber-100 text-amber-700" },
    { dosha: "Kapha", pct: 34, color: "bg-emerald-100 text-emerald-700" },
  ];
  let dominantPrakriti = "Assessing";
  let prakritiAdvice = "Balance all three doshas with a varied, seasonal diet and moderate routines.";
  let hasPrakriti = false;

  if (profile?.prakriti) {
    hasPrakriti = true;
    const rawP = profile.prakriti.toLowerCase().replace(/_/g, "-");
    dominantPrakriti = profile.prakriti;
    if (rawP === "vata-pitta" || rawP === "vata_pitta") {
      prakritiComposition = [
        { dosha: "Vata", pct: 45, color: "bg-sky-100 text-sky-700" },
        { dosha: "Pitta", pct: 40, color: "bg-amber-100 text-amber-700" },
        { dosha: "Kapha", pct: 15, color: "bg-emerald-100 text-emerald-700" },
      ];
      prakritiAdvice = "Dominant: Vata-Pitta. Focus on grounding routines and cooling foods.";
    } else if (rawP === "vata-kapha" || rawP === "vata_kapha") {
      prakritiComposition = [
        { dosha: "Vata", pct: 45, color: "bg-sky-100 text-sky-700" },
        { dosha: "Pitta", pct: 15, color: "bg-amber-100 text-amber-700" },
        { dosha: "Kapha", pct: 40, color: "bg-emerald-100 text-emerald-700" },
      ];
      prakritiAdvice = "Dominant: Vata-Kapha. Focus on warm, light meals and dynamic exercises.";
    } else if (rawP === "pitta-kapha" || rawP === "pitta_kapha") {
      prakritiComposition = [
        { dosha: "Vata", pct: 15, color: "bg-sky-100 text-sky-700" },
        { dosha: "Pitta", pct: 45, color: "bg-amber-100 text-amber-700" },
        { dosha: "Kapha", pct: 40, color: "bg-emerald-100 text-emerald-700" },
      ];
      prakritiAdvice = "Dominant: Pitta-Kapha. Focus on refreshing, light meals and calming habits.";
    } else if (rawP === "vata") {
      prakritiComposition = [
        { dosha: "Vata", pct: 70, color: "bg-sky-100 text-sky-700" },
        { dosha: "Pitta", pct: 15, color: "bg-amber-100 text-amber-700" },
        { dosha: "Kapha", pct: 15, color: "bg-emerald-100 text-emerald-700" },
      ];
      prakritiAdvice = "Dominant: Vata. Focus on nourishing, warm foods and regular schedules.";
    } else if (rawP === "pitta") {
      prakritiComposition = [
        { dosha: "Vata", pct: 15, color: "bg-sky-100 text-sky-700" },
        { dosha: "Pitta", pct: 70, color: "bg-amber-100 text-amber-700" },
        { dosha: "Kapha", pct: 15, color: "bg-emerald-100 text-emerald-700" },
      ];
      prakritiAdvice = "Dominant: Pitta. Focus on cooling foods, hydration, and mind relaxation.";
    } else if (rawP === "kapha") {
      prakritiComposition = [
        { dosha: "Vata", pct: 15, color: "bg-sky-100 text-sky-700" },
        { dosha: "Pitta", pct: 15, color: "bg-amber-100 text-amber-700" },
        { dosha: "Kapha", pct: 70, color: "bg-emerald-100 text-emerald-700" },
      ];
      prakritiAdvice = "Dominant: Kapha. Focus on warm, stimulating spices, and active workouts.";
    }
  }

  const isPractitioner = user?.role === "practitioner";
  const isAssistant = user?.role === "assistant";
  const menuItems = isPractitioner ? PRACTITIONER_MENU : isAssistant ? ASSISTANT_MENU : PATIENT_MENU;

  const stats = isPractitioner
    ? [
        { label: "Patients Seen", value: pracAnalytics ? String(pracAnalytics.totalPatients) : "0" },
        { label: "Prescriptions", value: pracPrescriptions ? String(pracPrescriptions.length) : "0" },
      ]
    : isAssistant
    ? [
        { label: "Role", value: "Assistant" },
        { label: "Linked Doctor", value: assistantProfile?.linkedDoctorName ?? "—" },
        { label: "Status", value: "Approved" },
      ]
    : [
        // Account owner + family members combined.
        { label: "Consultations", value: String(patientStats?.consultations ?? 0) },
        { label: "Prescriptions", value: String(patientStats?.prescriptions ?? 0) },
      ];

  const initials = user?.name
    ? user.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
    : "U";

  async function handleAvatarUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user?.id) return;

    setAvatarError("");
    setUploadingAvatar(true);

    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop() || "jpg";
      const path = `assistants/${user.id}-${Date.now()}.${ext}`;

      const { error: uploadErr } = await supabase.storage.from("avatars").upload(path, file, {
        upsert: true,
        contentType: file.type,
      });
      if (uploadErr) throw uploadErr;

      const { data: publicUrlData } = supabase.storage.from("avatars").getPublicUrl(path);
      const avatarUrl = publicUrlData.publicUrl;

      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error?.message || "Failed to save photo");
      }

      refetchAssistantProfile();
    } catch (err: any) {
      console.error("Avatar upload error:", err);
      setAvatarError(err.message || "Failed to upload photo.");
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handleSave() {
    const payload = {
      fullName: form.name.trim() || user?.name,
      phone: form.phone.trim() || user?.phone,
      dob: form.dob || undefined,
      gender: form.gender || undefined,
      bloodGroup: form.bloodGroup || undefined,
      ...(isPractitioner
        ? {
            experienceYears: experience ? Number(experience) : undefined,
            state,
            city,
            clinicName,
            clinicAddress,
          }
        : {}),
    };
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error?.message || "Failed to update profile");
      }
      updateUser({
        name: form.name.trim() || user?.name,
        phone: form.phone.trim() || user?.phone,
        dob: form.dob || undefined,
        gender: form.gender || undefined,
        bloodGroup: form.bloodGroup || undefined,
      });
      if (isPractitioner) refetchPractitionerProfile();
      setEditMode(false);
    } catch (err: any) {
      console.error("Profile save error:", err);
      alert(err.message || "Failed to save changes.");
    }
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-4xl mx-auto">
      {/* Hero */}
      <div className="bg-herb-gradient rounded-2xl px-6 py-8 mb-6 relative overflow-hidden">
        <div className="absolute -right-6 -top-6 w-36 h-36 rounded-full bg-white/5" />
        <div className="absolute -left-4 -bottom-8 w-28 h-28 rounded-full bg-white/5" />
        <div className="relative z-10 flex items-start gap-5">
          <div className="relative flex-shrink-0">
            <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-sm border-2 border-white/30 flex items-center justify-center overflow-hidden">
              {isAssistant && assistantProfile?.avatarUrl ? (
                <img src={assistantProfile.avatarUrl} alt={user?.name ?? "Assistant"} className="h-full w-full object-cover" />
              ) : (
                <span className="text-white text-2xl font-bold font-display">{initials}</span>
              )}
            </div>
            {isAssistant && (
              <label className="absolute -bottom-1.5 -right-1.5 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full bg-white text-herb-green shadow-sm hover:bg-herb-green/10 transition-colors">
                <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} disabled={uploadingAvatar} />
                <span className="text-xs">{uploadingAvatar ? "…" : "✏️"}</span>
              </label>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-xl font-semibold text-white">{user?.name ?? "Guest"}</h1>
            <p className="text-white/70 text-xs mt-0.5">+91 {user?.phone ?? "—"}</p>
            {user?.email && <p className="text-white/60 text-xs mt-0.5">{user.email}</p>}
            {avatarError && <p className="text-red-200 text-[10px] mt-1">{avatarError}</p>}
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              {isPractitioner ? (
                <span className="text-[10px] bg-white/15 border border-white/20 text-white px-2 py-0.5 rounded-full">
                  HPR Registered ✓
                </span>
              ) : isAssistant ? (
                <span className="text-[10px] bg-white/15 border border-white/20 text-white px-2 py-0.5 rounded-full">
                  {assistantProfile?.linkedDoctorName ? `Assists ${assistantProfile.linkedDoctorName}` : "Assistant"}
                </span>
              ) : user?.abhaLinked ? (
                <ABHABadge
                  abhaId={`${user.phone?.slice(-4) ?? ""}@abha`}
                  linked
                  className="!bg-white/15 !border-white/20 !text-white text-[10px]"
                />
              ) : (
                <Link href="/profile/abha">
                  <span className="text-[10px] bg-white/15 border border-white/20 text-white px-2 py-0.5 rounded-full hover:bg-white/25 transition-colors cursor-pointer">
                    + Link ABHA ID
                  </span>
                </Link>
              )}
              {!isPractitioner && user?.bloodGroup && (
                <span className="text-[10px] bg-white/15 border border-white/20 text-white px-2 py-0.5 rounded-full">
                  {user.bloodGroup}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={() => { setEditMode((v) => !v); }}
            className="hidden sm:flex items-center gap-2 bg-white/15 text-white border border-white/20 px-4 py-2 rounded-xl text-xs font-medium hover:bg-white/25 transition-colors flex-shrink-0"
          >
            {editMode ? "✕ Cancel" : "✏️ Edit Profile"}
          </button>
        </div>
        <div className={cn("relative z-10 grid gap-2 mt-6", stats.length === 2 ? "grid-cols-2" : "grid-cols-3")}>
          {stats.map((s) => (
            <div key={s.label} className="bg-white/10 backdrop-blur-sm rounded-xl p-2.5 text-center border border-white/10">
              <p className="font-display text-xl font-bold text-white">{s.value}</p>
              <p className="text-[10px] text-white/60 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Mobile edit toggle */}
      <button
        onClick={() => setEditMode((v) => !v)}
        className="sm:hidden w-full mb-4 py-2.5 border border-border rounded-xl text-sm font-medium text-foreground hover:bg-muted transition-colors"
      >
        {editMode ? "✕ Cancel Editing" : "✏️ Edit Profile"}
      </button>

      {/* Inline edit form */}
      {editMode && (
        <div className="bg-white rounded-2xl border border-herb-green/20 p-5 mb-6 shadow-sm">
          <h2 className="font-semibold text-foreground text-sm mb-4">Personal Details</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">Full Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                className="w-full text-sm border border-border rounded-xl px-3 py-2.5 focus:outline-none focus:border-herb-green/50 focus:ring-2 focus:ring-herb-green/10 transition-all"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">Email</label>
              <input
                type="email"
                value={form.email}
                disabled
                className="w-full text-sm border border-border rounded-xl px-3 py-2.5 bg-muted text-muted-foreground cursor-not-allowed"
              />
              <p className="text-[10px] text-muted-foreground mt-1">Email cannot be changed</p>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">Phone</label>
              <input
                type="text"
                value={form.phone}
                onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                placeholder="10-digit number"
                className="w-full text-sm border border-border rounded-xl px-3 py-2.5 focus:outline-none focus:border-herb-green/50 focus:ring-2 focus:ring-herb-green/10 transition-all placeholder:text-muted-foreground"
              />
            </div>
            {!isAssistant && (
              <>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1.5">Date of Birth</label>
                  <input
                    type="date"
                    value={form.dob}
                    onChange={(e) => setForm((p) => ({ ...p, dob: e.target.value }))}
                    className="w-full text-sm border border-border rounded-xl px-3 py-2.5 focus:outline-none focus:border-herb-green/50 focus:ring-2 focus:ring-herb-green/10 transition-all"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1.5">Gender</label>
                  <select
                    value={form.gender}
                    onChange={(e) => setForm((p) => ({ ...p, gender: e.target.value }))}
                    className="w-full text-sm border border-border rounded-xl px-3 py-2.5 focus:outline-none focus:border-herb-green/50 bg-white transition-all"
                  >
                    <option value="">Select gender</option>
                    {GENDERS.map((g) => <option key={g}>{g}</option>)}
                  </select>
                </div>
                {!isPractitioner && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1.5">Blood Group</label>
                    <select
                      value={form.bloodGroup}
                      onChange={(e) => setForm((p) => ({ ...p, bloodGroup: e.target.value }))}
                      className="w-full text-sm border border-border rounded-xl px-3 py-2.5 focus:outline-none focus:border-herb-green/50 bg-white transition-all"
                    >
                      <option value="">Select blood group</option>
                      {BLOOD_GROUPS.map((b) => <option key={b}>{b}</option>)}
                    </select>
                  </div>
                )}
                {isPractitioner && (
                  <>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground block mb-1.5">Experience (in years)</label>
                      <input
                        type="number"
                        min="0"
                        value={experience}
                        onChange={(e) => setExperience(e.target.value)}
                        placeholder="e.g. 5"
                        className="w-full text-sm border border-border rounded-xl px-3 py-2.5 focus:outline-none focus:border-herb-green/50 focus:ring-2 focus:ring-herb-green/10 transition-all placeholder:text-muted-foreground"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground block mb-1.5">State</label>
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
                        emptyMessage="No matching states."
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground block mb-1.5">City</label>
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
                        emptyMessage="No matching cities."
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground block mb-1.5">Clinic / Hospital Name</label>
                      <input
                        type="text"
                        value={clinicName}
                        onChange={(e) => setClinicName(e.target.value)}
                        placeholder={`e.g. ${SITE_NAME} Wellness Center`}
                        className="w-full text-sm border border-border rounded-xl px-3 py-2.5 focus:outline-none focus:border-herb-green/50 focus:ring-2 focus:ring-herb-green/10 transition-all placeholder:text-muted-foreground"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground block mb-1.5">Clinic / Hospital Address</label>
                      <input
                        type="text"
                        value={clinicAddress}
                        onChange={(e) => setClinicAddress(e.target.value)}
                        placeholder="Street, area, landmark"
                        className="w-full text-sm border border-border rounded-xl px-3 py-2.5 focus:outline-none focus:border-herb-green/50 focus:ring-2 focus:ring-herb-green/10 transition-all placeholder:text-muted-foreground"
                      />
                    </div>
                  </>
                )}
              </>
            )}
          </div>



          <div className="flex gap-3">
            <button
              onClick={handleSave}
              className="flex-1 py-2.5 bg-herb-green text-white text-sm font-semibold rounded-xl hover:bg-herb-green/90 transition-all active:scale-95"
            >
              Save Changes
            </button>
            <button
              onClick={() => setEditMode(false)}
              className="px-6 py-2.5 border border-border text-sm font-medium rounded-xl hover:bg-muted transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="space-y-6">
        {/* Left: Menu */}
        <div className="space-y-4">
          {/* Personal info summary (when not editing) */}
          {!editMode && (user?.dob || user?.gender || user?.bloodGroup || user?.email || user?.phone) && (
            <div className="bg-white rounded-2xl border border-border p-6 sm:p-8 shadow-sm">
              <h2 className="font-semibold text-foreground text-base mb-5">Personal Details</h2>
              <dl className="divide-y divide-border">
                {user?.dob && (
                  <div className="flex items-center gap-4 py-3.5 first:pt-0 last:pb-0">
                    <dt className="text-sm text-muted-foreground w-36 flex-shrink-0">Date of Birth</dt>
                    <dd className="text-sm font-semibold text-foreground text-left">{new Date(user.dob).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</dd>
                  </div>
                )}
                {user?.gender && (
                  <div className="flex items-center gap-4 py-3.5 first:pt-0 last:pb-0">
                    <dt className="text-sm text-muted-foreground w-36 flex-shrink-0">Gender</dt>
                    <dd className="text-sm font-semibold text-foreground text-left">{user.gender}</dd>
                  </div>
                )}
                {!isPractitioner && user?.bloodGroup && (
                  <div className="flex items-center gap-4 py-3.5 first:pt-0 last:pb-0">
                    <dt className="text-sm text-muted-foreground w-36 flex-shrink-0">Blood Group</dt>
                    <dd className="text-sm font-semibold text-foreground text-left">{user.bloodGroup}</dd>
                  </div>
                )}
                {isPractitioner && practitionerProfile?.experience != null && (
                  <div className="flex items-center gap-4 py-3.5 first:pt-0 last:pb-0">
                    <dt className="text-sm text-muted-foreground w-36 flex-shrink-0">Experience</dt>
                    <dd className="text-sm font-semibold text-foreground text-left">{practitionerProfile.experience} yrs</dd>
                  </div>
                )}
                {isPractitioner && practitionerProfile?.clinicName && (
                  <div className="flex items-center gap-4 py-3.5 first:pt-0 last:pb-0">
                    <dt className="text-sm text-muted-foreground w-36 flex-shrink-0">Clinic / Hospital</dt>
                    <dd className="text-sm font-semibold text-foreground text-left">{practitionerProfile.clinicName}</dd>
                  </div>
                )}
                {isPractitioner && practitionerProfile?.clinicAddress && (
                  <div className="flex items-center gap-4 py-3.5 first:pt-0 last:pb-0">
                    <dt className="text-sm text-muted-foreground w-36 flex-shrink-0">Clinic Address</dt>
                    <dd className="text-sm font-semibold text-foreground text-left">{practitionerProfile.clinicAddress}</dd>
                  </div>
                )}
                {isPractitioner && (practitionerProfile?.city || practitionerProfile?.state) && (
                  <div className="flex items-center gap-4 py-3.5 first:pt-0 last:pb-0">
                    <dt className="text-sm text-muted-foreground w-36 flex-shrink-0">Location</dt>
                    <dd className="text-sm font-semibold text-foreground text-left">
                      {[practitionerProfile.city, practitionerProfile.state].filter(Boolean).join(", ")}
                    </dd>
                  </div>
                )}
                {user?.email && (
                  <div className="flex items-center gap-4 py-3.5 first:pt-0 last:pb-0">
                    <dt className="text-sm text-muted-foreground w-36 flex-shrink-0">Email</dt>
                    <dd className="text-sm font-semibold text-foreground text-left truncate">{user.email}</dd>
                  </div>
                )}
                <div className="flex items-center gap-4 py-3.5 first:pt-0 last:pb-0">
                  <dt className="text-sm text-muted-foreground w-36 flex-shrink-0">Phone</dt>
                  <dd className="text-sm font-semibold text-foreground text-left">{user?.phone}</dd>
                </div>
              </dl>
            </div>
          )}

          {SHOW_PROFILE_SETTINGS_CARD && (
            <div className="bg-white rounded-2xl border border-border divide-y divide-border overflow-hidden">
              {menuItems.map((item) => (
                <Link key={item.label} href={item.href}>
                  <div className="flex items-center gap-3 px-5 py-4 hover:bg-muted/50 transition-colors">
                    <span className="text-xl w-8 text-center flex-shrink-0">{item.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{item.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                    </div>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="text-muted-foreground flex-shrink-0">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </div>
                </Link>
              ))}
            </div>
          )}

          <div className="flex justify-start">
            <button
              onClick={() => setShowSignOut(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-red-200 text-red-600 text-sm font-semibold hover:bg-red-50 hover:border-red-300 active:scale-95 transition-all"
            >
              <LogOut size={15} />
              Sign Out
            </button>
          </div>

          <p className="text-center text-[10px] text-muted-foreground">
            {SITE_NAME} v1.0.0 · ABDM Compliant · Privacy First
          </p>
        </div>
      </div>

      {/* Sign out confirmation dialog */}
      {showSignOut && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 px-6">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="text-red-500">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </div>
            <h3 className="font-display font-semibold text-foreground text-center">Sign out of {SITE_NAME}?</h3>
            <p className="text-sm text-muted-foreground text-center mt-2">
              You&apos;ll need your phone number to sign back in. Your health data is safely stored.
            </p>
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setShowSignOut(false)}
                className="flex-1 py-3 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors"
              >
                Stay
              </button>
              <button
                onClick={logout}
                className="flex-1 py-3 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 transition-colors"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}