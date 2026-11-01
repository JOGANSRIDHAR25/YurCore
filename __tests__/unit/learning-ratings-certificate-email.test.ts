import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: (fn: () => unknown) => void fn() }));
vi.mock("@/shared/db/supabase.server", () => ({ createClient: () => { throw new Error("db must not be reached"); } }));

import { LearningProfileRepository as Repo, toRating, type CertificateRow, type DeliveryRecord } from "@/backend/repo/learning-profile.repo";
import { EmailRepository } from "@/backend/repo/email.repo";
import { LearningCredentials, attachmentName, isCompletePdf } from "@/backend/service/learning-credentials.service";
import { LearningNotify } from "@/backend/service/learning-notify.service";
import { learningCourseCompletedTemplate } from "@/lib/email/templates/learning";

const pdf = (body = "x".repeat(200)) => Buffer.from(`%PDF-1.3\n${body}\n%%EOF\n`, "latin1");

describe("course rating aggregate", () => {
  it("averages the submitted ratings to one decimal with the 1-5 distribution", () => {
    // 5,5,4,4,3 -> 21 / 5 = 4.2
    expect(toRating({ course_id: "c", rating_count: 5, rating_sum: 21, stars_1: 0, stars_2: 0, stars_3: 1, stars_4: 2, stars_5: 2 })).toEqual({ average: 4.2, count: 5, distribution: [0, 0, 1, 2, 2] });
  });

  it("rounds rather than truncates", () => {
    // 4,5,5 -> 14 / 3 = 4.666... -> 4.7
    expect(toRating({ course_id: "c", rating_count: 3, rating_sum: 14, stars_1: 0, stars_2: 0, stars_3: 0, stars_4: 1, stars_5: 2 }).average).toBe(4.7);
  });

  it("has no score at all when nobody has rated the course", () => {
    expect(toRating(null)).toEqual({ average: null, count: 0, distribution: [0, 0, 0, 0, 0] });
  });

  it("reports every requested course, rated or not, from one database call", async () => {
    const rpc = vi.fn(async () => ({ data: [{ course_id: "a", rating_count: 2, rating_sum: 9, stars_1: 0, stars_2: 0, stars_3: 0, stars_4: 1, stars_5: 1 }], error: null }));
    const db = await import("@/shared/db/supabase.server");
    vi.spyOn(db, "createClient").mockReturnValue({ rpc } as never);
    const m = await Repo.courseRatings(["a", "b"]);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(m.get("a")).toMatchObject({ average: 4.5, count: 2 });
    expect(m.get("b")).toMatchObject({ average: null, count: 0 });
  });
});

describe("course rating fallback before the ratings function is deployed", () => {
  it("counts the same feedback rows in the app, skipping deactivated accounts", async () => {
    const rows = [
      { course_id: "s", rating: 3, user: { is_active: true } },
      { course_id: "s", rating: 4, user: { is_active: true } },
      { course_id: "s", rating: 1, user: { is_active: false } },
      { course_id: "q", rating: 5, user: { is_active: true } },
    ];
    const chain = { select: () => chain, in: () => chain, order: () => chain, range: async () => ({ data: rows, error: null }) };
    const rpc = vi.fn(async () => ({ data: null, error: { code: "PGRST202", message: "Could not find the function" } }));
    const db = await import("@/shared/db/supabase.server");
    vi.spyOn(db, "createClient").mockReturnValue({ rpc, from: () => chain } as never);
    const m = await Repo.courseRatings(["s", "q", "none"]);
    expect(m.get("s")).toEqual({ average: 3.5, count: 2, distribution: [0, 0, 1, 1, 0] });
    expect(m.get("q")).toMatchObject({ average: 5, count: 1 });
    expect(m.get("none")).toMatchObject({ average: null, count: 0 });
  });
});

describe("certificate attachment helpers", () => {
  it("accepts only complete PDFs", () => {
    expect(isCompletePdf(pdf())).toBe(true);
    expect(isCompletePdf(Buffer.alloc(0))).toBe(false);
    expect(isCompletePdf(Buffer.from("<html>not a pdf</html>".repeat(20)))).toBe(false);
    expect(isCompletePdf(pdf().subarray(0, 120))).toBe(false); // truncated: no %%EOF
  });

  it("names the file after the certificate and strips unsafe characters", () => {
    expect(attachmentName("AYL-2026-000001")).toBe("YurCore_Certificate_AYL-2026-000001.pdf");
    expect(attachmentName("../AYL 2026/../x")).toBe("YurCore_Certificate_AYL2026x.pdf");
  });

  it("the completion email points to verification and no longer asks the learner to download", () => {
    const e = learningCourseCompletedTemplate({ name: "Dr. Jaya", courseTitle: "Sleep", completedOn: "28 October 2026", credits: "2.5 CME credits", certificateNumber: "AYL-2026-000001", verifyUrl: "https://app/verify/certificate/AYL-2026-000001/" });
    expect(e.html).toContain("Verify Certificate");
    expect(e.html).toContain("https://app/verify/certificate/AYL-2026-000001/");
    expect(e.html).not.toContain("Download Certificate");
    expect(e.text).toContain("attached");
  });
});

