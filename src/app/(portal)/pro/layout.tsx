import { redirect } from "next/navigation";
import { getAuthUserFromCookies } from "@/shared/auth/get-auth-user-server";
import { AssistantRepository } from "@/backend/repo/assistant.repo";
import { AssistantGate } from "./_components/AssistantGate";

export default async function ProLayout({ children }: { children: React.ReactNode }) {
  let authUser;
  try {
    authUser = await getAuthUserFromCookies();
  } catch {
    return <>{children}</>;
  }

  if (authUser.role !== "assistant") {
    return <>{children}</>;
  }

  const assistant = await AssistantRepository.getAssistantByUserId(authUser.id);

  if (!assistant || assistant.status !== "approved") {
    const doctorName = assistant?.practitionerId
      ? await AssistantRepository.getLinkedDoctorName(assistant.practitionerId)
      : null;

    return (
      <AssistantGate
        initialStatus={assistant?.status ?? "pending"}
        initialDoctorName={doctorName}
        initialRejectionReason={assistant?.rejectionReason ?? null}
      />
    );
  }

  // Approved, but the profile is not filled in yet: send them to complete it before using the dashboard. This runs
  // on the first render after approval (the gate refreshes) and on every later visit until the profile is saved.
  if (!(await AssistantRepository.isProfileComplete(authUser.id))) {
    redirect("/profile/create-profile");
  }

  return <>{children}</>;
}