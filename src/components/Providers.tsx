"use client";

import { Toaster } from "react-hot-toast";
import { AuthProvider } from "@/contexts/auth-context";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      {children}
      {/* Renders every toast() call in the app (admin and portal). */}
      <Toaster position="top-right" />
    </AuthProvider>
  );
}
