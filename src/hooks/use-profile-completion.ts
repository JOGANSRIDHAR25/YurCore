"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";

export type ProfileCompletion = {
  applicable: boolean;
  loading: boolean;
  completed: number;
  total: number;
  pct: number;
};

const NOT_SET: ProfileCompletion = { applicable: false, loading: false, completed: 0, total: 0, pct: 0 };

function totalFor(role: "practitioner" | "assistant" | "patient"): number {
  if (role === "practitioner") return 8;
  if (role === "assistant") return 3;
  return 5;
}

/**
 * Tracks how much of the role-specific profile record (patients/practitioners/
 * assistants) is filled in, using the same field set the doctor-verification
 * queue treats as required (see OnboardingService.getMissingRequiredProfileFields)
 * so the header indicator and admin approval gate never disagree.
 */
export function useProfileCompletion(): ProfileCompletion {
  const { user } = useAuth();
  const pathname = usePathname();
  const isPatient = user?.role === "patient";
  const isPractitioner = user?.role === "practitioner";
  const isAssistant = user?.role === "assistant";
  const role = isPractitioner ? "practitioner" : isAssistant ? "assistant" : "patient";

  const [state, setState] = useState<ProfileCompletion>(NOT_SET);

  useEffect(() => {
    if (!user?.id || (!isPatient && !isPractitioner && !isAssistant)) {
      setState(NOT_SET);
      return;
    }

    let active = true;
    setState((prev) => ({ ...prev, applicable: true, loading: true }));

    const endpoint = isAssistant
      ? "/api/profile"
      : isPractitioner
      ? "/api/auth/onboard-doctor"
      : "/api/auth/onboard-patient";

    fetch(endpoint, { cache: "no-store" })
      .then((res) => res.json())
      .then((json) => {
        if (!active) return;
        const data = json?.data;
        if (!data) {
          setState({ applicable: true, loading: false, completed: 0, total: totalFor(role), pct: 0 });
          return;
        }

        let checks: boolean[];
        if (isPractitioner) {
          checks = [
            !!data.full_name,
            !!user?.phone,
            (data.qualifications?.length ?? 0) > 0,
            (data.specializations?.length ?? 0) > 0,
            (data.languages?.length ?? 0) > 0,
            (data.consultation_fee ?? 0) > 0,
            !!data.degree_url && !!data.registration_cert_url,
            !!data.signature_url,
          ];
        } else if (isAssistant) {
          checks = [!!data.dob, !!data.gender, !!data.bloodGroup];
        } else {
          const hasEmergencyContact =
            (Array.isArray(data.emergency_contacts) &&
              data.emergency_contacts.some((c: any) => c?.name && c?.phone)) ||
            (!!data.emergency_contact_name && !!data.emergency_contact_phone);

          checks = [
            !!data.date_of_birth && data.date_of_birth !== "1970-01-01",
            !!data.gender && data.gender !== "prefer_not_to_say",
            !!data.blood_group,
            !!data.address,
            hasEmergencyContact,
          ];
        }

        const completed = checks.filter(Boolean).length;
        const total = checks.length;
        setState({
          applicable: true,
          loading: false,
          completed,
          total,
          pct: total > 0 ? Math.round((completed / total) * 100) : 0,
        });
      })
      .catch(() => {
        if (active) setState({ applicable: true, loading: false, completed: 0, total: totalFor(role), pct: 0 });
      });

    return () => {
      active = false;
    };
    // Re-checks on every route change too, so saving from Create Profile
    // (a client-side navigation back to /profile) refreshes the indicator
    // without requiring a full page reload.
  }, [user?.id, user?.phone, isPatient, isPractitioner, isAssistant, role, pathname]);

  return state;
}