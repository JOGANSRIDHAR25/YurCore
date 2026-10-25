import { describe, expect, it } from "vitest";

import { mergeInboxThreads, threadKey, type InboxConsultationRow, type InboxMessageRow } from "@/backend/repo/patient-inbox.merge";
import { groupThreadsByDoctor, matchesSearch, patientRoleLabel } from "@/app/(portal)/messages/grouping";
import type { PatientInboxThread } from "@/app/(portal)/messages/type";

const NOW = new Date("2026-10-22T12:00:00Z").getTime();
const OWNER = "owner-patient";
const KUMARAN = "kumaran-patient";
const KAVITHA = "kavitha-patient";
const JAYA = "dr-jaya";
const KRISH = "dr-krish";

const msg = (sent_at: string, over: Partial<InboxMessageRow> = {}): InboxMessageRow => ({
  content: "hello",
  sent_at,
  read_at: "2026-10-22T00:00:00Z",
  direction: "patient_to_doctor",
  attachment_path: null,
  attachment_type: null,
  ...over,
});

const consult = (id: string, practitioner_id: string, patient_id: string, created_at: string, messages: InboxMessageRow[] = [], name = practitioner_id === JAYA ? "Dr. Jaya" : "Dr. S. B. Krish"): InboxConsultationRow => ({
  id,
  created_at,
  practitioner_id,
  patient_id,
  practitioner: { full_name: name },
  messages,
});

const people = (pid: string) =>
  pid === KUMARAN
    ? { name: "S. Kumaran", isFamilyMember: true, relationship: "Father" }
    : pid === KAVITHA
      ? { name: "Kavitha S", isFamilyMember: true }
      : { name: "Jayashree T", isFamilyMember: false };

describe("mergeInboxThreads", () => {
  it("previews the latest message even when the newest consultation has none", () => {
    const threads = mergeInboxThreads(
      [
        consult("c-new", JAYA, OWNER, "2026-10-21T22:00:00Z"),
        consult("c-old", JAYA, OWNER, "2026-10-10T10:00:00Z", [
          msg("2026-10-11T09:00:00Z", { content: "first" }),
          msg("2026-10-20T09:00:00Z", { content: "latest reply" }),
        ]),
      ],
      people,
      NOW,
    );
    expect(threads).toHaveLength(1);
    expect(threads[0].lastMessage).toBe("latest reply");
    expect(threads[0].lastActivityAt).toBe("2026-10-20T09:00:00Z");
    expect(threads[0].hasMessages).toBe(true);
    // Sends go to the newest consultation; the conversation spans all of them.
    expect(threads[0].consultationId).toBe("c-new");
  });

  it("keeps a stable id per doctor + patient across new consultations", () => {
    const before = mergeInboxThreads([consult("c1", JAYA, OWNER, "2026-10-01T00:00:00Z")], people, NOW);
    const after = mergeInboxThreads(
      [consult("c2", JAYA, OWNER, "2026-10-21T00:00:00Z"), consult("c1", JAYA, OWNER, "2026-10-01T00:00:00Z")],
      people,
      NOW,
    );
    expect(before[0].id).toBe(threadKey(JAYA, OWNER));
    expect(after[0].id).toBe(before[0].id);
    expect(after[0].consultationId).toBe("c2");
  });

  it("keeps different patients with the same doctor separate", () => {
    const threads = mergeInboxThreads(
      [consult("a", JAYA, OWNER, "2026-10-01T00:00:00Z"), consult("b", JAYA, KUMARAN, "2026-10-02T00:00:00Z")],
      people,
      NOW,
    );
    expect(threads.map((t) => t.patientName).sort()).toEqual(["Jayashree T", "S. Kumaran"]);
    expect(new Set(threads.map((t) => t.id)).size).toBe(2);
    const kumaran = threads.find((t) => t.patientId === KUMARAN)!;
    expect(kumaran.isFamilyMember).toBe(true);
    expect(kumaran.relationship).toBe("Father");
  });

  it("adds up unread doctor messages across the pair's consultations", () => {
    const unread = (at: string) => msg(at, { direction: "doctor_to_patient", read_at: null });
    const threads = mergeInboxThreads(
      [
        consult("a", JAYA, OWNER, "2026-10-01T00:00:00Z", [unread("2026-10-02T00:00:00Z")]),
        consult("b", JAYA, OWNER, "2026-10-05T00:00:00Z", [unread("2026-10-06T00:00:00Z"), msg("2026-10-07T00:00:00Z")]),
      ],
      people,
      NOW,
    );
    expect(threads[0].unreadCount).toBe(2);
    expect(threads[0].unread).toBe(true);
  });

  it("labels attachments and empty conversations", () => {
    const threads = mergeInboxThreads(
      [
        consult("a", JAYA, OWNER, "2026-10-01T00:00:00Z", [msg("2026-10-02T00:00:00Z", { content: "", attachment_path: "x/y.png", attachment_type: "image/png" })]),
        consult("b", KRISH, OWNER, "2026-09-01T00:00:00Z"),
      ],
      people,
      NOW,
    );
    expect(threads.find((t) => t.practitionerId === JAYA)!.lastMessage).toBe("Photo");
    const empty = threads.find((t) => t.practitionerId === KRISH)!;
    expect(empty.lastMessage).toBe("No messages yet");
    expect(empty.hasMessages).toBe(false);
  });

  it("accepts the doctor join as a list, as Supabase types describe it", () => {
    const row = { ...consult("a", JAYA, OWNER, "2026-10-01T00:00:00Z"), practitioner: [{ full_name: "Dr. Jaya" }] };
    expect(mergeInboxThreads([row], people, NOW)[0].doctorName).toBe("Dr. Jaya");
  });
});

