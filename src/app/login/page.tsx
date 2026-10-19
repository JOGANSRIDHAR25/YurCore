"use client";

import { SITE_NAME } from "@/shared/config/site";
import {
  useEffect,
  useState,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { useRouter } from "next/navigation";
import { Info } from "lucide-react"

import { useAuth } from "@/contexts/auth-context";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

type LoginRole = "doctor" | "patient";
type UserRole = "practitioner" | "patient" | "admin" | "super_admin" | "assistant";

interface LoginUserResponse {
  id: string;
  phone?: string | null;
  role?: UserRole | LoginRole;
  name?: string | null;
  email?: string | null;
  abhaLinked?: boolean;
  abha_linked?: boolean;
}

interface LoginApiResponse {
  success?: boolean;
  message?: string;
  error?: string;
  data?: {
    user?: LoginUserResponse;
  };
}

interface SendOtpApiResponse {
  success?: boolean;
  message?: string;
  error?: string;
}

const EMPTY_OTP = ["", "", "", "", "", ""];

const PANEL_INFO = {
  doctor: {
    badge: "Pro",
    badgeClass: "bg-herb-green/20 text-herb-green",
    headline: "Your Practice,\nDigitised",
    sub: "Write SOAP notes, manage prescriptions, track vitals, and serve patients across all AYUSH systems — from one EMR.",
  },
  patient: {
    badge: "Patient",
    badgeClass: "bg-copper/20 text-copper",
    headline: "Holistic Care,\nAll in One",
    sub: "Book Ayurveda, Yoga, Homeopathy, Siddha and Naturopathy consultations. Track vitals, view prescriptions and manage your ABHA health locker.",
  },
} satisfies Record<
  LoginRole,
  {
    badge: string;
    badgeClass: string;
    headline: string;
    sub: string;
  }
>;

function getAuthenticatedRole(role: LoginRole): UserRole {
  return role === "doctor" ? "practitioner" : "patient";
}

function normalizeUserRole(
  backendRole: LoginUserResponse["role"],
  selectedRole: LoginRole
): UserRole {
  if (backendRole === "practitioner" || backendRole === "doctor") {
    return "practitioner";
  }

  if (backendRole === "patient") {
    return "patient";
  }
  if (backendRole === "admin" || backendRole === "super_admin") {
    return "admin";
  }
  if (backendRole === "assistant") {
    return "assistant";
  }

  return getAuthenticatedRole(selectedRole);
}

function getDestination(role: UserRole): string {
  if (role === "admin" || role === "super_admin") {
    return "/admin/dashboard";
  }
  return role === "practitioner" || role === "assistant" ? "/pro" : "/";
}

export default function LoginPage() {
  const router = useRouter();
  const { login, user, loading: authLoading } = useAuth();

  const [role, setRole] = useState<LoginRole>("doctor");
  const [displayRole, setDisplayRole] = useState<LoginRole>("doctor");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState<string[]>([...EMPTY_OTP]);
  const [otpMode, setOtpMode] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);

  const [stats, setStats] = useState({
    practitioners: 0,
    patients: 0,
    consultations: 0,
    avgRating: "0",
    disciplinesCount: 0,
    citiesCovered: 0,
    disciplinesList: [] as string[],
  });

  useEffect(() => {
    if (countdown <= 0) {
      return;
    }

    const timer = window.setTimeout(() => {
      setCountdown((current) => Math.max(current - 1, 0));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [countdown]);

  useEffect(() => {
    let active = true;

    async function fetchStats() {
      try {
        const supabase = createClient();

        const [
          practitionerResult,
          patientResult,
          appointmentResult,
          practitionersData,
          patientsData,
        ] = await Promise.all([
          supabase.from("practitioners").select("id", { count: "exact", head: true }),
          supabase.from("patients").select("id", { count: "exact", head: true }),
          supabase.from("appointments").select("id", { count: "exact", head: true }),
          supabase.from("practitioners").select("rating_avg, disciplines"),
          supabase.from("patients").select("city"),
        ]);

        if (!active) {
          return;
        }

        let avgRating = "0";
        const uniqueDisciplines = new Set<string>();

        if (practitionersData.data) {
          let totalRating = 0;
          let ratingCount = 0;
          practitionersData.data.forEach((p) => {
            if (p.rating_avg) {
              totalRating += p.rating_avg;
              ratingCount++;
            }
            if (p.disciplines && Array.isArray(p.disciplines)) {
              p.disciplines.forEach((d) => uniqueDisciplines.add(String(d)));
            }
          });
          if (ratingCount > 0) {
            avgRating = (totalRating / ratingCount).toFixed(1);
          }
        }

        const uniqueCities = new Set<string>();
        if (patientsData.data) {
          patientsData.data.forEach((p) => {
            if (p.city) uniqueCities.add(String(p.city));
          });
        }

        const disciplinesList =
          uniqueDisciplines.size > 0
            ? Array.from(uniqueDisciplines).sort()
            : [];

        setStats({
          practitioners: practitionerResult.count ?? 0,
          patients: patientResult.count ?? 0,
          consultations: appointmentResult.count ?? 0,
          avgRating,
          disciplinesCount: uniqueDisciplines.size > 0 ? uniqueDisciplines.size : 0,
          citiesCovered: uniqueCities.size > 0 ? uniqueCities.size : 0,
          disciplinesList,
        });
      } catch (statsError) {
        console.error("Failed to load login statistics:", statsError);
      }
    }

    void fetchStats();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setDisplayRole((current) => (current === "doctor" ? "patient" : "doctor"));
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  // Redirect users who are already logged in.
  useEffect(() => {
    if (authLoading || !user) {
      return;
    }

    router.replace(getDestination(user.role));
  }, [authLoading, user, router]);

  function resetLoginForm(nextRole: LoginRole) {
    setRole(nextRole);
    setEmail("");
    setOtp([...EMPTY_OTP]);
    setOtpMode(false);
    setCountdown(0);
    setError("");
  }

  async function handleSendOtp(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      setError("Please enter your email address.");
      return;
    }

    setError("");
    setLoading(true);

    try {
      const authenticatedRole = normalizedEmail.startsWith("admin@meyveda")
        ? "super_admin"
        : getAuthenticatedRole(role);

      const response = await fetch("/api/auth/send-otp", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: normalizedEmail,
          role: authenticatedRole,
        }),
      });

      const data = (await response
        .json()
        .catch(() => null)) as SendOtpApiResponse | null;

      if (!response.ok || data?.success === false) {
        throw new Error(
          data?.message ||
          data?.error ||
          "Failed to send OTP. Please try again."
        );
      }

      setEmail(normalizedEmail);
      setOtp([...EMPTY_OTP]);
      setOtpMode(true);
      setCountdown(300);

      window.setTimeout(() => {
        document.getElementById("otp-0")?.focus();
      }, 0);
    } catch (sendOtpError) {
      console.error("Send OTP error:", sendOtpError);

      setError(
        sendOtpError instanceof Error
          ? sendOtpError.message
          : "Failed to send OTP."
      );
    } finally {
      setLoading(false);
    }
  }

  function handleOtpInput(index: number, value: string) {
    const numericValue = value.replace(/\D/g, "");

    setOtp((currentOtp) => {
      const nextOtp = [...currentOtp];
      nextOtp[index] = numericValue
        ? numericValue.slice(-1)
        : "";

      return nextOtp;
    });

    if (numericValue && index < EMPTY_OTP.length - 1) {
      document.getElementById(`otp-${index + 1}`)?.focus();
    }
  }

  function handleOtpKeyDown(
    index: number,
    e: KeyboardEvent<HTMLInputElement>
  ) {
    if (e.key === "Backspace") {
      e.preventDefault();

      setOtp((currentOtp) => {
        const nextOtp = [...currentOtp];

        if (nextOtp[index]) {
          nextOtp[index] = "";
          return nextOtp;
        }

        if (index > 0) {
          nextOtp[index - 1] = "";

          window.setTimeout(() => {
            document.getElementById(`otp-${index - 1}`)?.focus();
          }, 0);
        }

        return nextOtp;
      });

      return;
    }

    if (e.key === "ArrowLeft" && index > 0) {
      document.getElementById(`otp-${index - 1}`)?.focus();
    }

    if (
      e.key === "ArrowRight" &&
      index < EMPTY_OTP.length - 1
    ) {
      document.getElementById(`otp-${index + 1}`)?.focus();
    }
  }

  function handleOtpPaste(e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();

    const pastedValue = e.clipboardData
      .getData("text")
      .trim();

    if (!/^\d{6}$/.test(pastedValue)) {
      setError("Please paste a valid 6-digit OTP.");
      return;
    }

    setError("");
    setOtp(pastedValue.split(""));

    window.setTimeout(() => {
      document.getElementById("otp-5")?.focus();
    }, 0);
  }

  async function handleVerifyOtp(
    e: FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();

    const otpString = otp.join("");
    const normalizedEmail = email.trim().toLowerCase();

    if (!/^\d{6}$/.test(otpString)) {
      setError("Please enter the complete 6-digit OTP.");
      return;
    }

    if (countdown <= 0) {
      setError("OTP has expired. Please request a new OTP.");
      return;
    }

    setError("");
    setLoading(true);

    try {
      const selectedUserRole = normalizedEmail.startsWith("admin@meyveda")
        ? "super_admin"
        : getAuthenticatedRole(role);

      const response = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: normalizedEmail,
          otp: otpString,
          role: selectedUserRole,
        }),
      });

      const data = (await response
        .json()
        .catch(() => null)) as LoginApiResponse | null;

      if (!response.ok || data?.success === false) {
        throw new Error(
          data?.message ||
          data?.error ||
          "Failed to verify OTP."
        );
      }

      const dbUser = data?.data?.user;

      if (!dbUser?.id) {
        throw new Error(
          "User Not Found! Create the account by clicking on create account button"
        );
      }

      const authenticatedRole = normalizeUserRole(
        dbUser.role,
        role
      );

      login({
        id: dbUser.id,
        phone: dbUser.phone ?? "",
        role: authenticatedRole,
        name: dbUser.name?.trim() || "Verified User",
        abhaLinked:
          dbUser.abhaLinked ??
          dbUser.abha_linked ??
          false,
        email: dbUser.email ?? normalizedEmail,
      });

      const destination = getDestination(authenticatedRole);

      /*
       * A full navigation is intentional here.
       *
       * The login API creates HttpOnly authentication cookies.
       * window.location.replace forces the next protected page and
       * middleware to read the newly created cookies immediately.
       *
       * It also prevents the browser Back button from returning to
       * the OTP page after login.
       */
      window.location.replace(destination);
    } catch (verifyOtpError) {
      console.error("Verify OTP error:", verifyOtpError);

      setError(
        verifyOtpError instanceof Error
          ? verifyOtpError.message
          : "Failed to verify OTP."
      );

      setLoading(false);
    }
  }

  const getStats = (r: LoginRole) =>
    r === "doctor"
      ? [
        {
          label: "AYUSH Practitioners",
          value: String(stats.practitioners),
        },
        {
          label: "Consultations",
          value: String(stats.consultations),
        },
        {
          label: "Avg Rating",
          value: `${stats.avgRating} ★`,
        },
        {
          label: "Patient Records",
          value: String(stats.patients),
        },
      ]
      : [
        {
          label: "Doctors on Platform",
          value: String(stats.practitioners),
        },
        {
          label: "AYUSH Disciplines",
          value: String(stats.disciplinesCount),
        },
        {
          label: "Cities Covered",
          value: String(stats.citiesCovered),
        },
        {
          label: "Active Patients",
          value: String(stats.patients),
        },
      ];

  return (
    <div className="flex min-h-screen">
      {/* Left brand panel */}
      <div className="hidden flex-col justify-between bg-clinical-dark p-12 transition-all duration-300 lg:flex lg:w-1/2">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-herb-green">
              <span className="text-sm font-bold text-white">
                M
              </span>
            </div>

            <span className="text-lg font-semibold tracking-tight text-white">
              {SITE_NAME}
            </span>

            <div className="grid">
              {(["doctor", "patient"] as const).map((r) => (
                <span
                  key={r}
                  className={cn(
                    "col-start-1 row-start-1 rounded-full px-2 py-0.5 text-xs font-semibold transition-all duration-700 ease-in-out",
                    PANEL_INFO[r].badgeClass,
                    displayRole === r
                      ? "opacity-100 translate-y-0"
                      : "opacity-0 translate-y-2 pointer-events-none"
                  )}
                >
                  {PANEL_INFO[r].badge}
                </span>
              ))}
            </div>
          </div>

          <div className="grid mt-16">
            {(["doctor", "patient"] as const).map((r) => (
              <div
                key={r}
                className={cn(
                  "col-start-1 row-start-1 transition-all duration-1000 ease-in-out",
                  displayRole === r
                    ? "opacity-100 translate-y-0"
                    : "opacity-0 translate-y-4 pointer-events-none"
                )}
              >
                <h1 className="whitespace-pre-line font-display text-4xl font-bold leading-tight text-white">
                  {PANEL_INFO[r].headline}
                </h1>

                <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/50">
                  {PANEL_INFO[r].sub}
                </p>

                <div className="mt-10 grid grid-cols-2 gap-4">
                  {getStats(r).map((stat) => (
                    <div
                      key={stat.label}
                      className="rounded-2xl bg-white/5 p-4"
                    >
                      <p className="font-display text-xl font-bold text-white">
                        {stat.value}
                      </p>

                      <p className="mt-0.5 text-xs text-white/40">
                        {stat.label}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-10 flex flex-wrap items-center gap-3">
            {stats.disciplinesList.map((discipline) => (
              <span
                key={discipline}
                className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-medium text-white/30"
              >
                {discipline}
              </span>
            ))}
          </div>
        </div>

        <p className="text-xs text-white/20">
          ©️ 2026 {SITE_NAME} · Trivine Tech Solutions
        </p>
      </div>

      {/* Right login panel */}
      <div className="flex flex-1 items-center justify-center bg-background p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-herb-green">
              <span className="text-sm font-bold text-white">
                M
              </span>
            </div>

            <span className="font-semibold text-foreground">
              {SITE_NAME}
            </span>
          </div>

          <h2 className="font-display text-2xl font-bold text-foreground">
            Sign In
          </h2>

          <p className="mt-1 text-sm text-muted-foreground">
            Access your {SITE_NAME} account
          </p>

          <form
            onSubmit={
              otpMode ? handleVerifyOtp : handleSendOtp
            }
            className="mt-8 space-y-4"
          >
            {!otpMode ? (
              <div>
                <label
                  htmlFor="email"
                  className="mb-1.5 block text-xs font-semibold text-foreground"
                >
                  Email Address
                </label>

                <input
                  id="email"
                  type="email"
                  value={email}
                  disabled={loading}
                  autoComplete="email"
                  onChange={(e) =>
                    setEmail(e.target.value)
                  }
                  placeholder="Email"
                  required
                  className="w-full rounded-xl border border-border bg-white px-3.5 py-2.5 text-sm transition-all placeholder:text-muted-foreground focus:border-herb-green/50 focus:outline-none focus:ring-2 focus:ring-herb-green/20 disabled:cursor-not-allowed disabled:opacity-60"
                />
              </div>
            ) : (
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <label className="text-xs font-semibold text-foreground">
                    Enter 6-digit OTP
                  </label>

                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => {
                      setOtpMode(false);
                      setOtp([...EMPTY_OTP]);
                      setCountdown(0);
                      setError("");
                    }}
                    className="text-[11px] text-herb-green hover:underline disabled:opacity-60"
                  >
                    Change email
                  </button>
                </div>

                <div className="mb-1 flex justify-center gap-2.5">
                  {otp.map((digit, index) => (
                    <input
                      key={index}
                      id={`otp-${index}`}
                      type="text"
                      inputMode="numeric"
                      autoComplete={
                        index === 0
                          ? "one-time-code"
                          : "off"
                      }
                      maxLength={1}
                      value={digit}
                      disabled={loading}
                      aria-label={`OTP digit ${index + 1}`}
                      onChange={(e) =>
                        handleOtpInput(
                          index,
                          e.target.value
                        )
                      }
                      onKeyDown={(e) =>
                        handleOtpKeyDown(index, e)
                      }
                      onPaste={handleOtpPaste}
                      className={cn(
                        "h-14 w-11 rounded-2xl border bg-background text-center font-mono text-xl font-bold shadow-sm transition-all duration-200 focus:scale-105 focus:outline-none focus:ring-4 focus:ring-herb-green/15 disabled:cursor-not-allowed disabled:opacity-60",
                        digit
                          ? "border-2 border-herb-green bg-herb-green/5"
                          : "border-border hover:border-muted-foreground/30 focus:border-herb-green"
                      )}
                    />
                  ))}
                </div>

                <div className="mt-2 flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">
                    {countdown > 0
                      ? `Expires in ${Math.floor(
                        countdown / 60
                      )}:${String(
                        countdown % 60
                      ).padStart(2, "0")}`
                      : "OTP Expired"}
                  </span>

                  {countdown === 0 && (
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => {
                        const formEvent = {
                          preventDefault: () => undefined,
                        } as FormEvent<HTMLFormElement>;

                        void handleSendOtp(formEvent);
                      }}
                      className="text-[11px] font-medium text-herb-green hover:underline disabled:opacity-60"
                    >
                      Resend OTP
                    </button>
                  )}
                </div>
                <div className="mt-2 space-y-1 text-left">
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
    <Info className="h-3.5 w-3.5 shrink-0 text-muted-foreground/80" />
    <span>
      Check your <strong className="font-medium text-foreground">inbox</strong> or <strong className="font-medium text-foreground">spam folder</strong> if you don't see the OTP within 5 minutes.
    </span>
  </div>
              </div>
              </div>
            )}

            {error && (
              <div
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700"
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={
                loading ||
                (otpMode &&
                  otp.join("").length !== 6)
              }
              className="mt-2 w-full rounded-xl bg-herb-green py-3 font-semibold text-white transition-all hover:bg-herb-green/90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading
                ? "Processing…"
                : otpMode
                  ? "Verify & Sign In"
                  : "Send OTP"}
            </button>
          </form>

          <div className="mt-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">
              or
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <button
            type="button"
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-border py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <rect
                x="5"
                y="2"
                width="14"
                height="20"
                rx="2"
                ry="2"
              />
              <line
                x1="12"
                y1="18"
                x2="12.01"
                y2="18"
              />
            </svg>

            Continue with OTP on Mobile
          </button>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            New to {SITE_NAME}?{" "}
            <a
              href="/onboarding"
              className="font-semibold text-herb-green hover:underline"
            >
              Create account
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}