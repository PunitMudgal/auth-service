import { db } from "../db/connection";
import { users } from "../db/schema";
import { RegisterUser, User } from "../types";
import * as bcrypt from "bcrypt";

export class AuthService { 

    async register({email, password, firstName, lastName}: RegisterUser){
        const hashedPassword = await bcrypt.hash(password, 3);
        const user = await db.insert(users).values({
            email,
            password: hashedPassword,   
            firstName,
            lastName,
        }).returning({firstName: users.firstName, lastName: users.lastName, email: users.email});
        return user;
    }
}