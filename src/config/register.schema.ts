import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email("Invalid email address"),
  password: z
    .string()
    .min(6, { message: "Password must be at least 6 characters long" })
    .max(255, { message: "Password must be at most 255 characters long" }),
  firstName: z
    .string()
    .trim()
    .min(1, "First name is required")
    .max(100, { message: "First name must be at most 100 characters long" }),
  lastName: z
    .string()
    .trim()
    .max(100, { message: "Last name must be at most 100 characters long" }),
  tenantId: z.string().trim().min(1, "Tenant ID is required"),
});

export type RegisterBody = z.infer<typeof registerSchema>;
