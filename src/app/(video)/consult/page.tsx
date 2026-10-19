"use client";

import { SITE_NAME } from "@/shared/config/site";
import {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import dynamic from "next/dynamic";
import {
  useRouter,
} from "next/navigation";
import { getNavContext } from "@/lib/nav-context-client";

/* -------------------------------------------------------------------------- */
/*                                   Types                                    */
/* -------------------------------------------------------------------------- */

type AppointmentVideoStatus =
  | "not_started"
  | "waiting"
  | "in_progress"
  | "ended"
  | "cancelled";

type UpdateableVideoStatus =
  | "waiting"
  | "in_progress"
  | "ended"
  | "cancelled";

type JitsiSession = {
  appointmentId: string;
  provider: "jitsi";
  domain: string;
  roomName: string;
  displayName: string;

  /*
   * Optional because your backend may not currently return email.
   * The Jitsi component will receive an empty string when it is missing.
   */
  email?: string;

  participantRole: string;
  scheduledDate: string;
  scheduledTime: string;
  videoStatus: AppointmentVideoStatus;
  jwt?: string;
};

type JitsiExternalApi = {
  addListener: (
    eventName: string,
    listener: (event?: unknown) => void,
  ) => void;

  removeListener?: (
    eventName: string,
    listener: (event?: unknown) => void,
  ) => void;

  executeCommand?: (
    command: string,
    ...args: unknown[]
  ) => void;

  dispose?: () => void;
};

/* -------------------------------------------------------------------------- */
/*                       Browser-only Jitsi component                         */
/* -------------------------------------------------------------------------- */

const JitsiMeeting = dynamic(
  () =>
    import("@jitsi/react-sdk").then(
      (module) => module.JitsiMeeting,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center bg-slate-950">
        <p className="text-sm text-white/70">
          Loading Jitsi meeting…
        </p>
      </div>
    ),
  },
);

/* -------------------------------------------------------------------------- */
/*                              Helper functions                              */
/* -------------------------------------------------------------------------- */

function isPractitionerOrAdmin(
  role: string,
): boolean {
  return [
    "doctor",
    "practitioner",
    "admin",
    "super_admin",
  ].includes(role);
}

function getErrorMessage(
  value: unknown,
  fallback: string,
): string {
  if (value instanceof Error) {
    return value.message;
  }

  return fallback;
}

/* -------------------------------------------------------------------------- */
/*                           Consultation component                           */
/* -------------------------------------------------------------------------- */

