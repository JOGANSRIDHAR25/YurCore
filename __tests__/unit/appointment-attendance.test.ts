import { describe, expect, it } from "vitest";

import {
  didPatientLeave,
  isArrivedClinicPatient,
  isAwaitingNotes,
  isMissableStatus,
  isMissedBy,
  isPastMissedDeadline,
  resolveMissedBy,
} from "@/shared/appointments/attendance";
import { appointmentMissedTemplate } from "@/lib/email/templates/appointment-missed";

describe("isMissableStatus", () => {
  it("allows missing a slot nobody has been in together yet", () => {
    expect(isMissableStatus("scheduled")).toBe(true);
    expect(isMissableStatus("rescheduled")).toBe(true);
    expect(isMissableStatus("checked_in")).toBe(true);
  });

  it("never misses a consultation that happened or is already resolved", () => {
    expect(isMissableStatus("in_session")).toBe(false);
    expect(isMissableStatus("completed")).toBe(false);
    expect(isMissableStatus("cancelled")).toBe(false);
    expect(isMissableStatus("no_show")).toBe(false);
    expect(isMissableStatus(null)).toBe(false);
  });
});

describe("resolveMissedBy", () => {
  const at = "2026-09-29T10:00:00.000Z";

  it("blames the doctor when only the patient joined", () => {
    expect(resolveMissedBy({ mode: "video", patientJoinedAt: at, practitionerJoinedAt: null })).toBe("practitioner");
  });

  it("blames the patient when only the doctor joined", () => {
    expect(resolveMissedBy({ mode: "video", patientJoinedAt: null, practitionerJoinedAt: at })).toBe("patient");
  });

  it("records both when nobody joined a video slot", () => {
    expect(resolveMissedBy({ mode: "video", patientJoinedAt: null, practitionerJoinedAt: null })).toBe("both");
  });

  it("treats an unstarted clinic slot as a patient no-show", () => {
    expect(resolveMissedBy({ mode: "clinic", patientJoinedAt: null, practitionerJoinedAt: null })).toBe("patient");
  });
});

describe("isAwaitingNotes", () => {
  it("is true once the call has ended for an in-session appointment", () => {
    expect(isAwaitingNotes("in_session", "ended", null)).toBe(true);
    expect(isAwaitingNotes("in_session", "in_progress", "2026-09-29T10:20:00.000Z")).toBe(true);
  });

  it("is false while the call is live or once completed", () => {
    expect(isAwaitingNotes("in_session", "in_progress", null)).toBe(false);
    expect(isAwaitingNotes("completed", "ended", "2026-09-29T10:20:00.000Z")).toBe(false);
  });
});

describe("isMissedBy", () => {
  it("accepts only known values", () => {
    expect(isMissedBy("patient")).toBe(true);
    expect(isMissedBy("practitioner")).toBe(true);
    expect(isMissedBy("both")).toBe(true);
    expect(isMissedBy("doctor")).toBe(false);
    expect(isMissedBy(null)).toBe(false);
  });
});

describe("appointmentMissedTemplate", () => {
  const base = { patientName: "Asha", practitionerName: "Rao", date: "September 29, 2026", time: "10:00 AM" };

  it("tells the patient they missed it by default", () => {
    const email = appointmentMissedTemplate({ ...base, missedBy: "patient" });
    expect(email.subject).toBe("You missed your YurCore appointment");
    expect(email.text).toContain("It looks like you missed");
  });

  it("does not blame the patient when the doctor didn't join", () => {
    const email = appointmentMissedTemplate({ ...base, missedBy: "practitioner" });
    expect(email.subject).toBe("Your YurCore appointment did not take place");
    expect(email.text).toContain("Dr. Rao was not available for the appointment below");
    expect(email.text).not.toContain("you missed");
  });
});

describe("appointmentMissedTemplate for a family member", () => {
  const base = { patientName: "Priya", practitionerName: "Rao", date: "September 29, 2026", time: "10:00 AM", familyMemberName: "Ravi" };

  it("tells the account owner their family member missed it", () => {
    const email = appointmentMissedTemplate({ ...base, missedBy: "patient" });
    expect(email.subject).toBe("Ravi missed a YurCore appointment");
    expect(email.text).toContain("Hi Priya,");
    expect(email.text).toContain("your family member Ravi missed the appointment below");
    expect(email.text).toContain("Patient: Ravi");
  });

  it("names the family member when the doctor didn't join", () => {
    const email = appointmentMissedTemplate({ ...base, missedBy: "practitioner" });
    expect(email.subject).toBe("Ravi's YurCore appointment did not take place");
    expect(email.text).toContain("Dr. Rao was not available for your family member Ravi's appointment below");
  });

  it("capitalises the sentence when nobody joined", () => {
    const email = appointmentMissedTemplate({ ...base, missedBy: "both" });
    expect(email.text).toContain("Your family member Ravi's appointment below ended without the consultation taking place.");
  });
});

