export const SECURITY_CONFIG = {
  // Authentication Settings
  jwt: {
    expiresIn: "24h",
    refreshExpiresIn: "7d",
    algorithm: "HS256" as const,
  },
  
  // Rate Limiting (values can be parsed by upstash/ratelimit or custom implementations)
  rateLimit: {
    public: { tokens: 60, window: "1 m" },
    authenticated: { tokens: 200, window: "1 m" },
    login: { tokens: 5, window: "5 m" }, // Stricter for auth endpoints
  },

  // Password Policy
  password: {
    minLength: 8,
    requireUppercase: true,
    requireNumbers: true,
    requireSpecialChars: true,
  },
  
  // CORS Configuration
  cors: {
    allowedOrigins: [
      process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
    ],
    allowedMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    credentials: true,
  },
  
  // Session Configuration
  session: {
    cookieName: "meyveda_session",
    maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
  }
} as const;
