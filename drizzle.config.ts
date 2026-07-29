import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

const env = process.env.NODE_ENV || "development";
config({ path: `.env.${env}` });

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
