"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "react-hot-toast";
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
import { FamilyDialog } from "./FamilyDialog";

type Relation = "Spouse" | "Parent" | "Child" | "Sibling" | "Other";

const RELATIONS: Relation[] = ["Spouse", "Parent", "Child", "Sibling", "Other"];
const GENDERS = ["Female", "Male", "Other", "Prefer not to say"];
const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

const LABEL = "block text-[13px] font-medium text-slate-700 mb-1.5";
const FIELD =
  "w-full h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 transition-colors hover:border-slate-300 focus:outline-none focus:border-herb-green focus:ring-2 focus:ring-herb-green/15";
const FIELD_ERROR = "border-red-300 hover:border-red-400 focus:border-red-400 focus:ring-red-100";
const BTN_PRIMARY =
  "inline-flex items-center justify-center gap-2 h-10 px-4 rounded-lg bg-herb-green text-white text-sm font-semibold hover:bg-herb-green/90 disabled:bg-slate-200 disabled:text-slate-500 disabled:cursor-not-allowed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-herb-green/30 focus-visible:ring-offset-2";
const BTN_SECONDARY =
  "inline-flex items-center justify-center h-10 px-4 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 disabled:opacity-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-herb-green/30";

function initials(name: string): string {
  return name.split(" ").filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "F";
}