describe("course-completed email carries the certificate PDF", () => {
  const cert = { id: "cert-1", certificate_number: "AYL-2026-000001", status: "valid", user_id: "u1" } as CertificateRow;
  const delivery = {
    id: "d1", user_id: "u1", kind: "course_completed", status: "failed", attempts: 1, certificate_id: "cert-1", recipient_email: "jaya@example.com",
    payload: { name: "Dr. Jaya", courseTitle: "Sleep", completedOn: "28 October 2026", credits: null, certificateNumber: "AYL-2026-000001", verifyUrl: "https://app/verify/certificate/AYL-2026-000001/" },
  } as unknown as DeliveryRecord;
  let finished: { status: string; last_error?: string | null }[];

  beforeEach(() => {
    vi.restoreAllMocks();
    finished = [];
    vi.spyOn(Repo, "getDelivery").mockResolvedValue(delivery);
    vi.spyOn(Repo, "getUsers").mockResolvedValue(new Map([["u1", { email: "jaya@example.com", role: "practitioner", is_active: true }]]));
    vi.spyOn(Repo, "getPractitionerProfiles").mockResolvedValue(new Map([["u1", { full_name: "Dr. Jaya", qualifications: null, reg_number: null, reg_council: null, hpr_id: null }]]));
    vi.spyOn(Repo, "startAttempt").mockResolvedValue(true);
    vi.spyOn(Repo, "finishDelivery").mockImplementation(async (_id, patch) => { finished.push(patch); });
    vi.spyOn(Repo, "getCertificate").mockResolvedValue(cert);
  });

  it("attaches the rendered PDF (application/pdf bytes, base64) and records the send", async () => {
    vi.spyOn(LearningCredentials, "ensurePdf").mockResolvedValue("certificates/u1/cert-1-v1.pdf");
    vi.spyOn(Repo, "downloadAsset").mockResolvedValue(pdf());
    const send = vi.spyOn(EmailRepository, "sendEmailWithResult").mockResolvedValue({ ok: true });
    await LearningNotify.retry("d1");
    expect(send).toHaveBeenCalledTimes(1);
    const payload = send.mock.calls[0][0];
    expect(payload.attachment?.filename).toBe("YurCore_Certificate_AYL-2026-000001.pdf");
    expect(Buffer.from(payload.attachment!.contentBase64, "base64").subarray(0, 5).toString()).toBe("%PDF-");
    expect(finished.at(-1)?.status).toBe("sent");
  });

  it("does not send (and does not mark sent) when the PDF cannot be produced", async () => {
    vi.spyOn(LearningCredentials, "ensurePdf").mockResolvedValue("certificates/u1/cert-1-v1.pdf");
    vi.spyOn(Repo, "downloadAsset").mockResolvedValue(Buffer.from("broken"));
    const send = vi.spyOn(EmailRepository, "sendEmailWithResult").mockResolvedValue({ ok: true });
    await LearningNotify.retry("d1");
    expect(send).not.toHaveBeenCalled();
    expect(finished.at(-1)).toMatchObject({ status: "failed" });
    expect(finished.at(-1)?.last_error).toMatch(/Certificate PDF unavailable/);
  });

  it("marks the delivery failed when the mail provider rejects it", async () => {
    vi.spyOn(LearningCredentials, "ensurePdf").mockResolvedValue("p.pdf");
    vi.spyOn(Repo, "downloadAsset").mockResolvedValue(pdf());
    vi.spyOn(EmailRepository, "sendEmailWithResult").mockResolvedValue({ ok: false, error: "SMTP 535" });
    await LearningNotify.retry("d1");
    expect(finished.at(-1)).toMatchObject({ status: "failed", last_error: "SMTP 535" });
  });

  it("never emails a revoked certificate", async () => {
    vi.spyOn(Repo, "getCertificate").mockResolvedValue({ ...cert, status: "revoked" } as CertificateRow);
    const send = vi.spyOn(EmailRepository, "sendEmailWithResult");
    await LearningNotify.retry("d1");
    expect(send).not.toHaveBeenCalled();
    expect(finished.at(-1)?.status).toBe("skipped");
  });
});
