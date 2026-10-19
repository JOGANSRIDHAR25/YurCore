import { Suspense } from "react";
import PatientIntakeClient from "./client";

export default function PatientIntakePage() {
  return (
    <Suspense fallback={null}>
      <PatientIntakeClient />
    </Suspense>
  );
}