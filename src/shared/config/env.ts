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

  // AI Assistant — any OpenAI-compatible chat-completions endpoint.
  // Phase 1 (free tier): primary = Google Gemini, fallback = Groq.
  // Phase 2 (paid, no-training): swap URL/key/model here; no code changes.
  AI_PRIMARY_API_URL: z.string().url().optional().default("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"),
  AI_PRIMARY_API_KEY: z.string().optional(),
  AI_PRIMARY_MODEL: z.string().optional().default("gemini-3.5-flash"),
  AI_FALLBACK_API_URL: z.string().url().optional().default("https://api.groq.com/openai/v1/chat/completions"),
  AI_FALLBACK_API_KEY: z.string().optional(),
  AI_FALLBACK_MODEL: z.string().optional().default("openai/gpt-oss-120b"),
  // Hidden "thinking" before answering. Gemini 3.x with "none" starts answering
  // ~20s sooner on the free tier. Set to "" to omit the parameter (some
  // providers/models reject it).
  AI_PRIMARY_REASONING_EFFORT: z.string().optional().default("none"),
  AI_FALLBACK_REASONING_EFFORT: z.string().optional().default(""),
});

function readServerEnvInput() {
  return {
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    JWT_SECRET: process.env.JWT_SECRET,
    FLASK_URL: process.env.FLASK_URL,
    AI_PRIMARY_API_URL: process.env.AI_PRIMARY_API_URL || undefined,
    AI_PRIMARY_API_KEY: process.env.AI_PRIMARY_API_KEY || undefined,
    AI_PRIMARY_MODEL: process.env.AI_PRIMARY_MODEL || undefined,
    AI_FALLBACK_API_URL: process.env.AI_FALLBACK_API_URL || undefined,
    AI_FALLBACK_API_KEY: process.env.AI_FALLBACK_API_KEY || undefined,
    AI_FALLBACK_MODEL: process.env.AI_FALLBACK_MODEL || undefined,
    AI_PRIMARY_REASONING_EFFORT: process.env.AI_PRIMARY_REASONING_EFFORT,
    AI_FALLBACK_REASONING_EFFORT: process.env.AI_FALLBACK_REASONING_EFFORT,
  };
}

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
  const _serverEnv = serverEnvSchema.safeParse(readServerEnvInput());

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
  const result = serverEnvSchema.safeParse(readServerEnvInput());
  
  if (!result.success) {
    console.error("❌ Invalid server environment variables during initialization:", result.error.format());
    // Don't throw here to avoid breaking client build if it accidentally imports this file
  }
  return result;
})();

export const serverEnv = parsedServerEnv.success ? parsedServerEnv.data : {} as z.infer<typeof serverEnvSchema>;
