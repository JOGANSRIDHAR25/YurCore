import { createClient } from "@/shared/db/supabase.server";
import { didPatientLeave, isMissedBy } from "@/shared/appointments/attendance";

export class RegistryRepository {
  static async getPractitionerIdFromUserId(userId: string): Promise<string> {
    const supabase = await createClient();
    const { data } = await supabase
      .from("practitioners")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    return data?.id ?? userId;
  }

  static async getPatientsForPractitioner(practitionerUserId: string): Promise<any[]> {
    const supabase = await createClient();
    const resolvedPractitionerId = await this.getPractitionerIdFromUserId(practitionerUserId);
    const today = new Date().toLocaleDateString("en-CA");
    const appointmentsByPatient: Record<string, any[]> = {};
    const patientsWithAppointmentToday = new Set<string>();

    const { data: appointments } = await supabase
      .from("appointments")
      .select("patient_id, scheduled_date, scheduled_time, status, missed_by, patient_joined_at")
      .eq("practitioner_id", resolvedPractitionerId)
      .neq("status", "cancelled");

    const ids = (appointments ?? [])
      .map((a: any) => {
        if (a.patient_id) {
          if (!appointmentsByPatient[a.patient_id]) {
            appointmentsByPatient[a.patient_id] = [];
          }
          appointmentsByPatient[a.patient_id].push(a);
          if (a.scheduled_date === today) {
            patientsWithAppointmentToday.add(a.patient_id);
          }
        }
        return a.patient_id;
      })
      .filter(Boolean) as string[];



    const patientIdsFilter = Array.from(new Set(ids));
    if (patientIdsFilter.length === 0) {
      return [];
    }

    const [{ data: legacyPatients, error: patError }, { data: newProfiles, error: profError }] = await Promise.all([
      supabase
        .from("patients")
        .select(`
          id,
          full_name,
          date_of_birth,
          gender,
          prakriti,
          blood_group,
          user:users (
            mobile,
            abha_links ( abha_id )
          )
        `)
        .in("id", patientIdsFilter),
      supabase
        .from("patient_profiles")
        .select(`
          id,
          user_id,
          full_name,
          date_of_birth,
          gender,
          phone,
          abha_number,
          blood_group
        `)
        .in("user_id", patientIdsFilter),
    ]);

    if (patError || profError) {
      console.error("[RegistryRepository] Error fetching registry patients:", patError || profError);
      throw new Error("Failed to fetch patients from database");
    }

    // Merge the two sources. Prefer legacy if both exist (unlikely), or just use whatever is available.
    const mergedPatientsMap = new Map<string, any>();

    for (const p of legacyPatients || []) {
      mergedPatientsMap.set(p.id, p);
    }

    for (const p of newProfiles || []) {
      if (!mergedPatientsMap.has(p.user_id)) {
        mergedPatientsMap.set(p.user_id, {
          id: p.user_id, // We use user_id here because appointments stores it as patient_id
          full_name: p.full_name,
          date_of_birth: p.date_of_birth,
          gender: p.gender,
          prakriti: "Vata-Pitta", // default for new profiles
          blood_group: p.blood_group,
          user: { mobile: p.phone, abha_links: p.abha_number ? [{ abha_id: p.abha_number }] : [] },
        });
      }
    }

    // Family members have no `users` row (no login), so their phone number
    // lives on family_members instead — look it up by patient_id so the
    // directory shows it the same way it does for self-registered patients.
    // This also identifies which patient rows are dependents (booked under
    // an account owner) rather than account owners themselves — the caller
    // uses this flag to show only account owners in the top-level list,
    // while dependents' full computed data (visits, appointments, etc.)
    // stays available for lookup when viewed through their owner.
    const { data: familyMembers } = await supabase
      .from("family_members")
      .select("patient_id, phone")
      .in("patient_id", patientIdsFilter);

    const phoneByPatientId: Record<string, string> = {};
    const dependentPatientIds = new Set<string>();
    for (const fm of familyMembers ?? []) {
      if (fm.patient_id && fm.phone) phoneByPatientId[fm.patient_id] = fm.phone;
      if (fm.patient_id) dependentPatientIds.add(fm.patient_id);
    }

    const patients = Array.from(mergedPatientsMap.values());

    const { data: fuData } = await supabase
      .from("follow_ups")
      .select("patient_id, recommended_date, booked_appointment_id")
      .eq("practitioner_id", resolvedPractitionerId);
    const followUps = fuData ?? [];

    const followUpsByPatient: Record<string, any[]> = {};
    for (const f of followUps) {
      if (!followUpsByPatient[f.patient_id]) {
        followUpsByPatient[f.patient_id] = [];
      }
      followUpsByPatient[f.patient_id].push(f);
    }

    // Fetch all health records to find vitals, problems, and notes
    const { data: records, error: recError } = await supabase
      .from("health_records")
      .select("*")
      .order("record_date", { ascending: false });

    if (recError) {
      console.error("[RegistryRepository] Error fetching health records:", recError.message);
    }

    const recordsByPatient: Record<string, any[]> = {};
    for (const r of records ?? []) {
      if (!recordsByPatient[r.patient_id]) {
        recordsByPatient[r.patient_id] = [];
      }
      recordsByPatient[r.patient_id].push(r);
    }

    // Fetch active prescriptions (with item counts) to compute medicine counts per patient
    const { data: prescriptions, error: presError } = await supabase
      .from("prescriptions")
      .select("patient_id, status, prescription_items ( id )")
      .eq("practitioner_id", resolvedPractitionerId)
      .in("patient_id", patientIdsFilter);

    if (presError) {
      console.error("[RegistryRepository] Error fetching prescriptions:", presError.message);
    }

    const activeMedsByPatient: Record<string, number> = {};
    for (const rx of prescriptions ?? []) {
      if (rx.status === "cancelled") continue;
      const itemCount = Array.isArray(rx.prescription_items) ? rx.prescription_items.length : 0;
      activeMedsByPatient[rx.patient_id] = (activeMedsByPatient[rx.patient_id] ?? 0) + itemCount;
    }

    // "Last 30 Days" is driven by the appointment's own scheduled date/time
    // (not whether a consultation record was separately saved for it) —
    // any non-cancelled appointment already in the past, within 30 days.
    const thirtyDaysAgoStr = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toLocaleDateString("en-CA");

    return patients.map((p: any) => {
      let age = 0;
      if (p.date_of_birth) {
        const birthDate = new Date(p.date_of_birth);
        age = new Date().getFullYear() - birthDate.getFullYear();
      }

      const patientRecords = recordsByPatient[p.id] ?? [];

      // Latest vitals
      const vitalsRecord = patientRecords.find((r) => r.title === "Vitals" && r.record_type === "tracker");
      let vitals = null;
      if (vitalsRecord && vitalsRecord.summary) {
        try {
          vitals = JSON.parse(vitalsRecord.summary);
        } catch {
          // Malformed vitals JSON - leave as null
        }
      }

      // Problems
      const problemsRecord = patientRecords.find((r) => r.title === "Problems" && r.record_type === "tracker");
      let problems: any[] = [];
      if (problemsRecord && problemsRecord.summary) {
        try {
          problems = JSON.parse(problemsRecord.summary);
        } catch {
          // Malformed problems JSON - leave as empty
        }
      }

      const userObj = Array.isArray(p.user) ? p.user[0] : p.user;
      const abhaList = userObj?.abha_links || [];
      const abha = abhaList.length > 0 ? abhaList[0].abha_id : null;

      const patientAppts = appointmentsByPatient[p.id] ?? [];
      const isToday = patientAppts.some((a) => a.scheduled_date === today);

      // Any non-cancelled appointment already in the past (before today),
      // scheduled within the last 30 days, counts as an ended/finished visit.
      const pastAppts = patientAppts
        .filter((a) => a.scheduled_date < today)
        .sort((a, b) => new Date(`${b.scheduled_date}T${b.scheduled_time || "00:00:00"}`).getTime() - new Date(`${a.scheduled_date}T${a.scheduled_time || "00:00:00"}`).getTime());
      const completedVisitLast30Days = pastAppts.some((a) => a.scheduled_date >= thirtyDaysAgoStr);

      // Latest visit date & count — prefer the most recent past appointment
      // (the same data driving the "Last 30 Days" bucket above) so the card's
      // displayed "Last Visit" always explains why a patient lands in that tab.
      // Fall back to filed health-record consultation entries if no appointment exists.
      const visits = patientRecords.filter((r) => r.record_type === "consultation");
      // "Update Record" consultations are saved as appointments with status
      // "completed" (see consultation.repo.ts) rather than as health_records
      // rows, so prefer that count — falls back to health_records for older data.
      const completedVisitsCount = patientAppts.filter((a) => a.status === "completed").length;
      const totalVisits = completedVisitsCount > 0 ? completedVisitsCount : visits.length;
      const lastVisit = pastAppts[0]?.scheduled_date ?? visits[0]?.record_date ?? "No visits";
      let lastVisitDaysAgo = 99;
      if (lastVisit !== "No visits") {
        const diffTime = Math.abs(new Date().getTime() - new Date(lastVisit).getTime());
        lastVisitDaysAgo = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      }

      // Calculate next appointment or follow-up recommendation.
      // Strictly after today — today's own appointment belongs only in
      // "Today's Queue", not also duplicated into "Follow-up Due".
      const futureAppts = patientAppts.filter((a) => a.scheduled_date > today);
      futureAppts.sort((a, b) => {
        const dA = new Date(`${a.scheduled_date}T${a.scheduled_time || "00:00:00"}`).getTime();
        const dB = new Date(`${b.scheduled_date}T${b.scheduled_time || "00:00:00"}`).getTime();
        return dA - dB;
      });

      let nextFollowUp = null;
      if (futureAppts.length > 0) {
        const d = new Date(futureAppts[0].scheduled_date).toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        });
        
        let t = futureAppts[0].scheduled_time;
        if (t) {
           // convert "14:00:00" to "2:00 PM"
           const [hr, min] = t.split(":");
           let h = parseInt(hr, 10);
           const ampm = h >= 12 ? "PM" : "AM";
           h = h % 12;
           if (h === 0) h = 12;
           t = `${h}:${min} ${ampm}`;
        }
        nextFollowUp = t ? `${d} at ${t}` : d;
      }

      const patientFollowUps = (followUpsByPatient[p.id] ?? []).filter((f) => !f.booked_appointment_id);
      let followUpDue = false;
      
      // If they have an upcoming appointment, they should appear in the Follow-up tab for visibility of upcoming sessions
      if (futureAppts.length > 0) {
         followUpDue = true;
      } else if (patientFollowUps.length > 0) {
        patientFollowUps.sort((a, b) => new Date(a.recommended_date).getTime() - new Date(b.recommended_date).getTime());
        const earliestDue = patientFollowUps[0].recommended_date;
        if (earliestDue) {
          followUpDue = new Date(earliestDue).getTime() <= new Date().getTime();
          if (!nextFollowUp) {
            nextFollowUp = new Date(earliestDue).toLocaleDateString("en-IN", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            });
          }
        }
      }

