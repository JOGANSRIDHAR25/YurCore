import "server-only";

import { getMoodleConfig } from "./config";

export type MoodleErrorKind = "not_configured" | "unavailable" | "timeout" | "missing_function" | "rejected" | "not_found";

/**
 * Internal error carrying Moodle detail for server logs only.
 * Controllers translate it to a generic message — never return `detail` to a browser.
 */
export class MoodleError extends Error {
  constructor(
    public readonly kind: MoodleErrorKind,
    public readonly fn: string,
    public readonly detail?: string,
  ) {
    super(`Moodle ${kind} (${fn})`);
    this.name = "MoodleError";
  }
}

type Param = string | number | boolean | null | undefined | Param[] | { [k: string]: Param };

/** Moodle REST expects PHP-style nested form fields: a[0][b]=c. */
function flatten(value: Param, prefix: string, out: URLSearchParams) {
  if (value === undefined || value === null) return;
  if (Array.isArray(value)) {
    value.forEach((v, i) => flatten(v, `${prefix}[${i}]`, out));
  } else if (typeof value === "object") {
    for (const [k, v] of Object.entries(value)) flatten(v, prefix ? `${prefix}[${k}]` : k, out);
  } else {
    out.append(prefix, typeof value === "boolean" ? (value ? "1" : "0") : String(value));
  }
}

/**
 * Calls a Moodle Web Service function. The token is sent in the POST body
 * (not the URL) so it does not end up in access logs.
 */
export async function callMoodle<T>(fn: string, params: Record<string, Param> = {}, opts: { timeoutMs?: number } = {}): Promise<T> {
  const cfg = getMoodleConfig();
  if (!cfg.configured) throw new MoodleError("not_configured", fn);

  const body = new URLSearchParams({ wstoken: cfg.token, wsfunction: fn, moodlewsrestformat: "json" });
  flatten(params, "", body);

  let res: Response;
  try {
    res = await fetch(`${cfg.baseUrl}/webservice/rest/server.php`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(opts.timeoutMs ?? cfg.timeoutMs),
    });
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    throw new MoodleError(timedOut ? "timeout" : "unavailable", fn, err instanceof Error ? err.message : undefined);
  }

  if (!res.ok) throw new MoodleError("unavailable", fn, `HTTP ${res.status}`);

  const data = (await res.json().catch(() => null)) as unknown;
  if (data && typeof data === "object" && "exception" in data) {
    const e = data as { errorcode?: string; message?: string };
    const code = e.errorcode ?? "";
    if (code === "accessexception" || code === "invalidtoken" || code === "servicenotavailable") {
      // Token lacks the function / is invalid: a configuration problem, not a user error.
      throw new MoodleError("missing_function", fn, `${code}: ${e.message}`);
    }
    throw new MoodleError(code === "invalidrecord" || code === "invalidcourseid" ? "not_found" : "rejected", fn, `${code}: ${e.message}`);
  }
  return data as T;
}
