import { users } from "./../db/schema";
import { Context } from "hono";

export interface RegisterUser {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

export type User = typeof users.$inferSelect;