function Chevron() {
  return (
    <svg
      className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function Spinner() {
  return <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" aria-hidden />;
}

/** Edit / Remove menu on a member card. Closes on outside click and Escape. */
function MemberMenu({ name, onEdit, onRemove }: { name: string; onEdit: () => void; onRemove: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const item = "w-full text-left px-3 py-2 text-[13px] rounded-md transition-colors focus-visible:outline-none";
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Actions for ${name}`}
        className="p-1.5 -mr-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-herb-green/30"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <circle cx="12" cy="5" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="12" cy="19" r="1.6" />
        </svg>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full mt-1 z-10 w-40 p-1 bg-white rounded-lg border border-slate-200 shadow-lg">
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onEdit();
            }}
            className={cn(item, "text-slate-700 hover:bg-slate-50 focus-visible:bg-slate-50")}
          >
            Edit profile
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onRemove();
            }}
            className={cn(item, "text-red-600 hover:bg-red-50 focus-visible:bg-red-50")}
          >
            Remove profile
          </button>
        </div>
      )}
    </div>
  );
}

export default function FamilyProfilesPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { data: members = [], loading, refetch } = useFamilyMembers(user?.id);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [phoneError, setPhoneError] = useState("");
  const [removing, setRemoving] = useState<FamilyMemberRow | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);

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

  const ageNumber = Number(form.age);
  const ageError = form.age !== "" && (!Number.isInteger(ageNumber) || ageNumber < 0 || ageNumber > 120)
    ? "Enter an age between 0 and 120"
    : "";
  const canSubmit = Boolean(form.name.trim() && form.age && !ageError && !phoneError && !submitting);

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

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setPhoneError("");
  }

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!canSubmit || !user?.id) return;
    if (form.phone && !validatePhoneNumber(form.phone)) return;

    setSubmitting(true);
    try {
      const birthYear = new Date().getFullYear() - parseInt(form.age);
      const dobString = `${birthYear}-06-15`; // Mid-year approximation for DOB
      const payload = {
        fullName: form.name.trim(),
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

      toast.success(editingId ? `${payload.fullName}'s profile was updated` : `${payload.fullName} was added to your family`);
      setForm(emptyForm);
      setEditingId(null);
      setPhoneError("");
      setShowForm(false);
      refetch();
    } catch (err) {
      console.error("Failed to save family member:", err);
      toast.error(err instanceof Error ? err.message : "Could not save the profile. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRemove() {
    if (!removing) return;
    setRemoveBusy(true);
    try {
      await deleteFamilyMemberApi(removing.id);
      toast.success(`${removing.name} was removed`);
      setRemoving(null);
      refetch();
    } catch (err) {
      console.error("Failed to remove family member:", err);
      toast.error(err instanceof Error ? err.message : "Could not remove the profile. Please try again.");
    } finally {
      setRemoveBusy(false);
    }
  }

  const list = members ?? [];

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-6xl mx-auto">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-slate-500 mb-4">
        <Link href="/profile" className="hover:text-slate-900 transition-colors">
          Profile
        </Link>
        <span aria-hidden>/</span>
        <span className="text-slate-900 font-medium">Family Profiles</span>
      </nav>

      {/* Page header */}
      <div className="flex items-start justify-between gap-4 mb-8 flex-wrap">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold text-slate-900 tracking-tight">Family Profiles</h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage your family&apos;s health profiles and book consultations on their behalf.
          </p>
        </div>
        <button type="button" onClick={openAddForm} className={BTN_PRIMARY}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden>
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add Family Member
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" aria-busy="true" aria-label="Loading family members">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[148px] rounded-xl border border-slate-200 bg-white p-5 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-slate-100" />
                <div className="space-y-2 flex-1">
                  <div className="h-3 w-1/2 rounded bg-slate-100" />
                  <div className="h-3 w-1/3 rounded bg-slate-100" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : list.length === 0 ? (
        /* Empty state */
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-16 text-center">
          <div className="w-12 h-12 mx-auto rounded-full bg-herb-green/[0.08] flex items-center justify-center text-herb-green">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
          <h2 className="mt-4 text-base font-semibold text-slate-900">No family members yet</h2>
          <p className="mt-1 text-sm text-slate-500 max-w-sm mx-auto">
            Add a family member to keep their health records and book consultations for them.
          </p>
          <button type="button" onClick={openAddForm} className={cn(BTN_PRIMARY, "mt-6")}>
            Add Family Member
          </button>
        </div>
      ) : (
        /* Member grid */
        <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {list.map((member) => (
            <li
              key={member.id}
              className="flex flex-col rounded-xl border border-slate-200 bg-white p-5 transition-all hover:border-slate-300 hover:shadow-[0_2px_8px_rgba(15,23,42,0.06)]"
            >
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-full bg-herb-green/[0.08] text-herb-green flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-semibold">{initials(member.name)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-semibold text-slate-900 truncate">{member.name}</p>
                  <p className="text-[13px] text-slate-600 capitalize">{member.relationship}</p>
                </div>
                <MemberMenu name={member.name} onEdit={() => openEditForm(member)} onRemove={() => setRemoving(member)} />
              </div>

              <dl className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-slate-500">
                <div className="flex gap-1">
                  <dt className="sr-only">Age</dt>
                  <dd>{member.age} yrs</dd>
                </div>
                {member.gender && (
                  <div className="flex gap-1">
                    <dt className="sr-only">Gender</dt>
                    <dd>{member.gender}</dd>
                  </div>
                )}
                {member.bloodGroup && (
                  <div className="flex gap-1">
                    <dt className="text-slate-400">Blood</dt>
                    <dd className="font-medium text-slate-700">{member.bloodGroup}</dd>
                  </div>
                )}
              </dl>

              <div className="mt-auto pt-4">
                <button
                  type="button"
                  onClick={async () => {
                    await setNavContext("records-family", { familyMemberId: member.id });
                    router.push("/records");
                  }}
                  className="inline-flex items-center gap-1.5 text-[13px] font-medium text-herb-green hover:text-herb-green/80 transition-colors rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-herb-green/30"
                >
                  View health records
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {list.length > 0 && (
        <p className="text-xs text-slate-400 text-center mt-8">
          Family health data is protected under your ABHA consent settings · ABDM compliant
        </p>
      )}

      {/* Add / edit dialog */}
      {showForm && (
        <FamilyDialog
          title={editingId ? "Edit Family Member" : "Add Family Member"}
          subtitle={editingId ? "Update this family member's health profile." : "Create a health profile for someone in your family."}
          onClose={closeForm}
          busy={submitting}
          footer={
            <>
              <button type="button" onClick={closeForm} disabled={submitting} className={BTN_SECONDARY}>
                Cancel
              </button>
              <button type="submit" form="family-member-form" disabled={!canSubmit} className={BTN_PRIMARY}>
                {submitting && <Spinner />}
                {submitting ? (editingId ? "Saving…" : "Adding…") : editingId ? "Save Changes" : "Add Member"}
              </button>
            </>
          }
        >
          <form id="family-member-form" onSubmit={handleSubmit} noValidate className="space-y-6">
            <fieldset className="space-y-4">
              <legend className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-3">Personal information</legend>

              <div>
                <label htmlFor="fm-name" className={LABEL}>
                  Full name <span className="text-red-500" aria-hidden>*</span>
                </label>
                <input
                  id="fm-name"
                  data-autofocus
                  type="text"
                  required
                  autoComplete="name"
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Priya Kumar"
                  className={FIELD}
                />
              </div>

              <div>
                <span id="fm-relation-label" className={LABEL}>
                  Relationship <span className="text-red-500" aria-hidden>*</span>
                </span>
                <div role="radiogroup" aria-labelledby="fm-relation-label" className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                  {RELATIONS.map((r) => {
                    const selected = form.relation === r;
                    return (
                      <button
                        key={r}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => setForm((p) => ({ ...p, relation: r }))}
                        className={cn(
                          "h-9 rounded-lg border text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-herb-green/30",
                          selected
                            ? "border-herb-green bg-herb-green/[0.06] text-herb-green"
                            : "border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-900"
                        )}
                      >
                        {r}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="fm-age" className={LABEL}>
                    Age <span className="text-red-500" aria-hidden>*</span>
                  </label>
                  <div className="relative">
                    <input
                      id="fm-age"
                      type="number"
                      inputMode="numeric"
                      required
                      min={0}
                      max={120}
                      value={form.age}
                      onChange={(e) => setForm((p) => ({ ...p, age: e.target.value }))}
                      placeholder="0"
                      aria-invalid={Boolean(ageError)}
                      aria-describedby={ageError ? "fm-age-error" : undefined}
                      className={cn(FIELD, "pr-14", ageError && FIELD_ERROR)}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-slate-400 pointer-events-none">years</span>
                  </div>
                  {ageError && (
                    <p id="fm-age-error" className="mt-1.5 text-xs text-red-600">{ageError}</p>
                  )}
                </div>
                <div>
                  <label htmlFor="fm-gender" className={LABEL}>Gender</label>
                  <div className="relative">
                    <select
                      id="fm-gender"
                      value={form.gender}
                      onChange={(e) => setForm((p) => ({ ...p, gender: e.target.value }))}
                      className={cn(FIELD, "appearance-none pr-9")}
                    >
                      {GENDERS.map((g) => (
                        <option key={g}>{g}</option>
                      ))}
                    </select>
                    <Chevron />
                  </div>
                </div>
                <div>
                  <label htmlFor="fm-blood" className={LABEL}>Blood group</label>
                  <div className="relative">
                    <select
                      id="fm-blood"
                      value={form.bloodGroup}
                      onChange={(e) => setForm((p) => ({ ...p, bloodGroup: e.target.value }))}
                      className={cn(FIELD, "appearance-none pr-9", !form.bloodGroup && "text-slate-400")}
                    >
                      <option value="">Not known</option>
                      {BLOOD_GROUPS.map((bg) => (
                        <option key={bg} className="text-slate-900">{bg}</option>
                      ))}
                    </select>
                    <Chevron />
                  </div>
                </div>
              </div>
            </fieldset>

            <fieldset className="space-y-4 pt-5 border-t border-slate-100">
              <legend className="sr-only">Contact information</legend>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400" aria-hidden>Contact information</p>
              <div>
                <label htmlFor="fm-phone" className={LABEL}>
                  Phone number <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <PhoneInput
                  id="fm-phone"
                  international
                  defaultCountry="IN"
                  value={form.phone as E164Number | undefined}
                  onChange={handlePhoneChange}
                  maxLength={16}
                  placeholder="Enter phone number"
                  aria-invalid={Boolean(phoneError)}
                  aria-describedby={phoneError ? "fm-phone-error" : undefined}
                  className={cn(
                    "flex h-10 w-full items-center rounded-lg border bg-white px-3 text-sm text-slate-900 transition-colors [&>input]:bg-transparent [&>input]:outline-none [&>input]:ml-2 [&>input]:placeholder:text-slate-400 [&_.PhoneInputCountryIcon]:w-6 [&_.PhoneInputCountryIcon]:h-4 [&_.PhoneInputCountryIconImg]:w-full [&_.PhoneInputCountryIconImg]:h-full",
                    phoneError
                      ? "border-red-300 focus-within:ring-2 focus-within:ring-red-100"
                      : "border-slate-200 hover:border-slate-300 focus-within:border-herb-green focus-within:ring-2 focus-within:ring-herb-green/15"
                  )}
                />
                {phoneError && (
                  <p id="fm-phone-error" className="mt-1.5 text-xs text-red-600">{phoneError}</p>
                )}
              </div>
            </fieldset>
          </form>
        </FamilyDialog>
      )}

      {/* Remove confirmation */}
      {removing && (
        <FamilyDialog
          size="sm"
          title="Remove family member?"
          subtitle={`${removing.name}'s profile will be removed from your account.`}
          onClose={() => setRemoving(null)}
          busy={removeBusy}
          footer={
            <>
              <button type="button" data-autofocus onClick={() => setRemoving(null)} disabled={removeBusy} className={BTN_SECONDARY}>
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRemove}
                disabled={removeBusy}
                className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300 focus-visible:ring-offset-2"
              >
                {removeBusy && <Spinner />}
                {removeBusy ? "Removing…" : "Remove"}
              </button>
            </>
          }
        >
          <p className="text-sm text-slate-600">
            You won&apos;t be able to book consultations for them until you add them again.
          </p>
        </FamilyDialog>
      )}
    </div>
  );
}
