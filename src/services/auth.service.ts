import { eq } from "drizzle-orm";
import { db } from "../db/connection";
import { users } from "../db/schema";
import { RegisterUser, User } from "../types";
import * as bcrypt from "bcrypt";
import { ConflictError } from "../utils/errors";

export class AuthService {
  async register({ email, password, firstName, lastName }: RegisterUser) {
    const existingUser = await db
      .select()
      .from(users)
      .where(eq(users.email, email));
    if (existingUser.length > 0) {
      throw new ConflictError("User already exists!");
    }
    const hashedPassword = await bcrypt.hash(password, 3);
    const user = await db
      .insert(users)
      .values({
        email,
        password: hashedPassword,
        firstName,
        lastName,
      })
      .returning({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        role: users.role,
      });
    return user;
  }
}
