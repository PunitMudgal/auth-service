import { Hono } from "hono";
import { UserController } from "../controllers/user.controller";
import { UserService } from "../services/user.service";
import {
  CreateUserBody,
  UpdateUserBody,
  UserListQuery,
  createUserSchema,
  updateUserSchema,
  userListQuerySchema,
} from "../config/user.schema";
import { validateBody } from "../middleware/validate-body";
import { validateQuery } from "../middleware/validate-query";
import { canAccess } from "../middleware/can-access";
import { authenticate } from "../middleware/auth";

const userRoutes = new Hono();
const userController = new UserController(new UserService());

// Create a new user
userRoutes.post(
  "/",
  authenticate,
  canAccess("admin", "manager"),
  validateBody(createUserSchema),
  (c) => userController.createUser(c, c.req.valid("json") as CreateUserBody),
);

// get all users
userRoutes.get(
  "/",
  authenticate,
  canAccess("admin", "manager"),
  validateQuery(userListQuerySchema),
  (c) => userController.getUsers(c, c.req.valid("query") as UserListQuery),
);

// get self user
userRoutes.get("/self", authenticate, (c) => userController.getSelf(c));

// get user by email
userRoutes.get("/email/:email", authenticate, canAccess("admin"), (c) =>
  userController.getUserByEmail(c, c.req.param("email")),
);

// get user by id
userRoutes.get(
  "/:id",
  authenticate,
  canAccess("admin", { allowSelf: true }),
  (c) => userController.getUserById(c, c.req.param("id")),
);

// update user
userRoutes.patch(
  "/:id",
  authenticate,
  canAccess("admin"),
  validateBody(updateUserSchema),
  (c) =>
    userController.updateUser(
      c,
      c.req.param("id"),
      c.req.valid("json") as UpdateUserBody,
    ),
);

// soft delete user
userRoutes.delete("/:id", authenticate, canAccess("admin"), (c) =>
  userController.softDeleteUser(c, c.req.param("id")),
);

export default userRoutes;
