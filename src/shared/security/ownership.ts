import "server-only";

import { AuthUser } from "../auth/auth.types";
import { createClient } from "../db/supabase.server";

/**
 * Basic ownership validation.
 * Verifies if the authenticated user's ID matches the resource's owner ID.
 */
export function isOwner(userId: string, resourceOwnerId: string): boolean {
  if (!userId || !resourceOwnerId) return false;
  return userId === resourceOwnerId;
}

/**
 * Checks if a doctor is currently assigned/related to a patient.
 * A relationship exists if they have any registered appointments.
 */
export async function isDoctorAssignedToPatient(
  doctorId: string,
  patientId: string
): Promise<boolean> {
  if (!doctorId || !patientId) return false;

  const supabase = createClient() as any;

  // Check if there's any appointment between this doctor (practitioner) and patient
  const { data, error } = await supabase
    .from("appointments")
    .select("id")
    .eq("patient_id", patientId)
    .eq("practitioner_id", doctorId)
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return false;
  }

  return true;
}

/**
 * Checks if the user has access to view/modify an appointment.
 * Patients access their own, doctors access their assigned, admins have read permission.
 */
export async function canAccessAppointment(
  authUser: AuthUser,
  appointmentId: string
): Promise<boolean> {
  if (authUser.role === "admin" || authUser.role === "super_admin") return true;

  const supabase = createClient() as any;
  const { data: appointment, error } = await supabase
    .from("appointments")
    .select("patient_id, practitioner_id, doctor_profile_id")
    .eq("id", appointmentId)
    .maybeSingle();

  if (error || !appointment) return false;

  if (authUser.role === "patient") {
    // appointments table stores patient_id. Let's check if the patient_id matches the patient's record id
    const { data: patient } = await supabase
      .from("patients")
      .select("id")
      .eq("user_id", authUser.id)
      .maybeSingle();
    return patient ? appointment.patient_id === patient.id : false;
  }

  if (authUser.role === "doctor" || (authUser.role as string) === "practitioner") {
    // Check practitioner_id directly
    const { data: doc } = await supabase
      .from("practitioners")
      .select("id")
      .eq("user_id", authUser.id)
      .maybeSingle();

    if (doc && (appointment.practitioner_id === doc.id || appointment.doctor_profile_id === doc.id)) return true;
  }

  return false;
}

/**
 * Checks if the user has access to view/modify a health record.
 */
export async function canAccessRecord(
  authUser: AuthUser,
  recordId: string
): Promise<boolean> {
  if (authUser.role === "admin" || authUser.role === "super_admin") return true;

  const supabase = createClient() as any;
  const { data: record, error } = await supabase
    .from("health_records")
    .select("patient_id")
    .eq("id", recordId)
    .maybeSingle();

  if (error || !record) return false;

  // Get patient registry ID for the patient
  const { data: patient } = await supabase
    .from("patients")
    .select("id")
    .eq("user_id", authUser.id)
    .maybeSingle();

  if (authUser.role === "patient") {
    return patient ? record.patient_id === patient.id : false;
  }

  if (authUser.role === "doctor" || (authUser.role as string) === "practitioner") {
    // Verify relationship
    return patient ? await isDoctorAssignedToPatient(authUser.id, patient.id) : false;
  }

  return false;
}

/**
 * Checks if the user has access to a prescription.
 */
export async function canAccessPrescription(
  authUser: AuthUser,
  prescriptionId: string
): Promise<boolean> {
  if (authUser.role === "admin" || authUser.role === "super_admin") return true;

  const supabase = createClient() as any;
  const { data: rx, error } = await supabase
    .from("prescriptions")
    .select("patient_id, doctor_id")
    .eq("id", prescriptionId)
    .maybeSingle();

  if (error || !rx) return false;

  if (authUser.role === "patient") {
    const { data: patient } = await supabase
      .from("patients")
      .select("id")
      .eq("user_id", authUser.id)
      .maybeSingle();
    return patient ? rx.patient_id === patient.id : false;
  }

  if (authUser.role === "doctor" || (authUser.role as string) === "practitioner") {
    const { data: doc } = await supabase
      .from("practitioners")
      .select("id")
      .eq("user_id", authUser.id)
      .maybeSingle();
    return doc ? (rx.doctor_id === doc.id || rx.practitioner_id === doc.id) : false;
  }

  return false;
}

/**
 * Checks if the user has access to a consultation room.
 */
export async function canAccessConsultation(
  authUser: AuthUser,
  consultationId: string
): Promise<boolean> {
  // Logic maps similarly to appointments access
  return canAccessAppointment(authUser, consultationId);
}

/**
 * Checks if the user is authorized to download a file.
 */
export async function canDownloadFile(
  authUser: AuthUser,
  fileBucket: string,
  filePath: string
): Promise<boolean> {
  // Protect private medical folders
  if (fileBucket === "records" || fileBucket === "prescriptions") {
    if (authUser.role === "admin" || authUser.role === "super_admin") return true;

    // Standard filename layout has patient id or user id embedded
    const isRelated = filePath.includes(authUser.id);
    return isRelated;
  }
  return true; // Public buckets
}

/**
 * Checks if the user has access to a post-consult message thread.
 */
export async function canAccessMessageThread(
  authUser: AuthUser,
  threadId: string
): Promise<boolean> {
  // Verify thread access via appointment/consultation validation
  return canAccessAppointment(authUser, threadId);
}

/**
 * Checks if the user has access to an apothecary order.
 */
export async function canAccessOrder(
  authUser: AuthUser,
  orderId: string
): Promise<boolean> {
  if (authUser.role === "admin" || authUser.role === "super_admin") return true;

  const supabase = createClient() as any;
  const { data: order, error } = await supabase
    .from("orders")
    .select("patient_id")
    .eq("id", orderId)
    .maybeSingle();

  if (error || !order) return false;

  const { data: patient } = await supabase
    .from("patients")
    .select("id")
    .eq("user_id", authUser.id)
    .maybeSingle();

  return patient ? order.patient_id === patient.id : false;
}
