import { users } from "./../db/schema";

export interface RegisterUser {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

export interface CreateUser {
  email: string;
  password: string;
  firstName: string;
  lastName?: string;
  tenantId: string;
  role?: "admin" | "manager" | "user";
}

export interface LoginUser {
  email: string;
  password: string;
}

export type User = typeof users.$inferSelect;

export interface JWTPayload {
  sub: string;
  email: string;
  role: "admin" | "manager" | "user";
  iat?: number;
  exp?: number;
}
