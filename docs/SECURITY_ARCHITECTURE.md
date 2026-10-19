# YurCore Security Architecture

YurCore implements strict security boundaries across browser clients, server APIs, and database transactions to protect sensitive healthcare information.

---

## Security Layers Overview

```
┌────────────────────────────────────────────────────────┐
│                   Browser Protection                   │
│  • Security Headers (CSP, FrameGuard)                  │
│  • HttpOnly Lax Session Cookies                        │
└──────────────────────────┬─────────────────────────────┘
                           │ HTTPS requests
                           ▼
┌────────────────────────────────────────────────────────┐
│                   Server API Security                  │
│  • Token Signature Verification                        │
│  • Origin Validation & CSRF Protection                 │
│  • Rate Limiting                                       │
│  • MVC Role-Permission Authorization                   │
└──────────────────────────┬─────────────────────────────┘
                           │ Supabase client (Server / Admin)
                           ▼
┌────────────────────────────────────────────────────────┐
│                 Database Level (RLS)                   │
│  • Row-Level Security Policies                         │
│  • Multi-tenant user ownership isolation              │
└────────────────────────────────────────────────────────┘
```

---

## 1. Authentication & Token Management
*   **Protocol**: JWT-based session tokens.
*   **Storage**: Access (`access_token`) and Refresh (`refresh_token`) tokens are stored in the browser as `HttpOnly`, `Secure` (production-enforced), and `SameSite=Lax` cookies.
*   **Security Benefit**: HttpOnly cookies prevent script-based attacks (XSS) from reading tokens, defending against session hijacking.

## 2. CSRF & CORS Origin Protections
*   **CSRF Shield (`verifyCsrf`)**: State-changing requests (POST, PUT, PATCH, DELETE) check the request `Origin` or `Referer` header against the expected `Host` header to reject cross-site request forgeries.
*   **CORS Shield (`verifyOrigin`)**: Verifies request headers against allowed domains specified in the static configuration. Cross-origin scripts from untrusted hosts are immediately blocked.

## 3. Rate Limiting (`isRateLimited`)
*   **Protection**: Login attempts, OTP generation, and resource-heavy operations (e.g. PDF creation, file uploads) are restricted by a sliding-window rate limiter per client IP / Token ID.
*   **Benefit**: Defends against credential brute-forcing, OTP SMS spamming, and denial-of-service (DoS) resource exhaustion.

## 4. Audit Logging (`writeAuditLog`)
*   **Operation**: Sensitive triggers (logins, role alterations, medical note creation, PDF downloads) write structured records to both `console.info` (stdout collection) and the database `audit_logs` table.
*   **Privacy Guard**: The logger automatically filters out and redacts keys such as passwords, OTP credentials, tokens, medical summaries, and credit card numbers from metadata.

## 5. Security Headers
The central middleware injects security headers into all responses:
*   `X-Frame-Options: DENY` (Mitigates clickjacking)
*   `X-Content-Type-Options: nosniff` (Mitigates MIME sniffing)
*   `Referrer-Policy: strict-origin-when-cross-origin` (Protects user referrer values)
*   `Strict-Transport-Security` (Enforces HTTPS connection)

## 6. Secure Supabase Client Separation
*   **`supabase.server.ts`**: Uses the client's cookie session to run database calls under the context of the logged-in user. RLS policies apply.
*   **`supabase.admin.ts`**: Server-only admin client utilizing the `SERVICE_ROLE_KEY` to bypass RLS. This file imports `"server-only";` and must **never** be referenced or loaded inside client-side components.
