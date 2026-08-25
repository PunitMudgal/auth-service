import { Hono } from "hono";
import { sql } from "drizzle-orm";
import { db } from "../db/connection";
import { checkEmailServiceHealth } from "../services/email.service";

const healthRoutes = new Hono();

type ServiceStatus = "healthy" | "unhealthy";

interface ServiceCheck {
  status: ServiceStatus;
  message: string;
  latencyMs?: number;
}

async function checkDatabaseHealth(): Promise<ServiceCheck> {
  const startedAt = Date.now();

  try {
    await db.execute(sql`select 1`);
    return {
      status: "healthy",
      message: "Database connection is healthy",
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      status: "unhealthy",
      message: error instanceof Error ? error.message : "Database connection failed",
      latencyMs: Date.now() - startedAt,
    };
  }
}

async function getServiceChecks() {
  const [database, email] = await Promise.all([
    checkDatabaseHealth(),
    checkEmailServiceHealth(),
  ]);

  return {
    application: {
      status: "healthy" as const,
      message: "Application is running",
    },
    database,
    email: {
      status: email.status,
      message: email.message,
    },
  };
}

function getOverallStatus(services: Record<string, ServiceCheck>) {
  return Object.values(services).every(
    (service) => service.status === "healthy",
  )
    ? "healthy"
    : "unhealthy";
}

healthRoutes.get("/live", (c) => {
  return c.json({
    success: true,
    message: "Application is alive",
    data: {
      service: "application",
      status: "healthy",
    },
    status: 200,
  });
});

healthRoutes.get("/ready", async (c) => {
  const services = await getServiceChecks();
  const status = getOverallStatus(services) === "healthy" ? 200 : 503;

  return c.json(
    {
      success: status === 200,
      message: status === 200 ? "All services are ready" : "A service is unavailable",
      data: { services },
      status,
    },
    status,
  );
});

healthRoutes.get("/", async (c) => {
  const services = await getServiceChecks();
  const overallStatus = getOverallStatus(services);
  const status = overallStatus === "healthy" ? 200 : 503;

  return c.json(
    {
      success: status === 200,
      message: status === 200 ? "All services are healthy" : "One or more services are unhealthy",
      data: {
        status: overallStatus,
        services,
      },
      status,
    },
    status,
  );
});

healthRoutes.get("/database", async (c) => {
  const result = await checkDatabaseHealth();
  const status = result.status === "healthy" ? 200 : 503;

  return c.json(
    {
      success: result.status === "healthy",
      message: result.message,
      data: { service: "database", ...result },
      status,
    },
    status,
  );
});

healthRoutes.get("/email", async (c) => {
  const result = await checkEmailServiceHealth();
  const status = result.status === "healthy" ? 200 : 503;

  return c.json(
    {
      success: result.status === "healthy",
      message: result.message,
      data: { service: "resend", ...result },
      status,
    },
    status,
  );
});

export default healthRoutes;