function ConsultationContent() {
  const router = useRouter();

  const [navContext, setNavContextState] = useState<{ appointmentId: string } | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    getNavContext<{ appointmentId: string }>("video").then((result) => {
      if (!cancelled) setNavContextState(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const appointmentId = navContext?.appointmentId ?? "";

  const endedRef = useRef(false);

  const apiRef = useRef<JitsiExternalApi | null>(null);

  const [session, setSession] =
    useState<JitsiSession | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [meetingReady, setMeetingReady] =
    useState(false);

  /* ------------------------------------------------------------------------ */
  /*                         Load the Jitsi session                           */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    if (navContext === undefined) {
      // Still waiting on the server-side navigation context.
      return;
    }

    if (!appointmentId) {
      setError(
        "Appointment ID is missing. Open the consultation from your appointments page.",
      );

      setLoading(false);
      return;
    }

    let cancelled = false;

    async function loadSession() {
      try {
        setLoading(true);
        setError("");

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

        const payload: unknown = await response
          .json()
          .catch(() => null);

        const responseBody = payload as {
          message?: string;
          data?: JitsiSession;
        } | null;

        if (!response.ok) {
          throw new Error(
            responseBody?.message ||
              "Unable to prepare the video consultation",
          );
        }

        const sessionData =
          responseBody?.data ??
          (payload as JitsiSession | null);

        if (
          !sessionData?.appointmentId ||
          !sessionData.domain ||
          !sessionData.roomName
        ) {
          throw new Error(
            "The Jitsi meeting information returned by the server is incomplete",
          );
        }

        if (!cancelled) {
          setSession(sessionData);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            getErrorMessage(
              loadError,
              "Unable to load the video consultation",
            ),
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadSession();

    return () => {
      cancelled = true;
    };
  }, [appointmentId, navContext]);

  /* ------------------------------------------------------------------------ */
  /*                       Update video-call status                           */
  /* ------------------------------------------------------------------------ */

  const updateVideoStatus = useCallback(
    async (
      status: UpdateableVideoStatus,
    ): Promise<void> => {
      if (!appointmentId) {
        throw new Error(
          "Appointment ID is unavailable",
        );
      }

      const response = await fetch(
        `/api/appointments?action=video-status&appointmentId=${encodeURIComponent(
          appointmentId,
        )}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          cache: "no-store",
          body: JSON.stringify({
            status,
          }),
        },
      );

      const payload: unknown = await response
        .json()
        .catch(() => null);

      const responseBody = payload as {
        message?: string;
      } | null;

      if (!response.ok) {
        throw new Error(
          responseBody?.message ||
            `Unable to update video status to ${status}`,
        );
      }
    },
    [appointmentId],
  );

  /* ------------------------------------------------------------------------ */
  /*                         Close the consultation                           */
  /* ------------------------------------------------------------------------ */

  const finishConsultation =
    useCallback(async (): Promise<void> => {
      /*
       * Jitsi can emit more than one close/leave event.
       * This prevents duplicate PATCH requests.
       */
      if (endedRef.current) {
        return;
      }

      endedRef.current = true;

      try {
        /*
         * Your service permits only the practitioner/admin
         * to mark the complete consultation as ended.
         *
         * A patient leaving only exits their own screen.
         */
        if (
          session &&
          isPractitionerOrAdmin(
            session.participantRole,
          )
        ) {
          await updateVideoStatus("ended");
        }
      } catch (statusError) {
        console.error(
          "[ConsultationPage] Unable to mark consultation as ended:",
          statusError,
        );
      } finally {
        // Practitioners return to dashboard; patients go to appointments.
        if (
          session &&
          isPractitionerOrAdmin(session.participantRole)
        ) {
          router.replace("/pro");
        } else {
          router.replace("/appointments");
        }
      }
    }, [
      router,
      session,
      updateVideoStatus,
    ]);

  /* ------------------------------------------------------------------------ */
  /*                           Jitsi event setup                              */
  /* ------------------------------------------------------------------------ */

  const handleApiReady = useCallback(
    (api: JitsiExternalApi): void => {
      apiRef.current = api;

      setMeetingReady(true);

      api.executeCommand?.(
        "subject",
        `${SITE_NAME} Video Consultation`,
      );

      api.addListener(
        "videoConferenceJoined",
        () => {
          /*
           * Only the practitioner/admin officially starts
           * the consultation in your backend.
           */
          if (
            session &&
            isPractitionerOrAdmin(
              session.participantRole,
            )
          ) {
            void updateVideoStatus(
              "in_progress",
            ).catch((statusError) => {
              console.error(
                "[ConsultationPage] Unable to mark consultation as started:",
                statusError,
              );
            });
          }
        },
      );

      api.addListener(
        "videoConferenceLeft",
        () => {
          void finishConsultation();
        },
      );

      api.addListener(
        "participantJoined",
        (event) => {
          console.log(
            "[ConsultationPage] Participant joined:",
            event,
          );
        },
      );

      api.addListener(
        "participantLeft",
        (event) => {
          console.log(
            "[ConsultationPage] Participant left:",
            event,
          );
        },
      );
    },
    [
      finishConsultation,
      session,
      updateVideoStatus,
    ],
  );

  /* ------------------------------------------------------------------------ */
  /*         Detect the other participant ending the call remotely           */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    if (!meetingReady || !appointmentId || endedRef.current) {
      return;
    }

    const intervalId = setInterval(async () => {
      if (endedRef.current) {
        return;
      }

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

        const payload: unknown = await response
          .json()
          .catch(() => null);

        const parsed = payload as {
          data?: { videoStatus?: string };
          message?: string;
        } | null;

        // A live status still comes back as data.videoStatus. But once the
        // consultation has ended/cancelled, this same endpoint stops
        // returning a session and starts erroring instead — so that error
        // is itself the remote-end signal to catch here.
        const status =
          parsed?.data?.videoStatus ??
          (!response.ok &&
          /already ended|been cancelled/i.test(parsed?.message ?? "")
            ? /cancelled/i.test(parsed?.message ?? "")
              ? "cancelled"
              : "ended"
            : undefined);

        if (
          (status === "ended" || status === "cancelled") &&
          !endedRef.current
        ) {
          apiRef.current?.executeCommand?.("hangup");
          void finishConsultation();
        }
      } catch {
        // Transient network error — try again on the next tick.
      }
    }, 5000);

    return () => clearInterval(intervalId);
  }, [meetingReady, appointmentId, finishConsultation]);

  /* ------------------------------------------------------------------------ */
  /*                              Loading state                               */
  /* ------------------------------------------------------------------------ */

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-white/20 border-t-white" />

          <p className="mt-4 text-sm text-white/70">
            Preparing video consultation…
          </p>
        </div>
      </main>
    );
  }

  /* ------------------------------------------------------------------------ */
  /*                               Error state                                */
  /* ------------------------------------------------------------------------ */

  if (error || !session) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="w-full max-w-md rounded-2xl border border-border bg-white p-6 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-xl">
            !
          </div>

          <h1 className="mt-4 text-lg font-semibold text-foreground">
            Consultation unavailable
          </h1>

          <p className="mt-2 text-sm text-red-600">
            {error ||
              "Unable to load the Jitsi meeting"}
          </p>

          <button
            type="button"
            onClick={() =>
              router.replace("/appointments")
            }
            className="mt-5 rounded-xl bg-herb-green px-5 py-2.5 font-medium text-white transition-colors hover:bg-herb-green/90"
          >
            Return to appointments
          </button>
        </div>
      </main>
    );
  }

  /* ------------------------------------------------------------------------ */
  /*                              Jitsi meeting                               */
  /* ------------------------------------------------------------------------ */

  return (
    <main className="flex h-screen flex-col overflow-hidden bg-slate-950">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-white px-4 sm:px-6">
        <button
          type="button"
          onClick={() => {
            void finishConsultation();
          }}
          aria-label="Leave consultation"
          className="rounded-full p-2 transition-colors hover:bg-muted"
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

        <div>
          <h1 className="text-sm font-semibold text-foreground">
            {SITE_NAME} Video Consultation
          </h1>

          <p className="text-[11px] text-muted-foreground">
            {meetingReady
              ? "Connected through Jitsi Meet"
              : "Connecting to Jitsi Meet…"}
          </p>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span className="hidden text-xs text-muted-foreground sm:inline">
            {session.displayName}
          </span>

          <div
            className={`h-2 w-2 rounded-full ${
              meetingReady
                ? "animate-pulse bg-green-500"
                : "animate-pulse bg-amber-500"
            }`}
          />
        </div>
      </header>

      <div className="min-h-0 flex-1">
        <JitsiMeeting
  domain={session.domain}
  roomName={session.roomName}
  jwt={session.jwt}
  userInfo={{
    displayName: session.displayName || `${SITE_NAME} User`,
    email: session.email?.trim() || "",
  }}
  configOverwrite={{
    subject: `${SITE_NAME} Video Consultation`,
    startWithAudioMuted: false,
    startWithVideoMuted: false,
    prejoinPageEnabled: false,
    enableEmailInStats: false,
    disableModeratorIndicator: false,
    enableWelcomePage: false,
  }}
  interfaceConfigOverwrite={{
    DISABLE_JOIN_LEAVE_NOTIFICATIONS: false,
    MOBILE_APP_PROMO: false,
    SHOW_JITSI_WATERMARK: false,
    SHOW_WATERMARK_FOR_GUESTS: false,
  }}
  onApiReady={(api) => {
    handleApiReady(
      api as unknown as JitsiExternalApi,
    );
  }}
  onReadyToClose={() => {
    void finishConsultation();
  }}
  getIFrameRef={(container) => {
    container.style.width = "100%";
    container.style.height = "100%";
    container.style.border = "0";
  }}
/>
      </div>
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/*                               Page export                                  */
/* -------------------------------------------------------------------------- */

export default function ConsultationPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-slate-950">
          <p className="text-sm text-white/70">
            Loading consultation…
          </p>
        </main>
      }
    >
      <ConsultationContent />
    </Suspense>
  );
}