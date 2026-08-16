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

userRoutes.post(
  "/",
  authenticate,
  canAccess("admin"),
  validateBody(createUserSchema),
  (c) => userController.createUser(c, c.req.valid("json") as CreateUserBody),
);

userRoutes.get(
  "/",
  authenticate,
  canAccess("admin"),
  validateQuery(userListQuerySchema),
  (c) => userController.getUsers(c, c.req.valid("query") as UserListQuery),
);

userRoutes.get("/self", authenticate, (c) => userController.getSelf(c));

userRoutes.get("/email/:email", authenticate, canAccess("admin"), (c) =>
  userController.getUserByEmail(c, c.req.param("email")),
);

userRoutes.get(
  "/:id",
  authenticate,
  canAccess("admin", { allowSelf: true }),
  (c) => userController.getUserById(c, c.req.param("id")),
);

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

userRoutes.delete("/:id", authenticate, canAccess("admin"), (c) =>
  userController.softDeleteUser(c, c.req.param("id")),
);

export default userRoutes;
