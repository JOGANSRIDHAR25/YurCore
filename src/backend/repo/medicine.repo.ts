import { createClient } from "@/shared/db/supabase.server";

export type MedicineRow = {
  id: string;
  name: string;
  generic_name?: string | null;
  brand?: string | null;
  discipline: string;
  category?: string | null;
  pharmacopoeia?: string | null;
  standard_dose?: string | null;
  standard_dose_min?: number | null;
  standard_dose_max?: number | null;
  dose_unit?: string | null;
  price_paise?: number | null;
  is_controlled: boolean;
  is_active: boolean;
  created_at?: string;
};

const MEDICINE_SELECT = "id, name, generic_name, brand, discipline, category, pharmacopoeia, standard_dose, standard_dose_min, standard_dose_max, dose_unit, is_controlled, is_active, price_paise, created_at";

export class MedicineRepository {
  static async search(search?: string): Promise<MedicineRow[]> {
    const supabase = await createClient();
    let q = supabase
      .from("medicines")
      .select(MEDICINE_SELECT)
      .eq("is_active", true)
      .order("name");

    if (search) {
      q = q.ilike("name", `%${search}%`);
    }

    const { data, error } = await q.limit(50);
    if (error) {
      console.error("[MedicineRepository] Error searching medicines:", error.message);
      throw new Error("Failed to fetch medicines from database");
    }
    return data as MedicineRow[];
  }

  /** Looks up price_paise for a set of medicine names (case-insensitive). Returns a name -> price_paise map. */
  static async getPricesByNames(names: string[]): Promise<Record<string, number>> {
    const uniqueNames = Array.from(new Set(names.filter(Boolean)));
    if (uniqueNames.length === 0) return {};

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("medicines")
      .select("name, price_paise")
      .or(uniqueNames.map((n) => `name.ilike.${n.replace(/[%,]/g, "")}`).join(","));

    if (error) {
      console.error("[MedicineRepository] Error fetching medicine prices:", error.message);
      return {};
    }

    const priceMap: Record<string, number> = {};
    for (const row of data || []) {
      priceMap[row.name.toLowerCase()] = row.price_paise ?? 0;
    }
    return priceMap;
  }

  static async getAll(): Promise<MedicineRow[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("medicines")
      .select(MEDICINE_SELECT)
      .order("name", { ascending: true });

    if (error) {
      console.error("[MedicineRepository] Error fetching all medicines:", error.message);
      throw new Error("Failed to fetch medicines from database");
    }
    return data as MedicineRow[];
  }

  static async create(m: {
    name: string;
    generic_name?: string;
    brand?: string;
    discipline: string;
    category: string;
    standard_dose?: string;
    price_paise?: number;
  }): Promise<void> {
    const supabase = await createClient();
    const { error } = await supabase.from("medicines").insert({
      name: m.name,
      generic_name: m.generic_name,
      brand: m.brand,
      discipline: m.discipline,
      category: m.category,
      standard_dose: m.standard_dose,
      price_paise: m.price_paise || 0,
      is_active: true,
    });

    if (error) {
      console.error("[MedicineRepository] Error creating medicine:", error.message);
      throw new Error(error.message);
    }
  }

  static async update(
    id: string,
    m: {
      name: string;
      generic_name?: string;
      brand?: string;
      discipline: string;
      category: string;
      standard_dose?: string;
      price_paise?: number;
    }
  ): Promise<void> {
    const supabase = await createClient();
    const { error } = await supabase
      .from("medicines")
      .update({
        name: m.name,
        generic_name: m.generic_name,
        brand: m.brand,
        discipline: m.discipline,
        category: m.category,
        standard_dose: m.standard_dose,
        price_paise: m.price_paise,
      })
      .eq("id", id);

    if (error) {
      console.error("[MedicineRepository] Error updating medicine:", error.message);
      throw new Error(error.message);
    }
  }

  static async toggleActive(id: string, isActive: boolean): Promise<void> {
    const supabase = await createClient();
    const { error } = await supabase
      .from("medicines")
      .update({ is_active: isActive })
      .eq("id", id);

    if (error) {
      console.error("[MedicineRepository] Error toggling medicine active state:", error.message);
      throw new Error(error.message);
    }
  }
}