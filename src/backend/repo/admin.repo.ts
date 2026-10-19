import { createClient } from "@/shared/db/supabase.server";

export type AdminDashboardStats = {
  totalPatients: number;
  totalPractitioners: number;
  totalAppointments: number;
  totalOrders: number;
  revenue: number;
  pendingVerifications: number;
  totalClinics: number;
  totalMedicines: number;
};

export type CreatePractitionerInput = {
  name: string;
  specialty: string;
  qualification: string;
  hprId: string;
  email: string;
  phone: string;
  practiceType: "independent" | "hospital" | "both";
  clinicName: string;
  hospitalIds: string[];
  city: string;
};

export type CreatePatientInput = {
  name: string;
  phone: string;
  email: string;
  dob: string;
  gender: string;
  city: string;
  abha: boolean;
  abhaId?: string;
};

export type CreateClinicInput = {
  name: string;
  address: string;
  city: string;
  state: string;
  pin: string;
  hfrId: string;
  phone: string;
};

export class AdminRepository {
  static async getDashboardStats(): Promise<AdminDashboardStats> {
    const supabase = await createClient();
    const [pats, pracs, appts, ords, pendingV, clinics, meds] = await Promise.all([
      supabase.from("patients").select("id", { count: "exact", head: true }),
      supabase.from("practitioners").select("id", { count: "exact", head: true }),
      supabase.from("appointments").select("id", { count: "exact", head: true }),
      supabase.from("orders").select("id", { count: "exact", head: true }),
      supabase.from("practitioners").select("id", { count: "exact", head: true }).eq("verification_status", "pending"),
      supabase.from("clinics").select("id", { count: "exact", head: true }),
      supabase.from("medicines").select("id", { count: "exact", head: true }),
    ]);

    return {
      totalPatients: pats.count ?? 0,
      totalPractitioners: pracs.count ?? 0,
      totalAppointments: appts.count ?? 0,
      totalOrders: ords.count ?? 0,
      revenue: 0,
      pendingVerifications: pendingV.count ?? 0,
      totalClinics: clinics.count ?? 0,
      totalMedicines: meds.count ?? 0,
    };
  }

