import { users } from "./../db/schema";

export interface RegisterUser {
  email: string;
  password: string;
  firstName: string;
  lastName?: string;
}

export type UserRole = "admin" | "manager" | "staff" | "customer";

export interface CreateUser {
  email: string;
  password: string;
  firstName: string;
  lastName?: string;
  tenantId: string;
  role?: UserRole;
}

export interface LoginUser {
  email: string;
  password: string;
}

export type User = typeof users.$inferSelect;

export interface JWTPayload {
  sub: string;
  email: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}
