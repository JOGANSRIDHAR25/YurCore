import "server-only";

import {
  AdminRepository,
  type AdminDashboardStats,
  type CreatePractitionerInput,
  type CreatePatientInput,
  type CreateClinicInput,
} from "../repo/admin.repo";
import { AuthUser } from "@/shared/auth/auth.types";
import { ForbiddenError } from "@/shared/api/api-error";

function assertAdmin(authUser: AuthUser): void {
  if (authUser.role !== "admin" && authUser.role !== "super_admin") {
    throw new ForbiddenError("Admin access required");
  }
}

export class AdminService {
  static async getDashboardStats(authUser: AuthUser): Promise<AdminDashboardStats> {
    assertAdmin(authUser);
    return AdminRepository.getDashboardStats();
  }

  static async getPractitioners(authUser: AuthUser) {
    assertAdmin(authUser);
    return AdminRepository.getPractitioners();
  }

  static async verifyPractitioner(authUser: AuthUser, id: string, status: "verified" | "rejected", reason?: string) {
    assertAdmin(authUser);
    if (!id) throw new Error("Practitioner ID is required");
    await AdminRepository.verifyPractitioner(id, status, reason);
  }

  static async createPractitioner(authUser: AuthUser, input: CreatePractitionerInput) {
    assertAdmin(authUser);
    if (!input.name?.trim()) throw new Error("Practitioner name is required");
    if (!input.phone?.trim()) throw new Error("Phone number is required");
    await AdminRepository.createPractitioner(input);
  }

  static async getPatients(authUser: AuthUser) {
    assertAdmin(authUser);
    return AdminRepository.getPatients();
  }

  static async togglePatientStatus(authUser: AuthUser, patientId: string, isActive: boolean) {
    assertAdmin(authUser);
    if (!patientId) throw new Error("Patient ID is required");
    await AdminRepository.togglePatientStatus(patientId, isActive);
  }

  static async createPatient(authUser: AuthUser, input: CreatePatientInput) {
    assertAdmin(authUser);
    if (!input.name?.trim()) throw new Error("Patient name is required");
    if (!input.phone?.trim()) throw new Error("Phone number is required");
    await AdminRepository.createPatient(input);
  }

  static async getOrders(authUser: AuthUser) {
    assertAdmin(authUser);
    return AdminRepository.getOrders();
  }

  static async updateOrderStatus(authUser: AuthUser, orderId: string, status: string, trackingNumber?: string, logisticsPartner?: string) {
    assertAdmin(authUser);
    if (!orderId) throw new Error("Order ID is required");
    if (!status) throw new Error("Status is required");
    await AdminRepository.updateOrderStatus(orderId, status, trackingNumber, logisticsPartner);
  }

  static async getAuditLogs(
    authUser: AuthUser,
    filters: { module?: string; actorUserId?: string; search?: string; limit?: number },
  ) {
    assertAdmin(authUser);
    return AdminRepository.getAuditLogs(filters);
  }

  static async getClinics(authUser: AuthUser) {
    assertAdmin(authUser);
    return AdminRepository.getClinics();
  }

  static async createClinic(authUser: AuthUser, input: CreateClinicInput) {
    assertAdmin(authUser);
    if (!input.name?.trim()) throw new Error("Clinic name is required");
    await AdminRepository.createClinic(input);
  }

  static async toggleClinicActive(authUser: AuthUser, id: string, isActive: boolean) {
    assertAdmin(authUser);
    if (!id) throw new Error("Clinic ID is required");
    await AdminRepository.toggleClinicActive(id, isActive);
  }
}
