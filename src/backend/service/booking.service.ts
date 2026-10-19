import { BookingRepository, type BookAppointmentInput, type SubmitRatingInput, type AppointmentRow } from "../repo/booking.repo";
import { AppointmentsRepository } from "../repo/appointments.repo";
import { EmailService } from "./email.service";
import { AuthUser } from "@/shared/auth/auth.types";
import { AppError } from "@/shared/api/api-error";

function formatDisplayDate(dateStr?: string | null): string {
  if (!dateStr) return "";
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDisplayTime(timeStr?: string | null): string {
  if (!timeStr) return "";
  const [h, m] = timeStr.split(":");
  const hours = parseInt(h, 10);
  const period = hours >= 12 ? "PM" : "AM";
  const h12 = hours % 12 || 12;
  return `${h12}:${m} ${period}`;
}

function formatFee(feePaise: number | null): string | undefined {
  if (feePaise === null || feePaise === undefined) return undefined;
  return `₹${Math.round(feePaise / 100)}`;
}

export class BookingService {
  static async getAppointments(
    authUser: AuthUser,
  ): Promise<AppointmentRow[]> {
    return BookingRepository.getAppointments(authUser.id);
  }

  static async bookAppointment(
    authUser: AuthUser,
    input: BookAppointmentInput,
  ): Promise<void> {
    if (!input.slotId) {
      throw new Error("Slot ID is required");
    }

    if (!input.practitionerId) {
      throw new Error("Practitioner ID is required");
    }

    if (!input.date || !input.time) {
      throw new Error("Appointment date and time are required");
    }

    // The authenticated user always books for themselves — a client-supplied
    // userId is never trusted, whoever it names.
    const scopedInput: BookAppointmentInput = { ...input, userId: authUser.id };

    const appointment = await BookingRepository.bookAppointment(scopedInput);

    const emailDetails = await AppointmentsRepository.getAppointmentEmailDetails(appointment.id);
    if (emailDetails) {
      await EmailService.sendAppointmentBooked(emailDetails.patientEmail, {
        patientName: emailDetails.patientName,
        familyMemberName: emailDetails.familyMemberName,
        practitionerName: emailDetails.practitionerName,
        date: formatDisplayDate(emailDetails.scheduledDate),
        time: formatDisplayTime(emailDetails.scheduledTime),
        mode: emailDetails.mode === "clinic" ? "clinic" : "video",
        fee: formatFee(emailDetails.feePaise),
      });
    }
  }

  static async cancelAppointment(
    authUser: AuthUser,
    appointmentId: string,
    reason: string,
  ): Promise<void> {
    if (!appointmentId) {
      throw new Error("Appointment ID is required");
    }

    if (!reason?.trim()) {
      throw new Error("Cancellation reason is required");
    }

    const owned = await BookingRepository.isAppointmentOwnedByUser(appointmentId, authUser.id);
    if (!owned) {
      throw new AppError("Appointment not found", 404);
    }

    const emailDetails = await AppointmentsRepository.getAppointmentEmailDetails(appointmentId);

    await BookingRepository.cancelAppointment(
      appointmentId,
      reason.trim(),
    );

    if (emailDetails) {
      await EmailService.sendAppointmentCancelled(emailDetails.patientEmail, {
        patientName: emailDetails.patientName,
        familyMemberName: emailDetails.familyMemberName,
        practitionerName: emailDetails.practitionerName,
        date: formatDisplayDate(emailDetails.scheduledDate),
        time: formatDisplayTime(emailDetails.scheduledTime),
        reason: reason.trim(),
      });
    }
  }

  static async submitRating(
    authUser: AuthUser,
    input: SubmitRatingInput,
  ): Promise<void> {
    if (input.stars < 1 || input.stars > 5) {
      throw new Error("Rating must be between 1 and 5");
    }

    if (!input.consultationId) {
      throw new Error("Consultation ID is required");
    }

    const owned = await BookingRepository.isConsultationOwnedByUser(input.consultationId, authUser.id);
    if (!owned) {
      throw new AppError("Consultation not found", 404);
    }

    await BookingRepository.submitRating({ ...input, userId: authUser.id });
  }
}