import { config } from "dotenv";
import { resolve } from "path";

const env = process.env.NODE_ENV || "development";

config({
  path: resolve(__dirname, `../../.env.${env}`),
  override: true,
});

const {
  PORT,
  DATABASE_URL,
  JWT_ACCESS_SECRET,
  JWT_REFRESH_SECRET,
  JWT_ACCESS_EXPIRES_IN,
  JWT_REFRESH_EXPIRES_IN,
  JWT_BCRYPT_COST,
} = process.env;

function parseInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const Config = {
  port: PORT || 3000,
  databaseUrl: DATABASE_URL,
  jwt: {
    accessSecret: JWT_ACCESS_SECRET!,
    refreshSecret: JWT_REFRESH_SECRET!,
    accessExpiresIn: JWT_ACCESS_EXPIRES_IN || "15m",
    refreshExpiresIn: JWT_REFRESH_EXPIRES_IN || "30d",
  },
  auth: {
    bcryptCost: parseInteger(JWT_BCRYPT_COST, 12),
  },
};
