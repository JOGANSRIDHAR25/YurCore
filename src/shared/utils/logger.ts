export const logger = {
  info: (message: string, ...meta: unknown[]) => {
    if (process.env.NODE_ENV !== "production") {
      console.log(`[INFO] ${message}`, ...meta);
    }
  },
  error: (message: string, error?: unknown, ...meta: unknown[]) => {
    console.error(`[ERROR] ${message}`, error, ...meta);
  },
  warn: (message: string, ...meta: unknown[]) => {
    console.warn(`[WARN] ${message}`, ...meta);
  }
};
