import "server-only";

import { DiscoverRepository, type DiscoverMetadata, type PractitionerFilters, type ReviewRow } from "../repo/discover.repo";
import type { Practitioner } from "@/features/doctor/types/doctor.types";
import { AuthUser } from "@/shared/auth/auth.types";
import { ForbiddenError } from "@/shared/api/api-error";
import { AppointmentsRepository } from "../repo/appointments.repo";
import { EmailService } from "./email.service";

export class DiscoverService {
  static async getMetadata(): Promise<DiscoverMetadata> {
    return DiscoverRepository.getMetadata();
  }

  static async searchPractitioners(filters?: PractitionerFilters): Promise<Practitioner[]> {
    return DiscoverRepository.searchPractitioners(filters);
  }

  static async getPractitionerById(idParam: string): Promise<Practitioner | null> {
    const id = await DiscoverRepository.resolvePractitionerId(idParam);
    return DiscoverRepository.getPractitionerById(id);
  }

  static async getReviews(practitionerIdParam: string): Promise<ReviewRow[]> {
    if (!practitionerIdParam) return [];
    return DiscoverRepository.getReviews(practitionerIdParam);
  }

  static async getNewDoctors(filters?: {
    specialty?: string;
    language?: string;
    mode?: "video" | "clinic";
    city?: string;
    ratingMin?: number;
    feeMax?: number;
    search?: string;
  }): Promise<any[]> {
    return DiscoverRepository.getNewDoctors(filters);
  }

  static async getDoctorSignedUrl(authUser: AuthUser, path: string): Promise<string | null> {
    if (authUser.role !== "admin" && authUser.role !== "super_admin") {
      throw new ForbiddenError("Only admins can access credential documents");
    }
    if (!path) return null;
    return DiscoverRepository.getDoctorSignedUrl(path);
  }

  static async getDoctorSlotsFromTemplates(doctorId: string, date: string): Promise<any[]> {
    if (!doctorId || !date) return [];
    return DiscoverRepository.getDoctorSlotsFromTemplates(doctorId, date);
  }

  static async getNewDoctorAvailableDates(doctorId: string): Promise<string[]> {
    if (!doctorId) return [];
    return DiscoverRepository.getNewDoctorAvailableDates(doctorId);
  }

  static async bookNewDoctorAppointment(
    authUser: AuthUser,
    params: {
      doctorProfileId: string;
      mode: "video" | "clinic";
      reason: string;
      date: string;
      time: string;
      familyMemberId?: string;
    }
  ): Promise<void> {
    if (!params.doctorProfileId) throw new Error("Doctor is required");
    if (!params.date || !params.time) throw new Error("Appointment date and time are required");

    const appointment = await DiscoverRepository.bookNewDoctorAppointment({ ...params, userId: authUser.id });

    // Same confirmation email as the standard booking flow — for a family
    // member it goes to the account owner, naming the member.
    const emailDetails = await AppointmentsRepository.getAppointmentEmailDetails(appointment.id);
    if (emailDetails) {
      const [h, m] = (emailDetails.scheduledTime || "").split(":");
      const hours = parseInt(h, 10);
      await EmailService.sendAppointmentBooked(emailDetails.patientEmail, {
        patientName: emailDetails.patientName,
        familyMemberName: emailDetails.familyMemberName,
        practitionerName: emailDetails.practitionerName,
        date: emailDetails.scheduledDate
          ? new Date(`${emailDetails.scheduledDate}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
          : "",
        time: Number.isNaN(hours) ? "" : `${hours % 12 || 12}:${m} ${hours >= 12 ? "PM" : "AM"}`,
        mode: emailDetails.mode === "clinic" ? "clinic" : "video",
      });
    }
  }
}
