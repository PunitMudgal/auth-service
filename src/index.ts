import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { logger as honoLogger } from "hono/logger";
import authRoutes from "./routes/auth.route";
import { logger } from "./utils/logger";
import tenantRoutes from "./routes/tenant.route";

const app = new Hono().basePath("/api/v1");

app.use("*", honoLogger());
app.get("/", (c) => {
  return c.text("Hello Hono!");
});

// routes
app.route("/auth", authRoutes);
app.route("/tenant", tenantRoutes);

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