describe("groupThreadsByDoctor", () => {
  const threads: PatientInboxThread[] = mergeInboxThreads(
    [
      consult("j-own", JAYA, OWNER, "2026-10-01T00:00:00Z", [msg("2026-10-22T11:53:00Z")]),
      consult("j-kum", JAYA, KUMARAN, "2026-10-01T00:00:00Z", [msg("2026-10-21T10:00:00Z")]),
      consult("k-kav", KRISH, KAVITHA, "2026-08-01T00:00:00Z", [msg("2026-08-03T10:00:00Z", { direction: "doctor_to_patient", read_at: null })]),
      consult("k-own", KRISH, OWNER, "2026-08-31T00:00:00Z"),
    ],
    people,
    NOW,
  );

  it("shows each doctor once with one row per patient, most recent first", () => {
    const groups = groupThreadsByDoctor(threads);
    expect(groups.map((g) => g.doctorName)).toEqual(["Dr. Jaya", "Dr. S. B. Krish"]);
    expect(groups[0].threads.map((t) => t.patientName)).toEqual(["Jayashree T", "S. Kumaran"]);
    // k-own has no messages; it sorts by its consultation date (31 Aug) above Kavitha's 3 Aug message.
    expect(groups[1].threads.map((t) => t.patientName)).toEqual(["Jayashree T", "Kavitha S"]);
    expect(groups[1].unreadCount).toBe(1);
  });

  it("searches by doctor name and by patient name", () => {
    expect(groupThreadsByDoctor(threads, "krish").map((g) => g.doctorName)).toEqual(["Dr. S. B. Krish"]);
    const byPatient = groupThreadsByDoctor(threads, "kumaran");
    expect(byPatient).toHaveLength(1);
    expect(byPatient[0].threads.map((t) => t.patientName)).toEqual(["S. Kumaran"]);
    expect(groupThreadsByDoctor(threads, "nobody")).toEqual([]);
  });

  it("describes whose conversation each row is", () => {
    const own = threads.find((t) => !t.isFamilyMember)!;
    const kumaran = threads.find((t) => t.patientId === KUMARAN)!;
    expect(patientRoleLabel(own)).toBe("Your consultation");
    expect(patientRoleLabel(kumaran)).toBe("Family member · Father");
    expect(matchesSearch(kumaran, "father")).toBe(true);
  });
});