      // Non-completed appointments (today, future, or an unattended past slot),
      // shown in the Patient Search queue. Once a consultation is completed for
      // one, it drops out of this list and shows up in Prescriptions instead.
      const upcomingAppointments = patientAppts
        .filter((a) => a.status !== "completed")
        .sort((a, b) => new Date(`${a.scheduled_date}T${a.scheduled_time || "00:00:00"}`).getTime() - new Date(`${b.scheduled_date}T${b.scheduled_time || "00:00:00"}`).getTime())
        .map((a) => {
          const dateObj = new Date(`${a.scheduled_date}T00:00:00`);
          let displayTime = a.scheduled_time || "";
          if (displayTime) {
            const [hr, min] = displayTime.split(":");
            let h = parseInt(hr, 10);
            const ampm = h >= 12 ? "PM" : "AM";
            h = h % 12 || 12;
            displayTime = `${h}:${min} ${ampm}`;
          }
          return {
            dateRaw: a.scheduled_date,
            date: dateObj.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
            day: dateObj.toLocaleDateString("en-IN", { weekday: "long" }),
            time: displayTime,
            // Which tab (Today/Upcoming/Past) this appointment sits in — purely
            // date-based, so a same-day appointment stays under "Today" even
            // after it's been auto-marked missed.
            status: a.scheduled_date === today ? "today" : a.scheduled_date > today ? "upcoming" : "missed",
            // Whether the doctor actually missed it (DB enum value is
            // "no_show") — checked separately so today's missed slots still
            // show a "Missed" badge instead of just "Today".
            isMissed: a.status === "no_show" || a.status === "missed",
            missedBy: a.status === "no_show" && isMissedBy(a.missed_by) ? a.missed_by : null,
            patientLeft: a.status === "no_show" && didPatientLeave(a.missed_by, a.patient_joined_at),
          };
        });

      return {
        id: p.id,
        isFamilyMember: dependentPatientIds.has(p.id),
        name: p.full_name || "Unknown",
        age,
        gender: p.gender || "Unknown",
        phone: phoneByPatientId[p.id] || userObj?.mobile || "",
        abha,
        bloodGroup: p.blood_group || "Not Recorded",
        prakriti: p.prakriti || "Unknown",
        lastVisit: lastVisit !== "No visits" ? new Date(lastVisit).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "No visits",
        lastVisitDaysAgo,
        completedVisitLast30Days,
        nextFollowUp,
        followUpDue,
        isToday,
        conditions: problems.map((pr: any) => pr.name).join(" · ") || "No recorded conditions",
        systems: ["Ayurveda"],
        totalVisits,
        problems,
        allergySummary: "No known allergies",
        activeMeds: activeMedsByPatient[p.id] ?? 0,
        vitals,
        upcomingAppointments,
      };
    });
  }
}