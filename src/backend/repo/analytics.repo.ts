import { createClient } from "@/shared/db/supabase.server";

export type AnalyticsData = {
  totalConsultations: number;
  totalPatients: number;
  completedThisMonth: number;
  totalRevenue: number;
  revenueThisMonth: number;
  avgRating: number;
  totalRatings: number;
  avgDuration: number;
  monthlyConsults: { month: string; count: number }[];
};

export class AnalyticsRepository {
  static async getPractitionerIdFromUserId(userId: string): Promise<string | null> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("practitioners")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("[AnalyticsRepository] Error resolving practitioner_id:", error.message);
      return null;
    }
    return data?.id ?? null;
  }

  static async getAnalyticsForPractitioner(practitionerId: string): Promise<AnalyticsData> {
    const supabase = await createClient();
    const thisMonth = new Date();
    const monthStart = `${thisMonth.getFullYear()}-${String(thisMonth.getMonth() + 1).padStart(2, "0")}-01`;

    const [consultRes, ratingRes, paymentRes] = await Promise.all([
      supabase.from("consultations").select("id, patient_id, duration_min, created_at, is_complete").eq("practitioner_id", practitionerId),
      supabase.from("ratings").select("stars").eq("practitioner_id", practitionerId),
      supabase.from("payments").select("amount_paise, confirmed_at").eq("status", "success"),
    ]);

    const consults = consultRes.data ?? [];
    const ratings = ratingRes.data ?? [];
    const payments = paymentRes.data ?? [];

    const completedThisMonth = consults.filter((c: any) => c.created_at >= monthStart && c.is_complete).length;
    const avgDur = consults.filter((c: any) => c.duration_min).reduce((a: number, c: any) => a + (c.duration_min ?? 0), 0) / (consults.filter((c: any) => c.duration_min).length || 1);
    const avgRating = ratings.length > 0 ? ratings.reduce((a: number, r: any) => a + r.stars, 0) / ratings.length : 0;
    const totalRevenue = payments.reduce((a: number, p: any) => a + (p.amount_paise ?? 0), 0);
    const revenueThisMonth = payments.filter((p: any) => p.confirmed_at && p.confirmed_at >= monthStart).reduce((a: number, p: any) => a + (p.amount_paise ?? 0), 0);

    // `patient_id` already uniquely identifies the person, including family
    // members — each family member gets their own real `patients` row (see
    // FamilyRepository.addFamilyMember), so a distinct count here naturally
    // includes them without a separate join to family_members.
    const totalPatients = new Set(consults.map((c: any) => c.patient_id).filter(Boolean)).size;

    return {
      totalConsultations: consults.length,
      totalPatients,
      completedThisMonth,
      totalRevenue: Math.round(totalRevenue / 100),
      revenueThisMonth: Math.round(revenueThisMonth / 100),
      avgRating: Math.round(avgRating * 10) / 10,
      totalRatings: ratings.length,
      avgDuration: Math.round(avgDur),
      monthlyConsults: [],
    };
  }
}