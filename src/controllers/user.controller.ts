import { Context } from "hono";
import { UserService } from "../services/user.service";
import type { CreateUserBody } from "../config/user.schema";

export class UserController {
  private userService: UserService;

  constructor(userService: UserService) {
    this.userService = userService;
  }

  async createUser(c: Context, body: CreateUserBody) {
    const user = await this.userService.createUser(body);
    return c.json(
      {
        success: true,
        message: "User created successfully",
        data: { user },
        status: 201,
      },
      201,
    );
  }

  async getUsers(c: Context) {
    const users = await this.userService.getUsers();
    return c.json(
      {
        success: true,
        message: "Users fetched successfully",
        data: users,
        status: 200,
      },
      200,
    );
  }

  async getUserById(c: Context, id: string) {
    const user = await this.userService.getUserById(id);
    return c.json(
      {
        success: true,
        message: "User fetched successfully",
        data: user,
        status: 200,
      },
      200,
    );
  }

  async getUserByEmail(c: Context, email: string) {
    const user = await this.userService.getUserByEmail(email);
    return c.json(
      {
        success: true,
        message: "User fetched successfully",
        data: user,
        status: 200,
      },
      200,
    );
  }
}
