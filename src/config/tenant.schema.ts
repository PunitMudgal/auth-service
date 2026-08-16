import { z } from "zod";

export const tenantSchema = z.object({
    name: z.string().trim().min(1, "Name is required"),
    location: z.string().trim().min(1, "Location is required"),
    description: z.string().trim().optional()
});

export type TenantBody = z.infer<typeof tenantSchema>;
