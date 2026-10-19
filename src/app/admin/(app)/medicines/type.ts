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
