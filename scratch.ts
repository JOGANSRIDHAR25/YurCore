import { OnboardingRepository } from "./src/backend/repo/onboarding.repo";

(async () => {
  try {
    const id = await OnboardingRepository.savePatientProfile({
      email: "test555@meyveda.in",
      fullName: "Test Patient 555",
      dateOfBirth: "1990-01-01",
      gender: "Male",
      phone: "9876543255",
    });
    console.log("Success! ID:", id);
  } catch(e) {
    console.error("FAIL:", e);
  }
})();
