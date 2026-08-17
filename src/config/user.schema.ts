import { z } from "zod";

export const createUserSchema = z.object({
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
    .max(100, { message: "Last name must be at most 100 characters long" })
    .optional(),
  tenantId: z.string().trim().min(1, "Tenant ID is required"),
  role: z.enum(["admin", "manager", "staff", "customer"]).optional().default("customer"),
});

export type CreateUserBody = z.infer<typeof createUserSchema>;

export const updateUserSchema = z
  .object({
    firstName: z
      .string()
      .trim()
      .min(1, "First name is required")
      .max(100, { message: "First name must be at most 100 characters long" })
      .optional(),
    lastName: z
      .string()
      .trim()
      .max(100, { message: "Last name must be at most 100 characters long" })
      .optional(),
    email: z.string().trim().toLowerCase().email("Invalid email address").optional(),
    password: z
      .string()
      .min(6, { message: "Password must be at least 6 characters long" })
      .max(255, { message: "Password must be at most 255 characters long" })
      .optional(),
    role: z.enum(["admin", "manager", "staff", "customer"]).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: "At least one field is required for update",
  });

export type UpdateUserBody = z.infer<typeof updateUserSchema>;

export const userListQuerySchema = z.object({
  page: z.coerce.number().int().min(1, "Page must be at least 1").default(1),
  limit: z
    .coerce
    .number()
    .int()
    .min(1, "Limit must be at least 1")
    .max(100, "Limit must be at most 100")
    .default(10),
  search: z.string().trim().max(255, "Search must be at most 255 characters").optional(),
  role: z.enum(["admin", "manager", "staff", "customer"]).optional(),
  isActive: z
    .enum(["true", "false"])
    .optional()
    .transform((value) =>
      value === undefined ? undefined : value === "true",
    ),
});

export type UserListQuery = z.infer<typeof userListQuerySchema>;
