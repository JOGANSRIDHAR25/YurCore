"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/auth-context";
import { setNavContext } from "@/lib/nav-context-client";
import {
  useFamilyMembers,
  addFamilyMemberApi,
  updateFamilyMemberApi,
  deleteFamilyMemberApi,
  type FamilyMemberRow,
} from "@/hooks/use-family";
import "react-phone-number-input/style.css";
import PhoneInput, { isValidPhoneNumber } from "react-phone-number-input";
import type { E164Number } from "libphonenumber-js";

type Relation = "Spouse" | "Parent" | "Child" | "Sibling" | "Other";

const RELATIONS: Relation[] = ["Spouse", "Parent", "Child", "Sibling", "Other"];
const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

export default function FamilyProfilesPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { data: members = [], loading, refetch } = useFamilyMembers(user?.id);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [phoneError, setPhoneError] = useState("");

  // Form state
  const emptyForm = {
    name: "",
    relation: "Spouse" as Relation,
    age: "",
    gender: "Female",
    phone: "",
    bloodGroup: "",
  };
  const [form, setForm] = useState(emptyForm);

  function validatePhoneNumber(value?: string): boolean {
    if (!value) {
      setPhoneError("");
      return true;
    }

    // Check international validity
    const valid = isValidPhoneNumber(value);

    // Strict 10-digit check for India (+91)
    if (value.startsWith("+91")) {
      const nationalNumber = value.slice(3); // Remove +91
      if (nationalNumber.length !== 10 || !/^[6-9]\d{9}$/.test(nationalNumber)) {
        setPhoneError("Please enter a valid 10-digit Indian mobile number");
        return false;
      }
    }

    if (!valid) {
      setPhoneError("Please enter a valid phone number");
      return false;
    }

    setPhoneError("");
    return true;
  }

  function handlePhoneChange(value?: string) {
    setForm((p) => ({
      ...p,
      phone: value || "",
    }));
    validatePhoneNumber(value);
  }

  function openAddForm() {
    setEditingId(null);
    setPhoneError("");
    setForm(emptyForm);
    setShowForm(true);
  }

  function openEditForm(member: FamilyMemberRow) {
    setEditingId(member.id);
    setActiveId(null);
    setPhoneError("");
    setForm({
      name: member.name,
      relation: (member.relationship.charAt(0).toUpperCase() +
        member.relationship.slice(1)) as Relation,
      age: String(member.age || ""),
      gender: member.gender || "Female",
      phone: member.phone ?? "",
      bloodGroup: member.bloodGroup ?? "",
    });
    setShowForm(true);
  }

  async function handleSubmit() {
    if (!form.name || !form.age || !user?.id) return;
    if (form.phone && !validatePhoneNumber(form.phone)) return;

    setSubmitting(true);
    try {
      const birthYear = new Date().getFullYear() - parseInt(form.age);
      const dobString = `${birthYear}-06-15`; // Mid-year approximation for DOB
      const payload = {
        fullName: form.name,
        relationship: form.relation.toLowerCase(),
        dob: dobString,
        gender: form.gender,
        phone: form.phone || undefined,
        bloodGroup: form.bloodGroup || undefined,
      };

      if (editingId) {
        await updateFamilyMemberApi(editingId, payload);
      } else {
        await addFamilyMemberApi(payload);
      }

      setForm(emptyForm);
      setEditingId(null);
      setPhoneError("");
      setShowForm(false);
      refetch();
    } catch (err) {
      console.error("Failed to save family member:", err);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRemove(id: string) {
    try {
      await deleteFamilyMemberApi(id);
      if (activeId === id) setActiveId(null);
      refetch();
    } catch (err) {
      console.error("Failed to remove family member:", err);
    }
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-7xl mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-5">
        <Link href="/profile" className="hover:text-foreground transition-colors">
          Profile
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium">Family Profiles</span>
      </div>

      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="font-display text-xl font-semibold text-foreground">
            Family Profiles
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage health profiles for family members. Book consultations on their behalf.
          </p>
        </div>
        <button
          onClick={openAddForm}
          className="px-4 py-2.5 bg-herb-green text-white text-sm font-semibold rounded-xl hover:bg-herb-green/90 transition-all"
        >
          + Add Member
        </button>
      </div>

      {/* Add/edit member form */}
      {showForm && (
        <div className="bg-white rounded-2xl border border-herb-green/20 p-5 mb-6 shadow-sm">
          <h3 className="font-semibold text-foreground text-sm mb-4">
            {editingId ? "Edit Family Member" : "New Family Member"}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                Full Name *
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Priya Kumar"
                className="w-full text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:border-herb-green/50"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                Relationship *
              </label>
              <select
                value={form.relation}
                onChange={(e) =>
                  setForm((p) => ({ ...p, relation: e.target.value as Relation }))
                }
                className="w-full text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:border-herb-green/50 bg-white"
              >
                {RELATIONS.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                Age *
              </label>
              <input
                type="number"
                value={form.age}
                onChange={(e) => setForm((p) => ({ ...p, age: e.target.value }))}
                placeholder="Age in years"
                className="w-full text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:border-herb-green/50"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                Gender
              </label>
              <select
                value={form.gender}
                onChange={(e) => setForm((p) => ({ ...p, gender: e.target.value }))}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:border-herb-green/50 bg-white"
              >
                {["Female", "Male", "Other", "Prefer not to say"].map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                Phone Number
              </label>
              <PhoneInput
                international
                defaultCountry="IN"
                value={form.phone as E164Number | undefined}
                onChange={handlePhoneChange}
                maxLength={16}
                placeholder="Enter phone number"
                className={cn(
                  "flex h-9.5 w-full items-center rounded-lg border bg-white px-3 py-1.5 text-sm transition-colors [&>input]:bg-transparent [&>input]:outline-none [&>input]:ml-2 [&_.PhoneInputCountryIcon]:w-6 [&_.PhoneInputCountryIcon]:h-4 [&_.PhoneInputCountryIconImg]:w-full [&_.PhoneInputCountryIconImg]:h-full",
                  phoneError
                    ? "border-red-500 focus-within:border-red-500"
                    : "border-border focus-within:border-herb-green/50"
                )}
              />
              {phoneError && (
                <p className="mt-1 text-[11px] text-red-500 font-medium">
                  {phoneError}
                </p>
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                Blood Group
              </label>
              <select
                value={form.bloodGroup}
                onChange={(e) =>
                  setForm((p) => ({ ...p, bloodGroup: e.target.value }))
                }
                className="w-full text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:border-herb-green/50 bg-white"
              >
                <option value="">Select</option>
                {BLOOD_GROUPS.map((bg) => (
                  <option key={bg}>{bg}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSubmit}
              disabled={!form.name || !form.age || Boolean(phoneError) || submitting}
              className={cn(
                "px-6 py-2 text-xs font-semibold rounded-lg transition-all",
                form.name && form.age && !phoneError && !submitting
                  ? "bg-herb-green text-white hover:bg-herb-green/90"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              )}
            >
              {submitting
                ? editingId
                  ? "Saving..."
                  : "Adding..."
                : editingId
                ? "Save Changes"
                : "Add Profile"}
            </button>
            <button
              onClick={() => {
                setShowForm(false);
                setEditingId(null);
                setPhoneError("");
              }}
              className="px-4 py-2 border border-border text-xs font-medium rounded-lg hover:bg-muted transition-colors text-muted-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-20 text-center text-sm text-muted-foreground">
          Loading family members...
        </div>
      ) : (
        /* Member grid */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {(members || []).map((member) => (
            <div
              key={member.id}
              className={cn(
                "bg-white rounded-2xl border p-5 transition-all",
                activeId === member.id
                  ? "border-herb-green/40 shadow-sm"
                  : "border-border"
              )}
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-herb-gradient flex items-center justify-center flex-shrink-0">
                    <span className="text-white font-bold text-lg">
                      {member.name ? member.name[0] : "F"}
                    </span>
                  </div>
                  <div>
                    <p className="font-semibold text-foreground text-sm">
                      {member.name}
                    </p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {member.relationship} · {member.age}y · {member.gender}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() =>
                    setActiveId(activeId === member.id ? null : member.id)
                  }
                  className="p-1 rounded-lg hover:bg-muted transition-colors"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    className="text-muted-foreground"
                  >
                    <circle cx="12" cy="5" r="1" />
                    <circle cx="12" cy="12" r="1" />
                    <circle cx="12" cy="19" r="1" />
                  </svg>
                </button>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    await setNavContext("records-family", { familyMemberId: member.id });
                    router.push("/records");
                  }}
                  className="px-6 py-2 border border-border rounded-xl text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
                >
                  Records
                </button>
              </div>

              {/* Expanded menu */}
              {activeId === member.id && (
                <div className="mt-3 pt-3 border-t border-border space-y-1">
                  <button
                    onClick={() => openEditForm(member)}
                    className="w-full text-left text-xs py-1.5 px-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                  >
                    Edit Profile
                  </button>
                  <button
                    onClick={() => handleRemove(member.id)}
                    className="w-full text-left text-xs py-1.5 px-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    Remove Profile
                  </button>
                </div>
              )}
            </div>
          ))}

          {/* Add placeholder */}
          {(!members || members.length === 0) && !showForm && (
            <div className="col-span-full bg-white rounded-2xl border border-dashed border-border p-12 text-center">
              <span className="text-4xl">👨‍👩‍👧‍👦</span>
              <p className="font-semibold text-foreground mt-3">
                No family profiles yet
              </p>
              <p className="text-xs text-muted-foreground mt-1 mb-4">
                Add family members to book consultations on their behalf
              </p>
              <button
                onClick={openAddForm}
                className="px-5 py-2.5 bg-herb-green text-white text-sm font-semibold rounded-xl hover:bg-herb-green/90"
              >
                Add First Member
              </button>
            </div>
          )}
        </div>
      )}

      {members && members.length > 0 && (
        <p className="text-[10px] text-muted-foreground text-center mt-6">
          Family health data is protected under your ABHA consent settings · ABDM compliant
        </p>
      )}
    </div>
  );
}