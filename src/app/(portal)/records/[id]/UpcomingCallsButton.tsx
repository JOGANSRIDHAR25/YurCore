"use client";

import { useRouter } from "next/navigation";
import { Calendar } from "lucide-react";
import { setNavContext } from "@/lib/nav-context-client";

export function UpcomingCallsButton({ practitionerId }: { practitionerId: string }) {
  const router = useRouter();

  return (
    <button
      onClick={async () => {
        await setNavContext("doctor", { doctorId: practitionerId });
        router.push("/doctor");
      }}
      className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl shadow-sm shadow-indigo-600/20 transition-all"
    >
      <Calendar className="w-4 h-4" />
      Upcoming Calls
    </button>
  );
}
