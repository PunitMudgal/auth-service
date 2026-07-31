import { sign, verify, AlgorithmTypes } from "hono/jwt";
import { Config } from "../config";
import type { JWTPayload } from "../types";

/**
 * Hash a token using SHA-256.
 * Returns a hex-encoded string — safe to store in the database.
 */
export async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                   */
/* ------------------------------------------------------------------ */

function buildPayload(
  payload: Omit<JWTPayload, "iat" | "exp">,
  expiresInSeconds: number,
) {
  const now = Math.floor(Date.now() / 1000);
  return { ...payload, iat: now, exp: now + expiresInSeconds };
}

/** Sign a JWT with the given secret and expiry duration string (e.g. "15m"). */
function signToken(
  payload: Omit<JWTPayload, "iat" | "exp">,
  secret: string,
  expiresInSeconds: number,
): Promise<string> {
  return sign(
    buildPayload(payload, expiresInSeconds),
    secret,
    AlgorithmTypes.HS256,
  );
}

/** Verify a JWT with the given secret. */
async function verifyToken(token: string, secret: string): Promise<JWTPayload> {
  const decoded = await verify(token, secret, AlgorithmTypes.HS256);
  return decoded as unknown as JWTPayload;
}

/* ------------------------------------------------------------------ */
/*  Public API (unchanged signatures)                                  */
/* ------------------------------------------------------------------ */

export const generateAccessToken = async (
  payload: Omit<JWTPayload, "iat" | "exp">,
): Promise<string> =>
  signToken(
    payload,
    Config.jwt.accessSecret,
    parseDurationToSeconds(Config.jwt.accessExpiresIn),
  );

export const generateRefreshToken = async (
  payload: Omit<JWTPayload, "iat" | "exp">,
): Promise<string> =>
  signToken(
    payload,
    Config.jwt.refreshSecret,
    parseDurationToSeconds(Config.jwt.refreshExpiresIn),
  );

export const verifyAccessToken = async (token: string): Promise<JWTPayload> =>
  verifyToken(token, Config.jwt.accessSecret);

export const verifyRefreshToken = async (token: string): Promise<JWTPayload> =>
  verifyToken(token, Config.jwt.refreshSecret);

export function parseDurationToSeconds(duration: string): number {
  const match = duration.match(/^(\d+)\s*(s|m|h|d)$/);
  if (!match) {
    return 900; // default to 15 minutes
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case "s":
      return value;
    case "m":
      return value * 60;
    case "h":
      return value * 3600;
    case "d":
      return value * 86400;
    default:
      return 900;
  }
}
