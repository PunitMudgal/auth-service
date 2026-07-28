import { Config } from "../config";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

export const pool = new Pool({
  connectionString: Config.databaseUrl,
});

export const db = drizzle(pool);
