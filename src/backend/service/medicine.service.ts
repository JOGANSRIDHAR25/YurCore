import "server-only";

import { MedicineRepository, type MedicineRow } from "../repo/medicine.repo";
import { AuthUser } from "@/shared/auth/auth.types";
import { ForbiddenError } from "@/shared/api/api-error";

export type CreateMedicineInput = {
  name: string;
  generic_name?: string;
  brand?: string;
  discipline: string;
  category: string;
  standard_dose?: string;
  price_paise?: number;
};

function assertAdmin(authUser: AuthUser): void {
  if (authUser.role !== "admin" && authUser.role !== "super_admin") {
    throw new ForbiddenError("Only admins can manage the medicine catalogue");
  }
}

export class MedicineService {
  static async search(search?: string): Promise<MedicineRow[]> {
    return MedicineRepository.search(search);
  }

  static async getAll(authUser: AuthUser): Promise<MedicineRow[]> {
    assertAdmin(authUser);
    return MedicineRepository.getAll();
  }

  static async create(authUser: AuthUser, input: CreateMedicineInput): Promise<void> {
    assertAdmin(authUser);
    if (!input.name?.trim()) {
      throw new Error("Medicine name is required");
    }
    if (!input.discipline?.trim()) {
      throw new Error("Discipline is required");
    }
    await MedicineRepository.create(input);
  }

  static async update(authUser: AuthUser, id: string, input: CreateMedicineInput): Promise<void> {
    assertAdmin(authUser);
    if (!input.name?.trim()) {
      throw new Error("Medicine name is required");
    }
    await MedicineRepository.update(id, input);
  }

  static async toggleActive(authUser: AuthUser, id: string, isActive: boolean): Promise<void> {
    assertAdmin(authUser);
    await MedicineRepository.toggleActive(id, isActive);
  }
}
