import { Hono } from "hono";
import { checkEmailServiceHealth } from "../services/email.service";

const healthRoutes = new Hono();

healthRoutes.get("/email", async (c) => {
  const result = await checkEmailServiceHealth();
  const status = result.status === "healthy" ? 200 : 503;

  return c.json(
    {
      success: result.status === "healthy",
      message: result.message,
      data: { service: "resend", status: result.status },
      status,
    },
    status,
  );
});

export default healthRoutes;
