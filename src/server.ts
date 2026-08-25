import { Config } from "./config";
import app from "./app";
import { logger } from "./utils/logger";

export default app;

if (import.meta.main) {
  Bun.serve({
    fetch: app.fetch,
    port: Config.port,
  });
  logger.info(`Server is running on http://localhost:${Config.port}`);
}
