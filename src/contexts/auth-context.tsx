"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

export type UserRole = "patient" | "practitioner" | "admin" | "super_admin" | "assistant";

export interface AuthUser {
  id?: string;
  practitionerId?: string;
  phone: string;
  role: UserRole;
  name: string;
  abhaLinked: boolean;
  email?: string;
  dob?: string;
  gender?: string;
  bloodGroup?: string;
  emergencyContact?: { name: string; phone: string; relation: string };
  assistantStatus?: "pending" | "approved" | "rejected" | "suspended";
  linkedDoctorName?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (user: AuthUser) => void;
  logout: () => void;
  updateUser: (partial: Partial<AuthUser>) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Cookies are now handled by the backend HttpOnly cookies automatically.

const STORAGE_KEY = "mv_user";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setUser(JSON.parse(stored));
    } catch {
      // ignore corrupt storage
    }
    setLoading(false);
  }, []);

  const login = useCallback((userData: AuthUser) => {
    setUser(userData);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(userData));
  }, []);

  const logout = useCallback(async () => {
    setUser(null);
    localStorage.removeItem(STORAGE_KEY);
    // Call backend to clear HttpOnly cookies
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }, [router]);

  const updateUser = useCallback((partial: Partial<AuthUser>) => {
    setUser((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, ...partial };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  useEffect(() => {
    if (user && user.id) {
      // Create a flag to track if we've already synced to avoid infinite loops when updateUser is called
      const hasSyncedKey = `synced_${user.id}`;
      if (sessionStorage.getItem(hasSyncedKey)) return;

      (async () => {
        try {
          const res = await fetch("/api/auth/me");
          if (res.ok) {
            const data = await res.json();
            if (data.data?.user) {
              updateUser(data.data.user);
              sessionStorage.setItem(hasSyncedKey, "true");
            }
          }
        } catch (err) {
          console.error("Failed to fetch user profile", err);
        }
      })();
    }
  }, [user?.id, updateUser]);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}