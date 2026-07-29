import { db } from "../db/connection";
import { users } from "../db/schema";
import { RegisterUser, User } from "../types";

export class AuthService { 

    async register({email, password, firstName, lastName}: RegisterUser){
        const user = await db.insert(users).values({
            email,
            password,   
            firstName,
            lastName,
        }).returning({firstName: users.firstName, lastName: users.lastName, email: users.email});
        return user;
    }
}