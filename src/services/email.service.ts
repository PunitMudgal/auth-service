import { Resend } from "resend";
import { Config } from "../config";
import { logger } from "../utils/logger";

const resend = new Resend(Config.email.resendApiKey);

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

/**
 * Send a password reset email with the reset link.
 */
export async function sendPasswordResetEmail(
  to: string,
  resetToken: string,
) {
  const resetUrl = `${Config.frontendUrl}/reset-password?token=${resetToken}`;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #1a1a1a;">Reset Your Password</h2>
        <p style="color: #4a4a4a; line-height: 1.6;">
          We received a request to reset your password. Click the button below to set a new password.
        </p>
        <a href="${resetUrl}" style="display: inline-block; background-color: #0070f3; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 500; margin: 16px 0;">
          Reset Password
        </a>
        <p style="color: #4a4a4a; line-height: 1.6;">
          This link will expire in 15 minutes. If you didn't request this, you can safely ignore this email.
        </p>
      </body>
    </html>
  `;

  return sendEmail({
    to,
    subject: "Reset Your Password",
    html,
  });
}
