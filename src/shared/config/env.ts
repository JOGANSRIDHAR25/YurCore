/**
 * Centralized environment variable access.
 * All env var reads go through this module — never use process.env directly elsewhere.
 *
 * Public vars (NEXT_PUBLIC_*) are safe in client components.
 * Server vars are only accessible in server components, API routes, and middleware.
 */

import { z } from "zod";

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url("Must be a valid URL"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, "Missing Anon Key"),
});

const serverEnvSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  JWT_SECRET: z.string().min(32, "JWT secret must be at least 32 characters long").optional().default("default_secret_for_development_purposes_only"),
  FLASK_URL: z.string().url().optional().default("http://127.0.0.1:5001"),
});

// For public env
const _env = envSchema.safeParse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
});

if (!_env.success) {
  console.error("❌ Invalid public environment variables:", _env.error.format());
  throw new Error("Invalid public environment variables");
}

export const env = {
  SUPABASE_URL: _env.data.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_ANON_KEY: _env.data.NEXT_PUBLIC_SUPABASE_ANON_KEY,
} as const;


// Validation helper (call at server startup or in API routes)
export function validateServerEnv(): void {
  const _serverEnv = serverEnvSchema.safeParse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    JWT_SECRET: process.env.JWT_SECRET,
    FLASK_URL: process.env.FLASK_URL,
  });

  if (!_serverEnv.success) {
    console.error("❌ Invalid server environment variables:", _serverEnv.error.format());
    throw new Error("Invalid server environment variables");
  }

  // Extend the global serverEnv object
  Object.assign(serverEnv, _serverEnv.data);
}

// Export a placeholder that gets filled upon validation, or parsed directly if running on the server
const parsedServerEnv = (() => {
  if (typeof window !== "undefined") {
    return { success: true, data: {} as z.infer<typeof serverEnvSchema> };
  }
  const result = serverEnvSchema.safeParse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    JWT_SECRET: process.env.JWT_SECRET,
    FLASK_URL: process.env.FLASK_URL,
  });
  
  if (!result.success) {
    console.error("❌ Invalid server environment variables during initialization:", result.error.format());
    // Don't throw here to avoid breaking client build if it accidentally imports this file
  }
  return result;
})();

export const serverEnv = parsedServerEnv.success ? parsedServerEnv.data : {} as z.infer<typeof serverEnvSchema>;
