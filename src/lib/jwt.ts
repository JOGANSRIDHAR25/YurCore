import "server-only";

import { SignJWT, jwtVerify } from "jose";
import { serverEnv } from "@/shared/config/env";

const JWT_SECRET = new TextEncoder().encode(
  serverEnv.JWT_SECRET || "meyveda-secret-key-at-least-32-chars-long"
);

export type TokenPayload = {
  id: string;
  email: string;
  phone: string;
  role: string;
  name: string;
  type?: "access" | "refresh";
};

export async function signAccessToken(payload: Omit<TokenPayload, "type">): Promise<string> {
  const isDev = process.env.NODE_ENV !== "production";
  return await new SignJWT({ ...payload, type: "access" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(isDev ? "7d" : "15m")
    .sign(JWT_SECRET);
}

export async function signRefreshToken(payload: Omit<TokenPayload, "type">): Promise<string> {
  return await new SignJWT({ ...payload, type: "refresh" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d") // 7 days
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as TokenPayload;
  } catch (err) {
    // Return null if expired or invalid
    return null;
  }
}
