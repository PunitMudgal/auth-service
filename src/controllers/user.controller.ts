import { Context } from "hono";
import { UserService } from "../services/user.service";
import type {
  CreateUserBody,
  UpdateUserBody,
  UserListQuery,
} from "../config/user.schema";

export class UserController {
  private userService: UserService;

  constructor(userService: UserService) {
    this.userService = userService;
  }

  async createUser(c: Context, body: CreateUserBody) {
    const caller = c.get("user");
    const user = await this.userService.createUser(body, caller);
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

  async getUsers(c: Context, query: UserListQuery) {
    const caller = c.get("user");
    const result = await this.userService.getUsers(query, caller);
    return c.json(
      {
        success: true,
        message: "Users fetched successfully",
        data: result,
        status: 200,
      },
      200,
    );
  }

  async getSelf(c: Context) {
    const caller = c.get("user");
    const user = await this.userService.getUserById(caller.sub, caller);
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

  async getUserById(c: Context, id: string) {
    const caller = c.get("user");
    const user = await this.userService.getUserById(id, caller);
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

  async updateUser(c: Context, id: string, body: UpdateUserBody) {
    const caller = c.get("user");
    const user = await this.userService.updateUser(id, body, caller);
    return c.json(
      {
        success: true,
        message: "User updated successfully",
        data: { user },
        status: 200,
      },
      200,
    );
  }

  async softDeleteUser(c: Context, id: string) {
    const caller = c.get("user");
    await this.userService.softDeleteUser(id, caller);
    return c.json(
      {
        success: true,
        message: "User deleted successfully",
        status: 200,
      },
      200,
    );
  }
}