  static async getPractitioners(): Promise<any[]> {
    const supabase = await createClient();

    // Auto-sync any user with role 'practitioner' or 'doctor' missing from 'practitioners' table
    try {
      const { data: docUsers } = await supabase
        .from("users")
        .select("id, email, mobile, role")
        .in("role", ["practitioner", "doctor"]);

      if (docUsers && docUsers.length > 0) {
        const { data: existingPracs } = await supabase
          .from("practitioners")
          .select("user_id");

        const existingUserIds = new Set((existingPracs || []).map((p) => p.user_id));

        for (const u of docUsers) {
          if (u.id && !existingUserIds.has(u.id)) {
            const nameFromEmail = u.email ? u.email.split("@")[0] : "Practitioner";
            const formattedName = nameFromEmail.charAt(0).toUpperCase() + nameFromEmail.slice(1);

            await supabase.from("practitioners").insert({
              user_id: u.id,
              full_name: `Dr. ${formattedName}`,
              disciplines: ["Ayurveda"],
              specializations: ["Ayurveda"],
              qualifications: ["BAMS"],
              verification_status: "pending",
            });
          }
        }
      }
    } catch (syncErr: any) {
      console.error("[AdminRepository] Practitioner auto-sync warning:", syncErr.message);
    }

    const { data, error } = await supabase
      .from("practitioners")
      .select("id, user_id, full_name, disciplines, specializations, qualifications, experience_years, verification_status, rating_avg, rating_count, consultation_count, created_at, hpr_id, user:users ( mobile, email ), clinic_practitioners ( clinic:clinics ( id, name, city ) )")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[AdminRepository] Error fetching practitioners:", error.message);
      throw new Error("Failed to fetch practitioners from database");
    }
    return data ?? [];
  }

  static async verifyPractitioner(id: string, status: "verified" | "rejected", reason?: string): Promise<void> {
    const supabase = await createClient();
    const updates: Record<string, unknown> = { verification_status: status };
    if (reason) updates.rejection_reason = reason;

    const { data: prac, error } = await supabase
      .from("practitioners")
      .update(updates)
      .eq("id", id)
      .select("user_id")
      .single();

    if (error) {
      console.error("[AdminRepository] Error verifying practitioner:", error.message);
      throw new Error(error.message);
    }

    if (prac?.user_id) {
      await supabase
        .from("users")
        .update({ role: "practitioner" })
        .eq("id", prac.user_id);
    }
  }

  static async createPractitioner(p: CreatePractitionerInput): Promise<void> {
    const supabase = await createClient();

    // 1. Resolve existing user or insert new user
    let userId: string;
    const { data: existingUser } = await supabase
      .from("users")
      .select("id")
      .eq("email", p.email)
      .maybeSingle();

    if (existingUser) {
      userId = existingUser.id;
      await supabase.from("users").update({ role: "practitioner", mobile: p.phone || undefined }).eq("id", userId);
    } else {
      const { data: user, error: userErr } = await supabase
        .from("users")
        .insert({
          mobile: p.phone,
          email: p.email,
          role: "practitioner",
        })
        .select("id")
        .single();

      if (userErr || !user) {
        console.error("[AdminRepository] Error creating practitioner user:", userErr);
        throw new Error(userErr?.message ?? "Failed to create practitioner user");
      }
      userId = user.id;
    }

    // 2. Upsert into practitioners table
    const { data: prac, error: pracErr } = await supabase
      .from("practitioners")
      .upsert({
        user_id: userId,
        full_name: p.name,
        disciplines: [p.specialty],
        specializations: [p.specialty],
        qualifications: [p.qualification],
        hpr_id: p.hprId,
        verification_status: "pending",
      }, { onConflict: "user_id" })
      .select("id")
      .single();

    if (pracErr || !prac) {
      console.error("[AdminRepository] Error creating practitioner profile:", pracErr);
      throw new Error(pracErr?.message ?? "Failed to create practitioner profile");
    }

    if (p.hospitalIds && p.hospitalIds.length > 0) {
      const associations = p.hospitalIds.map((hid) => ({
        clinic_id: hid,
        practitioner_id: prac.id,
      }));
      const { error: assocErr } = await supabase.from("clinic_practitioners").insert(associations);
      if (assocErr) {
        console.error("[AdminRepository] Error creating clinic affiliations:", assocErr.message);
      }
    }
  }

  /**
   * Account owners, each with their family members nested under them.
   * Family members have their own `patients` row (no login, user_id null) —
   * they are returned inside `familyMembers` of their owner rather than as
   * top-level patients, with their phone/relationship from `family_members`.
   * `lastVisit` is the latest consultation's date (consultations are created
   * when the doctor completes the visit; `session_start` is never set).
   */
  static async getPatients(): Promise<any[]> {
    const supabase = await createClient();
    const [{ data, error }, { data: familyRows, error: familyError }] = await Promise.all([
      supabase
        .from("patients")
        .select("id, user_id, full_name, date_of_birth, gender, prakriti, city, created_at, user:users ( mobile, email, is_active, abha:abha_links ( abha_id ) ), consultations ( id, created_at, session_start, is_complete, practitioner:practitioners ( id, full_name, disciplines ) )")
        .order("created_at", { ascending: false }),
      supabase
        .from("family_members")
        .select("id, owner_patient_id, patient_id, full_name, relationship, date_of_birth, gender, phone, blood_group, is_active, created_at"),
    ]);

    if (error) {
      console.error("[AdminRepository] Error fetching patients:", error.message);
      throw new Error("Failed to fetch patients from database");
    }
    if (familyError) {
      console.error("[AdminRepository] Error fetching family members:", familyError.message);
    }

    const withVisitStats = (pat: any) => {
      const consultations = (pat?.consultations ?? []) as any[];
      const latest = consultations.reduce<string | null>((acc, c) => {
        const at = c.session_start || c.created_at;
        return at && (!acc || new Date(at).getTime() > new Date(acc).getTime()) ? at : acc;
      }, null);
      return { consultations, lastVisitAt: latest };
    };

    const patientById = new Map<string, any>((data ?? []).map((p: any) => [p.id, p]));
    const familyPatientIds = new Set<string>();
    const familyByOwner = new Map<string, any[]>();

    for (const fm of familyRows ?? []) {
      if (fm.patient_id) familyPatientIds.add(fm.patient_id);
      if (!fm.owner_patient_id) continue;
      const memberPatient = fm.patient_id ? patientById.get(fm.patient_id) : null;
      const stats = withVisitStats(memberPatient);
      const list = familyByOwner.get(fm.owner_patient_id) ?? [];
      list.push({
        id: fm.id,
        patientId: fm.patient_id,
        full_name: fm.full_name || memberPatient?.full_name || "Family member",
        relationship: fm.relationship,
        date_of_birth: fm.date_of_birth || memberPatient?.date_of_birth,
        gender: fm.gender || memberPatient?.gender,
        phone: fm.phone,
        blood_group: fm.blood_group,
        is_active: fm.is_active !== false,
        created_at: fm.created_at,
        consultations: stats.consultations,
        lastVisitAt: stats.lastVisitAt,
      });
      familyByOwner.set(fm.owner_patient_id, list);
    }

    return (data ?? [])
      // Family members are listed under their owner, not on their own.
      .filter((pat: any) => !familyPatientIds.has(pat.id))
      .map((pat: any) => {
        const user = Array.isArray(pat.user) ? pat.user[0] : pat.user;
        const abha = Array.isArray(user?.abha) ? user.abha : user?.abha ? [user.abha] : [];
        const stats = withVisitStats(pat);
        return {
          ...pat,
          abha,
          lastVisitAt: stats.lastVisitAt,
          familyMembers: familyByOwner.get(pat.id) ?? [],
        };
      });
  }

  static async togglePatientStatus(patientId: string, isActive: boolean): Promise<void> {
    const supabase = await createClient();
    const { data: pat, error: getErr } = await supabase
      .from("patients")
      .select("user_id")
      .eq("id", patientId)
      .single();

    if (getErr || !pat) {
      console.error("[AdminRepository] Error getting patient:", getErr);
      throw new Error(getErr?.message ?? "Patient not found");
    }

    const { error } = await supabase
      .from("users")
      .update({ is_active: isActive })
      .eq("id", pat.user_id);

    if (error) {
      console.error("[AdminRepository] Error updating patient status:", error.message);
      throw new Error(error.message);
    }
  }

  static async createPatient(p: CreatePatientInput): Promise<void> {
    const supabase = await createClient();

    const { data: user, error: userErr } = await supabase
      .from("users")
      .insert({
        mobile: p.phone,
        email: p.email,
        role: "patient",
      })
      .select("id")
      .single();

    if (userErr || !user) {
      console.error("[AdminRepository] Error creating patient user:", userErr);
      throw new Error(userErr?.message ?? "Failed to create user");
    }

    const { data: pat, error: patErr } = await supabase
      .from("patients")
      .insert({
        user_id: user.id,
        full_name: p.name,
        date_of_birth: p.dob,
        gender: p.gender.toLowerCase() === "male" ? "M" : p.gender.toLowerCase() === "female" ? "F" : "O",
        city: p.city,
      })
      .select("id")
      .single();

    if (patErr || !pat) {
      console.error("[AdminRepository] Error creating patient profile:", patErr);
      throw new Error(patErr?.message ?? "Failed to create patient profile");
    }

    if (p.abha && p.abhaId) {
      const { error: abhaErr } = await supabase.from("abha_links").insert({
        user_id: user.id,
        abha_id: p.abhaId,
        abha_address: `${p.name.toLowerCase().replace(/\s+/g, "")}@abha`,
        full_name: p.name,
        date_of_birth: p.dob,
        gender: p.gender.toLowerCase() === "male" ? "M" : p.gender.toLowerCase() === "female" ? "F" : "O",
        is_verified: true,
      });
      if (abhaErr) {
        console.error("[AdminRepository] Error linking ABHA:", abhaErr.message);
      }
    }
  }

  static async getOrders(): Promise<any[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("orders")
      .select("id, status, total_paise, created_at, tracking_number, logistics_partner, patient:patients ( full_name, city, user:users ( mobile ) ), order_items ( id, medicine_name, quantity, unit_price_paise, total_price_paise )")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error("[AdminRepository] Error fetching orders:", error.message);
      throw new Error("Failed to fetch orders from database");
    }
    return data ?? [];
  }

  static async updateOrderStatus(
    orderId: string,
    status: string,
    trackingNumber?: string,
    logisticsPartner?: string
  ): Promise<void> {
    const supabase = await createClient();
    const updates: Record<string, any> = { status };
    if (trackingNumber !== undefined) updates.tracking_number = trackingNumber;
    if (logisticsPartner !== undefined) updates.logistics_partner = logisticsPartner;

    const { error } = await supabase.from("orders").update(updates).eq("id", orderId);
    if (error) {
      console.error("[AdminRepository] Error updating order status:", error.message);
      throw new Error(error.message);
    }
  }

  static async getAuditLogs(filters: {
    module?: string;
    actorUserId?: string;
    search?: string;
    limit?: number;
  }): Promise<any[]> {
    const supabase = await createClient();
    let query = supabase
      .from("audit_logs")
      .select("id, actor_user_id, action, entity_type, entity_id, patient_id, ip_address, user_agent, metadata, created_at, actor:users!audit_logs_actor_user_id_fkey ( id, email, mobile, role )")
      .order("created_at", { ascending: false })
      .limit(filters.limit ?? 200);

    if (filters.module) {
      query = query.eq("entity_type", filters.module);
    }
    if (filters.actorUserId) {
      query = query.eq("actor_user_id", filters.actorUserId);
    }
    if (filters.search) {
      query = query.ilike("action", `%${filters.search}%`);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[AdminRepository] Error fetching audit logs:", error.message);
      throw new Error("Failed to fetch audit logs from database");
    }
    return data ?? [];
  }

  static async getClinics(): Promise<any[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("clinics")
      .select("id, name, address_line1, city, state, pin_code, phone, is_active, hfr_id, hfr_verified, clinic_practitioners ( practitioner:practitioners ( full_name ) )")
      .order("name", { ascending: true });

    if (error) {
      console.error("[AdminRepository] Error fetching clinics:", error.message);
      throw new Error("Failed to fetch clinics from database");
    }
    return data ?? [];
  }

  static async createClinic(c: CreateClinicInput): Promise<void> {
    const supabase = await createClient();
    const { error } = await supabase.from("clinics").insert({
      name: c.name,
      address_line1: c.address,
      city: c.city,
      state: c.state,
      pin_code: c.pin,
      hfr_id: c.hfrId,
      phone: c.phone,
      is_active: true,
    });

    if (error) {
      console.error("[AdminRepository] Error creating clinic:", error.message);
      throw new Error(error.message);
    }
  }

  static async toggleClinicActive(id: string, isActive: boolean): Promise<void> {
    const supabase = await createClient();
    const { error } = await supabase.from("clinics").update({ is_active: isActive }).eq("id", id);
    if (error) {
      console.error("[AdminRepository] Error toggling clinic status:", error.message);
      throw new Error(error.message);
    }
  }
}