describe("in-clinic arrival (Mark Arrived)", () => {
  // Slot 10:00, 20 min + 5 min buffer => cutoff 10:25 on 2026-10-01.
  const slot = { scheduled_date: "2026-10-01", scheduled_time: "10:00:00" };
  const at = (time: string, date = "2026-10-01") => new Date(`${date}T${time}`);
  const arrivedClinic = { ...slot, mode: "clinic", status: "checked_in", patient_joined_at: "2026-10-01T04:25:00.000Z" };

  it("recognises an arrived clinic patient", () => {
    expect(isArrivedClinicPatient(arrivedClinic)).toBe(true);
    expect(isArrivedClinicPatient({ ...arrivedClinic, mode: "video" })).toBe(false);
    expect(isArrivedClinicPatient({ ...arrivedClinic, status: "scheduled", patient_joined_at: null })).toBe(false);
  });

  it("misses a clinic patient who never arrived once the cutoff passes", () => {
    const notArrived = { ...slot, mode: "clinic", status: "scheduled", patient_joined_at: null };
    expect(isPastMissedDeadline(notArrived, { slotDurationMin: 20, bufferMin: 5, now: at("10:20:00") })).toBe(false);
    expect(isPastMissedDeadline(notArrived, { slotDurationMin: 20, bufferMin: 5, now: at("10:30:00") })).toBe(true);
  });

  it("closes an arrived clinic patient when the doctor's working hours end (+30 min grace)", () => {
    const opts = { slotDurationMin: 20, bufferMin: 5, workingEndTime: "13:00:00" };
    expect(isPastMissedDeadline(arrivedClinic, { ...opts, now: at("10:30:00") })).toBe(false);
    expect(isPastMissedDeadline(arrivedClinic, { ...opts, now: at("13:20:00") })).toBe(false);
    expect(isPastMissedDeadline(arrivedClinic, { ...opts, now: at("13:31:00") })).toBe(true);
  });

  it("never closes an arrived clinic patient before their own slot window ends", () => {
    // Working hours already over at 09:00, but the slot itself runs to 10:25.
    const opts = { slotDurationMin: 20, bufferMin: 5, workingEndTime: "09:00:00" };
    expect(isPastMissedDeadline(arrivedClinic, { ...opts, now: at("10:20:00") })).toBe(false);
    expect(isPastMissedDeadline(arrivedClinic, { ...opts, now: at("10:30:00") })).toBe(true);
  });

  it("tells a patient who left apart from one who never came", () => {
    expect(didPatientLeave("patient", arrivedClinic.patient_joined_at)).toBe(true);
    expect(didPatientLeave("patient", null)).toBe(false);
    expect(didPatientLeave("practitioner", arrivedClinic.patient_joined_at)).toBe(false);
  });

  it("without known working hours, keeps an arrived clinic patient waiting all day", () => {
    expect(isPastMissedDeadline(arrivedClinic, { slotDurationMin: 20, bufferMin: 5, now: at("10:30:00") })).toBe(false);
    expect(isPastMissedDeadline(arrivedClinic, { slotDurationMin: 20, bufferMin: 5, now: at("23:50:00") })).toBe(false);
  });

  it("misses an arrived clinic patient once the day is over - blamed on the doctor", () => {
    expect(isPastMissedDeadline(arrivedClinic, { slotDurationMin: 20, bufferMin: 5, now: at("00:05:00", "2026-10-02") })).toBe(true);
    expect(resolveMissedBy({ mode: "clinic", patientJoinedAt: arrivedClinic.patient_joined_at, practitionerJoinedAt: null })).toBe("practitioner");
  });

  it("still misses a video slot at the cutoff when only one side came", () => {
    const videoWaiting = { ...slot, mode: "video", status: "checked_in", patient_joined_at: "2026-10-01T04:25:00.000Z" };
    expect(isPastMissedDeadline(videoWaiting, { slotDurationMin: 20, bufferMin: 5, now: at("10:30:00") })).toBe(true);
  });

  it("never misses an in-session or completed appointment", () => {
    expect(isPastMissedDeadline({ ...slot, mode: "clinic", status: "in_session", patient_joined_at: null }, { slotDurationMin: 20, bufferMin: 5, now: at("18:00:00") })).toBe(false);
    expect(isPastMissedDeadline({ ...slot, mode: "video", status: "completed", patient_joined_at: null }, { slotDurationMin: 20, bufferMin: 5, now: at("18:00:00") })).toBe(false);
  });
});

describe("appointmentMissedTemplate when the patient left the clinic", () => {
  const base = { patientName: "Asha", practitionerName: "Rao", date: "October 1, 2026", time: "10:00 AM", missedBy: "patient" as const, patientLeft: true };

  it("says the appointment was closed because they left", () => {
    const email = appointmentMissedTemplate(base);
    expect(email.subject).toBe("Your YurCore appointment was closed");
    expect(email.text).toContain("The appointment below was closed because you left before the consultation.");
  });

  it("words it for a family member", () => {
    const email = appointmentMissedTemplate({ ...base, patientName: "Priya", familyMemberName: "Ravi" });
    expect(email.subject).toBe("Ravi's YurCore appointment was closed");
    expect(email.text).toContain("Your family member Ravi's appointment below was closed because they left before the consultation.");
  });
});
