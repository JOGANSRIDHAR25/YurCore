import { NextRequest } from "next/server";

export function getRequestIp(req: NextRequest): string {
  const forwardedFor = req.headers.get("x-forwarded-for");

  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }

  return (
    req.headers.get("x-real-ip") ||
    req.headers.get("cf-connecting-ip") ||
    "unknown"
  );
}

export function getRequestUserAgent(req: NextRequest): string {
  return req.headers.get("user-agent") || "unknown";
}
