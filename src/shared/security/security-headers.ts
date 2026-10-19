import { NextResponse } from "next/server";

function getJitsiDomain(): string {
  const raw = process.env.JITSI_DOMAIN?.trim() || "meet.jit.si";
  return raw.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
}

function getSupabaseOrigin(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * Builds the CSP value from this deployment's actual configured external
 * services (Jitsi domain, Supabase project URL) rather than a hardcoded
 * guess, so it doesn't drift from the real allowed hosts. See the video
 * consult flow (`@jitsi/react-sdk`, loaded client-side) and Supabase
 * client/realtime usage — those are the only external hosts this app talks
 * to from the browser.
 *
 * script-src/style-src keep 'unsafe-inline' because this app doesn't wire
 * up nonce-based CSP (would require threading a per-request nonce through
 * the App Router render) — a stricter policy is possible as a follow-up but
 * risks breaking the app without it.
 */
function buildCsp(): string {
  const isDev = process.env.NODE_ENV !== "production";
  const jitsiDomain = getJitsiDomain();
  const supabaseOrigin = getSupabaseOrigin();
  const supabaseWs = supabaseOrigin ? supabaseOrigin.replace(/^https:/, "wss:") : null;

  const connectSrc = [
    "'self'",
    supabaseOrigin,
    supabaseWs,
    `https://${jitsiDomain}`,
    `wss://${jitsiDomain}`,
    "https://*.jit.si",
    "wss://*.jit.si",
    // Next.js dev server's hot-reload websocket/eval — not present in production builds.
    isDev ? "ws://localhost:*" : null,
    isDev ? "http://localhost:*" : null,
  ].filter(Boolean);

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": [
      "'self'",
      "'unsafe-inline'",
      `https://${jitsiDomain}`,
      "https://*.jit.si",
      // React dev mode uses eval() for debugging call stacks; never emitted in production.
      isDev ? "'unsafe-eval'" : null,
    ].filter(Boolean) as string[],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "https:", "blob:"],
    "font-src": ["'self'", "data:"],
    "connect-src": connectSrc as string[],
    // Supabase Storage: YurCore Learning shows course PDFs and videos inline (short-lived signed URLs).
    // blob: lets the admin preview a PDF that has just been picked for upload.
    "frame-src": [`https://${jitsiDomain}`, "https://*.jit.si", supabaseOrigin, "blob:"].filter(Boolean) as string[],
    "media-src": ["'self'", "blob:", `https://${jitsiDomain}`, "https://*.jit.si", supabaseOrigin].filter(Boolean) as string[],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };

  return Object.entries(directives)
    .map(([directive, sources]) => `${directive} ${sources.join(" ")}`)
    .join("; ");
}

/**
 * Applies security headers to a Next.js NextResponse object.
 * Protects the client app from clickjacking, MIME sniffing, and cross-site scripting.
 */
export function applySecurityHeaders(res: NextResponse): NextResponse {
  // 1. Clickjacking protection (X-Frame-Options; frame-ancestors in CSP below is the modern equivalent)
  res.headers.set("X-Frame-Options", "DENY");

  // 2. MIME sniffing protection (X-Content-Type-Options)
  res.headers.set("X-Content-Type-Options", "nosniff");

  // 3. Referrer Policy
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  // 4. Strict Transport Security (enforced in production)
  if (process.env.NODE_ENV === "production") {
    res.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains; preload"
    );
  }

  // 5. Permissions Policy (restricts camera/microphone access, video room page handles this dynamically)
  res.headers.set(
    "Permissions-Policy",
    "geolocation=(), microphone=*, camera=*, display-capture=*"
  );

  // 6. Content Security Policy — scoped to this app's actual external hosts
  res.headers.set("Content-Security-Policy", buildCsp());

  return res;
}
