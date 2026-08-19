import { Resend } from "resend";
import { Config } from "../config";
import { logger } from "../utils/logger";
import PasswordResetEmail from "../emails/password-reset";

const resend = new Resend(Config.email.resendApiKey);

/**
 * Health check for the Resend email service.
 * Verifies the API key is configured and the Resend API is reachable.
 */
export async function checkEmailServiceHealth() {
  const hasApiKey = !!Config.email.resendApiKey;

  if (!hasApiKey) {
    return {
      status: "unhealthy" as const,
      message: "RESEND_API_KEY is not configured",
    };
  }

  try {
    // Use domains.list as a lightweight probe to verify the API key is valid
    const { error } = await resend.domains.list();

    if (error) {
      logger.error({ error }, "Email service health check failed");
      return {
        status: "unhealthy" as const,
        message: error.message || "Resend API returned an error",
      };
    }

    return {
      status: "healthy" as const,
      message: "Resend email service is reachable",
    };
  } catch (error) {
    logger.error({ error }, "Email service health check failed");
    return {
      status: "unhealthy" as const,
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: SendEmailParams) {
  try {
    const { data, error } = await resend.emails.send({
      from: Config.email.fromEmail,
      to,
      subject,
      html,
    });

    if (error) {
      logger.error({ error, to, subject }, "Failed to send email");
      return { success: false, error };
    }

    logger.info({ id: data?.id, to, subject }, "Email sent successfully");
    return { success: true, id: data?.id };
  } catch (error) {
    logger.error({ error, to, subject }, "Failed to send email");
    return { success: false, error };
  }
}

interface SendReactEmailParams {
  to: string;
  subject: string;
  react: React.ReactNode;
}

async function sendReactEmail({ to, subject, react }: SendReactEmailParams) {
  try {
    const { data, error } = await resend.emails.send({
      from: Config.email.fromEmail,
      to,
      subject,
      react,
    });

    if (error) {
      logger.error({ error, to, subject }, "Failed to send email");
      return { success: false, error };
    }

    logger.info({ id: data?.id, to, subject }, "Email sent successfully");
    return { success: true, id: data?.id };
  } catch (error) {
    logger.error({ error, to, subject }, "Failed to send email");
    return { success: false, error };
  }
}

/**
 * Send a password reset email with the reset link.
 */
export async function sendPasswordResetEmail(
  to: string,
  resetToken: string,
  userName?: string,
) {
  const resetUrl = `${Config.frontendUrl}/reset-password?token=${resetToken}`;

  return sendReactEmail({
    to,
    subject: "Reset Your Password",
    react: PasswordResetEmail({ resetUrl, userName }),
  });
}
