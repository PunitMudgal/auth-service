import { config } from "dotenv";
import { resolve } from "path";

const env = process.env.NODE_ENV || "development";

config({
  path: resolve(__dirname, `../../.env.${env}`),
  override: true,
});

const { PORT, DATABASE_URL } = process.env;

export const Config = {
  port: PORT || 3000,
  databaseUrl: DATABASE_URL,
};
