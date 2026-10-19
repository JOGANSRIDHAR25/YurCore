"use client";

import { useQuery } from "./useQuery";
import { apiClient } from "@/shared/api/api-client";

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

export function useAdminDashboard() {
  return useQuery<AdminDashboardStats>(async () => {
    const response = await apiClient<{ data: AdminDashboardStats }>("/api/admin/dashboard");
    return response.data;
  }, []);
}

export function useAdminPractitioners() {
  return useQuery<any[]>(async () => {
    const response = await apiClient<{ data: any[] }>("/api/admin/practitioners");
    return response.data;
  }, []);
}

export async function createPractitionerApi(p: {
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
}) {
  return await apiClient("/api/admin/practitioners", {
    method: "POST",
    body: JSON.stringify(p),
  });
}

export async function verifyPractitionerApi(id: string, status: "verified" | "rejected", reason?: string) {
  return await apiClient(`/api/admin/practitioners/${id}/verify`, {
    method: "POST",
    body: JSON.stringify({ status, reason }),
  });
}

export function useAdminPatients() {
  return useQuery<any[]>(async () => {
    const response = await apiClient<{ data: any[] }>("/api/admin/patients");
    return response.data;
  }, []);
}

export async function createPatientApi(p: {
  name: string;
  phone: string;
  email: string;
  dob: string;
  gender: string;
  city: string;
  abha: boolean;
  abhaId?: string;
}) {
  return await apiClient("/api/admin/patients", {
    method: "POST",
    body: JSON.stringify(p),
  });
}

export async function togglePatientStatusApi(patientId: string, isActive: boolean) {
  return await apiClient(`/api/admin/patients/${patientId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ isActive }),
  });
}

export function useAdminOrders() {
  return useQuery<any[]>(async () => {
    const response = await apiClient<{ data: any[] }>("/api/admin/orders");
    return response.data;
  }, []);
}

export async function updateOrderStatusApi(orderId: string, status: string, trackingNumber?: string, logisticsPartner?: string) {
  return await apiClient(`/api/admin/orders/${orderId}`, {
    method: "PATCH",
    body: JSON.stringify({ status, trackingNumber, logisticsPartner }),
  });
}

export function useAdminClinics() {
  return useQuery<any[]>(async () => {
    const response = await apiClient<{ data: any[] }>("/api/admin/clinics");
    return response.data;
  }, []);
}

export async function createClinicApi(c: {
  name: string;
  address: string;
  city: string;
  state: string;
  pin: string;
  hfrId: string;
  phone: string;
}) {
  return await apiClient("/api/admin/clinics", {
    method: "POST",
    body: JSON.stringify(c),
  });
}

export async function toggleClinicActiveApi(id: string, isActive: boolean) {
  return await apiClient(`/api/admin/clinics/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ isActive }),
  });
}

export function useAdminMedicines() {
  return useQuery<any[]>(async () => {
    const response = await apiClient<{ data: any[] }>("/api/medicines/admin");
    return response.data;
  }, []);
}

export type AuditLogEntry = {
  id: string;
  actor_user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  patient_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  metadata: Record<string, any> | null;
  created_at: string;
  actor: { id: string; email: string | null; mobile: string | null; role: string } | null;
};

export function useAdminAuditLogs(filters: { module?: string; search?: string } = {}) {
  return useQuery<AuditLogEntry[]>(async () => {
    const params = new URLSearchParams();
    if (filters.module) params.set("module", filters.module);
    if (filters.search) params.set("search", filters.search);
    const qs = params.toString();
    const response = await apiClient<{ data: AuditLogEntry[] }>(`/api/admin/audit-logs${qs ? `?${qs}` : ""}`);
    return response.data;
  }, [filters.module, filters.search]);
}
