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

  return <>{children}</>;
}