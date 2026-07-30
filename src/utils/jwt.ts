import { sign, verify, AlgorithmTypes } from "hono/jwt";
import { Config } from "../config";
import type { JWTPayload } from "../types";

export const generateAccessToken = async (
  payload: Omit<JWTPayload, "iat" | "exp">,
): Promise<string> => {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + parseDurationToSeconds(Config.jwt.accessExpiresIn);

  return await sign(
    { ...payload, iat: now, exp },
    Config.jwt.accessSecret,
    AlgorithmTypes.HS256,
  );
};

export const generateRefreshToken = async (
  payload: Omit<JWTPayload, "iat" | "exp">,
): Promise<string> => {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + parseDurationToSeconds(Config.jwt.refreshExpiresIn);

  return await sign(
    { ...payload, iat: now, exp },
    Config.jwt.refreshSecret,
    AlgorithmTypes.HS256,
  );
};

export const verifyAccessToken = async (token: string): Promise<JWTPayload> => {
  const decoded = await verify(
    token,
    Config.jwt.accessSecret,
    AlgorithmTypes.HS256,
  );
  return decoded as unknown as JWTPayload;
};

export const verifyRefreshToken = async (
  token: string,
): Promise<JWTPayload> => {
  const decoded = await verify(
    token,
    Config.jwt.refreshSecret,
    AlgorithmTypes.HS256,
  );
  return decoded as unknown as JWTPayload;
};

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
