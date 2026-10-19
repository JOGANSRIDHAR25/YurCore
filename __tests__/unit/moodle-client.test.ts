import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

import { callMoodle, MoodleError } from "@/backend/integration/moodle/moodle.client";

describe("callMoodle", () => {
  beforeEach(() => {
    process.env.MOODLE_BASE_URL = "http://moodle.test/moodle";
    process.env.MOODLE_WS_TOKEN = "secret-token";
    vi.restoreAllMocks();
  });

  it("sends the token in the POST body (not the URL) and PHP-style nested params", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify([{ id: 7 }]), { status: 200 }));
    await callMoodle("core_course_create_courses", { courses: [{ fullname: "A", visible: true }] });
    const [url, init] = spy.mock.calls[0];
    expect(String(url)).not.toContain("secret-token");
    const body = (init!.body as URLSearchParams).toString();
    expect(decodeURIComponent(body)).toContain("courses[0][fullname]=A");
    expect(decodeURIComponent(body)).toContain("courses[0][visible]=1");
    expect(body).toContain("wstoken=secret-token");
  });

  it("maps Moodle access errors to missing_function without leaking detail in the message", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ exception: "x", errorcode: "accessexception", message: "Access control exception" })));
    const err = (await callMoodle("core_user_create_users").catch((e) => e)) as MoodleError;
    expect(err).toBeInstanceOf(MoodleError);
    expect(err.kind).toBe("missing_function");
    expect(err.message).not.toContain("Access control");
  });

  it("reports unavailable when Moodle is down and not_configured without env", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));
    expect(((await callMoodle("x").catch((e) => e)) as MoodleError).kind).toBe("unavailable");
    delete process.env.MOODLE_WS_TOKEN;
    expect(((await callMoodle("x").catch((e) => e)) as MoodleError).kind).toBe("not_configured");
  });
});
