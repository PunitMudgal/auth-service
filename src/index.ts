import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { logger as honoLogger } from "hono/logger";
import { Config } from "./config";
import authRoutes from "./routes/auth.route";
import tenantRoutes from "./routes/tenant.route";
import userRoutes from "./routes/user.route";
import { logger } from "./utils/logger";

const app = new Hono().basePath("/api/v1");

app.use("*", honoLogger());
app.use(
  "*",
  cors({
    origin: "http://localhost:3000",
    credentials: true,
  }),
);
app.get("/", (c) => {
  return c.text("Welcome to the Auth Service API", { status: 200 });
});

// routes
app.route("/auth", authRoutes);
app.route("/tenant", tenantRoutes);
app.route("/users", userRoutes);

// global error handler
app.onError((err, c) => {
  if (err instanceof HTTPException) {
    logger.warn({ err, path: c.req.path }, err.message);
    return c.json(
      {
        success: false,
        message: err.message,
        status: err.status,
      },
      err.status,
    );
  }

  logger.error({ err, path: c.req.path }, "Unhandled error");
  return c.json(
    {
      success: false,
      message:
        process.env.NODE_ENV === "production"
          ? "Internal Server Error"
          : err.message || "Internal Server Error",
      status: 500,
    },
    500,
  );
});

export default app;

if (import.meta.main) {
  Bun.serve({
    fetch: app.fetch,
    port: Config.port,
  });
  logger.info(`Server is running on http://localhost:${Config.port}`);
}
