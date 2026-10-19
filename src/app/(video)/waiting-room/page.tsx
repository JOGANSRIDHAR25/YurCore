"use client";

import { SITE_NAME } from "@/shared/config/site";
import {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/auth-context";
import { getNavContext, setNavContext } from "@/lib/nav-context-client";

type DeviceCheckId =
  | "mic"
  | "cam"
  | "net"
  | "audio";

type DeviceCheckStatus =
  | "checking"
  | "ready"
  | "blocked"
  | "offline"
  | "unavailable";

type JitsiSession = {
  appointmentId: string;
  provider: "jitsi";
  domain: string;
  roomName: string;
  displayName: string;
  participantRole: string;
  scheduledDate: string;
  scheduledTime: string;
  videoStatus:
    | "not_started"
    | "waiting"
    | "in_progress"
    | "ended"
    | "cancelled";
  otherPartyName: string;
  otherPartyInitials: string;
  otherPartySpecialty?: string;
};

const CHECKS: Array<{
  id: DeviceCheckId;
  label: string;
}> = [
  {
    id: "mic",
    label: "Microphone",
  },
  {
    id: "cam",
    label: "Camera",
  },
  {
    id: "net",
    label: "Network",
  },
  {
    id: "audio",
    label: "Audio Output",
  },
];

const INITIAL_CHECKS: Record<
  DeviceCheckId,
  DeviceCheckStatus
> = {
  mic: "checking",
  cam: "checking",
  net: "checking",
  audio: "checking",
};

function getStatusText(
  status: DeviceCheckStatus,
): string {
  switch (status) {
    case "ready":
      return "Ready";

    case "blocked":
      return "Permission blocked";

    case "offline":
      return "Offline";

    case "unavailable":
      return "Unavailable";

    default:
      return "Checking";
  }
}

function getStatusDotClass(
  status: DeviceCheckStatus,
): string {
  switch (status) {
    case "ready":
      return "bg-herb-green";

    case "blocked":
    case "offline":
      return "bg-red-500";

    case "unavailable":
      return "bg-amber-500";

    default:
      return "bg-slate-400 animate-pulse";
  }
}

function WaitingRoomContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // A notification's deep link (e.g. "Patient is waiting") lands here
  // directly with ?appointmentId=..., without a prior setNavContext call —
  // so that's the fallback once nav-context comes back empty.
  const appointmentIdFromUrl = searchParams.get("appointmentId") ?? "";

  const [navContext, setLocalNavContext] = useState<{ appointmentId: string } | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    getNavContext<{ appointmentId: string }>("video").then((result) => {
      if (!cancelled) setLocalNavContext(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const appointmentId =
    navContext?.appointmentId || appointmentIdFromUrl;

  const { user } = useAuth();

  const videoRef =
    useRef<HTMLVideoElement | null>(null);

  const mediaStreamRef =
    useRef<MediaStream | null>(null);

  const fileInputRef =
    useRef<HTMLInputElement | null>(null);

  const [session, setSession] =
    useState<JitsiSession | null>(null);

  const [checks, setChecks] = useState<
    Record<DeviceCheckId, DeviceCheckStatus>
  >(INITIAL_CHECKS);

  const [secondsLeft, setSecondsLeft] =
    useState<number | null>(null);

  const [selectedFileName, setSelectedFileName] =
    useState("");

  const [loadingSession, setLoadingSession] =
    useState(true);

  const [joining, setJoining] =
    useState(false);

  const [pageError, setPageError] =
    useState("");

  // Detect whether the logged-in user is a practitioner/doctor
  const isDoctor = session
    ? ["doctor", "practitioner", "admin", "super_admin"].includes(
        session.participantRole,
      )
    : ["doctor", "practitioner", "admin", "super_admin"].includes(
        user?.role ?? "",
      );

  const displayName =
    user?.name?.trim() ||
    session?.displayName ||
    "You";

  const userInitials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();

  // Named "doctor…" for the (patient-only) UI section that displays them,
  // but resolves to whichever the *other* participant is — see
  // AppointmentsService.resolveOtherParty on the backend.
  const doctorName =
    session?.otherPartyName || "Your Practitioner";

  const doctorSpecialty =
    session?.otherPartySpecialty ||
    "Video Consultation";

  const doctorInitials =
    session?.otherPartyInitials || "DR";

  const stopMediaPreview = useCallback(() => {
    mediaStreamRef.current
      ?.getTracks()
      .forEach((track) => {
        track.stop();
      });

    mediaStreamRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const startMediaPreview =
    useCallback(async () => {
      if (
        typeof navigator === "undefined" ||
        !navigator.mediaDevices?.getUserMedia
      ) {
        setChecks((current) => ({
          ...current,
          cam: "unavailable",
          mic: "unavailable",
          audio: "unavailable",
        }));

        return;
      }

      try {
        stopMediaPreview();

        const stream =
          await navigator.mediaDevices.getUserMedia({
            video: {
              width: {
                ideal: 1280,
              },
              height: {
                ideal: 720,
              },
              facingMode: "user",
            },
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
            },
          });

        mediaStreamRef.current = stream;

        const hasCamera =
          stream.getVideoTracks().length > 0;

        const hasMicrophone =
          stream.getAudioTracks().length > 0;

        setChecks((current) => ({
          ...current,
          cam: hasCamera
            ? "ready"
            : "unavailable",
          mic: hasMicrophone
            ? "ready"
            : "unavailable",
          audio: "ready",
        }));

        if (videoRef.current) {
          videoRef.current.srcObject = stream;

          await videoRef.current
            .play()
            .catch(() => undefined);
        }
      } catch (error) {
        const browserError =
          error instanceof DOMException
            ? error
            : null;

        const permissionBlocked =
          browserError?.name ===
            "NotAllowedError" ||
          browserError?.name ===
            "PermissionDeniedError";

        setChecks((current) => ({
          ...current,
          cam: permissionBlocked
            ? "blocked"
            : "unavailable",
          mic: permissionBlocked
            ? "blocked"
            : "unavailable",
          audio: "ready",
        }));
      }
    }, [stopMediaPreview]);

  useEffect(() => {
    // Don't touch the camera/mic until we actually know this consultation
    // is joinable — e.g. not while still loading, or blocked by the join
    // window / an appointment error.
    if (loadingSession || pageError) {
      stopMediaPreview();
      return;
    }

    void startMediaPreview();

    return () => {
      stopMediaPreview();
    };
  }, [
    loadingSession,
    pageError,
    startMediaPreview,
    stopMediaPreview,
  ]);

  useEffect(() => {
    function updateNetworkStatus() {
      setChecks((current) => ({
        ...current,
        net: navigator.onLine
          ? "ready"
          : "offline",
      }));
    }

    updateNetworkStatus();

    window.addEventListener(
      "online",
      updateNetworkStatus,
    );

    window.addEventListener(
      "offline",
      updateNetworkStatus,
    );

    return () => {
      window.removeEventListener(
        "online",
        updateNetworkStatus,
      );

      window.removeEventListener(
        "offline",
        updateNetworkStatus,
      );
    };
  }, []);
useEffect(() => {
  if (navContext === undefined) {
    // Still waiting on the server-side navigation context.
    return;
  }

  if (!appointmentId) {
    setPageError(
      "Appointment ID is missing. Open the waiting room from your appointment.",
    );
    setLoadingSession(false);
    return;
  }

  let cancelled = false;

  async function prepareWaitingRoom() {
    try {
      setLoadingSession(true);
      setPageError("");

      const encodedAppointmentId =
        encodeURIComponent(appointmentId);

      const sessionResponse = await fetch(
        `/api/appointments?action=video-session&appointmentId=${encodedAppointmentId}`,
        {
          method: "POST",
          credentials: "include",
          cache: "no-store",
        },
      );

      const sessionPayload = await sessionResponse
        .json()
        .catch(() => null);

      if (!sessionResponse.ok) {
        throw new Error(
          sessionPayload?.message ||
            "Unable to prepare video consultation",
        );
      }

      const preparedSession =
        sessionPayload?.data ?? sessionPayload;

      if (
        !preparedSession?.roomName ||
        !preparedSession?.appointmentId
      ) {
        throw new Error(
          "The video room information is incomplete",
        );
      }

      if (!cancelled) {
        setSession(preparedSession as JitsiSession);
      }
    } catch (loadError) {
      if (!cancelled) {
        setPageError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load the waiting room",
        );
      }
    } finally {
      if (!cancelled) {
        setLoadingSession(false);
      }
    }
  }

  void prepareWaitingRoom();

  return () => {
    cancelled = true;
  };
}, [appointmentId, navContext]);

  // Keep videoStatus fresh so the "waiting" / "live" indicator reflects
  // whether the other participant has actually started the consultation.
  useEffect(() => {
    if (!appointmentId || !session) {
      return;
    }

    const intervalId = setInterval(async () => {
      try {
        const response = await fetch(
          `/api/appointments?action=video-session&appointmentId=${encodeURIComponent(
            appointmentId,
          )}`,
          {
            method: "POST",
            credentials: "include",
            cache: "no-store",
          },
        );

        const payload = await response.json().catch(() => null);
        const latest = payload?.data ?? payload;

        if (latest?.videoStatus) {
          setSession((current) =>
            current
              ? { ...current, videoStatus: latest.videoStatus }
              : current,
          );
        }
      } catch {
        // Transient network error — try again on the next tick.
      }
    }, 6000);

    return () => clearInterval(intervalId);
  }, [appointmentId, Boolean(session)]);

  useEffect(() => {
    if (
      !session?.scheduledDate ||
      !session.scheduledTime
    ) {
      return;
    }

    const appointmentTime = new Date(
      `${session.scheduledDate}T${session.scheduledTime}`,
    );

    function updateCountdown() {
      const millisecondsLeft =
        appointmentTime.getTime() -
        Date.now();

      setSecondsLeft(
        Math.max(
          0,
          Math.floor(
            millisecondsLeft / 1000,
          ),
        ),
      );
    }

    updateCountdown();

    const interval = window.setInterval(
      updateCountdown,
      1000,
    );

    return () => {
      window.clearInterval(interval);
    };
  }, [session]);

  const minutes =
    secondsLeft === null
      ? "--"
      : Math.floor(secondsLeft / 60)
          .toString()
          .padStart(2, "0");

  const seconds =
    secondsLeft === null
      ? "--"
      : (secondsLeft % 60)
          .toString()
          .padStart(2, "0");

  function handleFileSelected(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const selectedFile =
      event.target.files?.[0];

    setSelectedFileName(
      selectedFile?.name || "",
    );

    /*
     * Connect selectedFile to your existing
     * Supabase Storage/report upload endpoint here.
     */
  }

  async function handleJoinConsultation() {
    if (!session || joining) {
      return;
    }

    setJoining(true);
    stopMediaPreview();

    await setNavContext("video", { appointmentId: session.appointmentId });
    router.push("/consult");
  }

  if (pageError) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-white rounded-2xl border border-border p-6 text-center">
          <h1 className="text-lg font-semibold text-foreground">
            Waiting room unavailable
          </h1>

          <p className="mt-2 text-sm text-red-600">
            {pageError}
          </p>

          <button
            type="button"
            onClick={() =>
              router.push("/appointments")
            }
            className="mt-5 px-5 py-2.5 rounded-xl bg-herb-green text-white font-medium"
          >
            Return to appointments
          </button>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-background/90 backdrop-blur-xl border-b border-border px-4 sm:px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center gap-3">
          <button
            type="button"
            onClick={() =>
              router.push(isDoctor ? "/pro" : "/appointments")
            }
            aria-label={isDoctor ? "Return to dashboard" : "Return to appointments"}
            className="p-2 rounded-full hover:bg-muted transition-colors"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>

          <h1 className="font-semibold text-foreground">
            {isDoctor ? "Doctor's Waiting Room" : "Waiting Room"}
          </h1>

          <div className="ml-auto flex items-center gap-1.5 bg-herb-green/10 border border-herb-green/20 rounded-full px-3 py-1">
            <div className="w-1.5 h-1.5 rounded-full bg-herb-green animate-pulse" />

            <span className="text-xs text-herb-green font-medium">
              Jitsi Ready
            </span>
          </div>
        </div>
      </header>

      <main className="px-4 sm:px-6 lg:px-8 py-6 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6">
          <div className="space-y-5">

            {/* ── Doctor-specific banner: patient is waiting ── */}
            {isDoctor && (
              <section className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-5 flex items-center gap-5 shadow-lg">
                <div className="relative flex-shrink-0">
                  <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center">
                    <span className="text-white text-xl font-bold">{userInitials}</span>
                  </div>
                  <span className="absolute -bottom-1 -right-1 w-5 h-5 bg-green-400 border-2 border-white rounded-full animate-pulse" />
                </div>
                <div className="flex-1">
                  <p className="text-white/80 text-xs font-semibold uppercase tracking-wider mb-0.5">
                    {session?.videoStatus === "in_progress"
                      ? "Consultation in progress"
                      : `${session?.otherPartyName || "Your patient"} is Waiting`}
                  </p>
                  <h2 className="text-white text-lg font-bold">
                    {session?.scheduledDate
                      ? `${new Date(session.scheduledDate).toLocaleDateString("en-IN", { day: "numeric", month: "long" })} · ${session.scheduledTime}`
                      : "Ready to join"}
                  </h2>
                  <p className="text-white/70 text-sm mt-0.5">Check your devices and join when ready.</p>
                </div>
                <div className="flex-shrink-0 hidden sm:flex items-center gap-1.5 bg-white/20 rounded-full px-3 py-1.5">
                  <div
                    className={cn(
                      "w-2 h-2 rounded-full",
                      session?.videoStatus === "in_progress"
                        ? "bg-green-400 animate-ping"
                        : "bg-amber-300 animate-pulse",
                    )}
                  />
                  <span className="text-white text-xs font-semibold">
                    {session?.videoStatus === "in_progress" ? "Live" : "Waiting"}
                  </span>
                </div>
              </section>
            )}

            {/* ── Patient: doctor summary + countdown ── */}
            {!isDoctor && (
              <section className="bg-white rounded-2xl border border-border p-6">
                <div className="flex items-center gap-5">
                  <div className="w-16 h-16 rounded-2xl bg-herb-gradient flex items-center justify-center flex-shrink-0 shadow-md">
                    <span className="text-white text-xl font-bold font-display">
                      {doctorInitials}
                    </span>
                  </div>

                  <div className="flex-1">
                    <h2 className="font-display text-lg font-semibold text-foreground">
                      {doctorName}
                    </h2>

                    <p className="text-sm text-muted-foreground mt-0.5">
                      {doctorSpecialty}
                    </p>

                    <div className="flex items-center gap-1.5 mt-1.5">
                      <div className="w-2 h-2 rounded-full bg-herb-green animate-pulse" />

                      <span className="text-xs text-herb-green font-medium">
                        Video room prepared
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-5 bg-herb-green/5 border border-herb-green/20 rounded-xl p-5 text-center">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-1">
                    {secondsLeft === 0
                      ? "Scheduled session time"
                      : "Session begins in"}
                  </p>

                  <p className="font-display text-5xl font-bold text-herb-green tabular-nums">
                    {minutes}:{seconds}
                  </p>

                  <p className="text-xs text-muted-foreground mt-1">
                    You can join before the scheduled
                    time and wait for the practitioner.
                  </p>
                </div>
              </section>
            )}

            {/* ── Doctor: session info card ── */}
            {isDoctor && (
              <section className="bg-white rounded-2xl border border-border p-5">
                <h3 className="font-semibold text-foreground text-sm mb-3">Appointment Details</h3>
                <div className="space-y-2.5">
                  {[
                    ["Patient", displayName],
                    ["Date", session?.scheduledDate
                      ? new Date(session.scheduledDate).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })
                      : "—"],
                    ["Time", session?.scheduledTime ?? "—"],
                    ["Room", session?.roomName ?? "—"],
                  ].map(([label, value]) => (
                    <div key={label} className="flex justify-between items-center py-1.5 border-b border-border last:border-0">
                      <span className="text-xs text-muted-foreground font-medium">{label}</span>
                      <span className="text-xs font-semibold text-foreground">{value}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Camera preview — shown to both roles */}
            <section
              className="bg-clinical-dark rounded-2xl overflow-hidden relative"
              style={{
                aspectRatio: "16/9",
              }}
            >
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className={cn(
                  "absolute inset-0 w-full h-full object-cover scale-x-[-1]",
                  checks.cam !== "ready" &&
                    "opacity-0",
                )}
              />

              {checks.cam !== "ready" && (
                <div className="absolute inset-0 bg-gradient-to-br from-herb-green/20 to-clinical-dark flex items-center justify-center">
                  <div className="text-center">
                    <div className="w-16 h-16 rounded-full bg-herb-gradient flex items-center justify-center mx-auto mb-3">
                      <span className="text-white font-bold font-display">
                        {userInitials}
                      </span>
                    </div>

                    <p className="text-white text-sm font-medium">
                      Camera Preview
                    </p>

                    <p className="text-white/50 text-xs mt-0.5">
                      {checks.cam === "blocked"
                        ? "Allow camera access in your browser"
                        : checks.cam ===
                            "unavailable"
                          ? "Camera is unavailable"
                          : "Preparing camera preview"}
                    </p>
                  </div>
                </div>
              )}

              <div className="absolute bottom-3 left-3 flex items-center gap-1.5 bg-black/50 backdrop-blur-sm rounded-full px-2.5 py-1">
                <div
                  className={cn(
                    "w-1.5 h-1.5 rounded-full",
                    checks.cam === "ready"
                      ? "bg-green-400"
                      : "bg-red-400",
                  )}
                />

                <span className="text-white text-[10px] font-medium">
                  {displayName} — You
                </span>
              </div>
            </section>

            <section className="bg-white rounded-2xl border border-border p-5">
              <h3 className="font-semibold text-foreground text-sm mb-3">
                Before Your Session
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {[
                  {
                    icon: "💡",
                    text: "Ensure good lighting and keep your face visible.",
                  },
                  {
                    icon: "🔇",
                    text: "Find a quiet and private place for the consultation.",
                  },
                  {
                    icon: "🔌",
                    text: "Keep your device charged or connected to power.",
                  },
                  {
                    icon: "📋",
                    text: "Keep reports and current medicine details nearby.",
                  },
                ].map((guideline) => (
                  <div
                    key={guideline.text}
                    className="flex items-start gap-3 p-3 bg-background rounded-xl border border-border"
                  >
                    <span className="text-lg flex-shrink-0">
                      {guideline.icon}
                    </span>

                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {guideline.text}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <aside className="space-y-4">
            <section className="bg-white rounded-2xl border border-border p-5">
              <h3 className="font-semibold text-foreground text-sm mb-4">
                System Check
              </h3>

              <div className="space-y-2">
                {CHECKS.map((check) => {
                  const status =
                    checks[check.id];

                  return (
                    <div
                      key={check.id}
                      className="flex items-center justify-between gap-4 py-2 border-b border-border last:border-0"
                    >
                      <span className="text-sm text-foreground">
                        {check.label}
                      </span>

                      <div className="flex items-center gap-1.5">
                        <div
                          className={cn(
                            "w-2 h-2 rounded-full",
                            getStatusDotClass(
                              status,
                            ),
                          )}
                        />

                        <span
                          className={cn(
                            "text-xs font-medium",
                            status === "ready"
                              ? "text-herb-green"
                              : status ===
                                    "checking"
                                ? "text-muted-foreground"
                                : "text-red-600",
                          )}
                        >
                          {getStatusText(
                            status,
                          )}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {(checks.cam === "blocked" ||
                checks.mic === "blocked") && (
                <button
                  type="button"
                  onClick={() =>
                    void startMediaPreview()
                  }
                  className="mt-4 w-full py-2 rounded-xl border border-border text-sm font-medium hover:border-herb-green/40"
                >
                  Retry device access
                </button>
              )}
            </section>

            <section className="bg-white rounded-2xl border border-border p-5">
              <h3 className="font-semibold text-foreground text-sm mb-2">
                Upload Reports
              </h3>

              <p className="text-xs text-muted-foreground mb-4">
                Select reports that you want to
                share before the consultation.
              </p>

              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg"
                className="hidden"
                onChange={handleFileSelected}
              />

              <button
                type="button"
                onClick={() =>
                  fileInputRef.current?.click()
                }
                className={cn(
                  "w-full py-2.5 px-3 text-sm font-medium rounded-xl border transition-all truncate",
                  selectedFileName
                    ? "bg-herb-green/10 border-herb-green/30 text-herb-green"
                    : "border-border text-muted-foreground hover:border-herb-green/40",
                )}
              >
                {selectedFileName
                  ? `✓ ${selectedFileName}`
                  : "📎 Choose File"}
              </button>
            </section>

            <button
              type="button"
              onClick={
                handleJoinConsultation
              }
              disabled={
                loadingSession ||
                !session ||
                joining ||
                checks.net === "offline"
              }
              className={cn(
                "w-full py-4 rounded-2xl text-base font-semibold transition-all active:scale-95 shadow-md disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100",
                isDoctor
                  ? "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white"
                  : "bg-herb-green hover:bg-herb-green/90 text-white",
              )}
            >
              {loadingSession
                ? "Preparing consultation…"
                : joining
                  ? "Opening consultation…"
                  : isDoctor
                    ? "🩺 Start Consultation"
                    : "📹 Join Consultation"}
            </button>

            <p className="text-[10px] text-muted-foreground text-center">
              The call opens inside {SITE_NAME} using
              Jitsi Meet.
            </p>
          </aside>
        </div>
      </main>
    </div>
  );
}

export default function WaitingRoomPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center bg-background">
          <p className="text-sm text-muted-foreground">
            Loading waiting room…
          </p>
        </main>
      }
    >
      <WaitingRoomContent />
    </Suspense>
  );
}