# Auth Service

A multi-tenant authentication and user management API built with [Bun](https://bun.sh), [Hono](https://hono.dev), and [Drizzle ORM](https://orm.drizzle.team). It provides JWT-based authentication with rotating refresh tokens, role-based access control, and full CRUD for tenants and users.

## Features

- **JWT authentication** — short-lived access tokens (15 min by default) with long-lived refresh tokens (30 days by default)
- **Refresh token rotation** — every refresh invalidates the previous token; reuse of a revoked token revokes all of the user's sessions (reuse detection)
- **Password reset** — time-limited reset tokens stored as SHA-256 hashes; resetting the password revokes every active session
- **Secure cookie storage** — tokens are delivered as `HttpOnly` cookies with `SameSite=Strict`, marked `Secure` in production
- **Multi-tenancy** — users are scoped to tenants, with admin-managed tenant CRUD
- **Role-based access control** — `admin`, `manager`, `staff`, and `customer` roles enforced through reusable middleware
- **Zod validation** — request bodies validated and typed end-to-end before reaching controllers
- **bcrypt password hashing** — configurable cost factor (12 by default)
- **Structured logging** — [pino](https://github.com/pinojs/pino) with pretty output in development
- **Docker support** — optimized multi-stage Dockerfiles for development and production
- **Tested** — integration tests with `bun:test` covering every endpoint

## Getting started

### Prerequisites

- [Bun](https://bun.sh/docs/installation) 1.x
- A PostgreSQL database

### Installation

```sh
bun install
```

### Configuration

Environment variables are loaded from `.env.development`, `.env.test`, or `.env.production` depending on `NODE_ENV` (see `src/config/index.ts`).

| Variable | Description | Default |
| --- | --- | --- |
| `PORT` | Server port | `3000` |
| `DATABASE_URL` | PostgreSQL connection string | — |
| `JWT_ACCESS_SECRET` | Secret used to sign access tokens | — |
| `JWT_REFRESH_SECRET` | Secret used to sign refresh tokens | — |
| `JWT_ACCESS_EXPIRES_IN` | Access token lifetime (e.g. `15m`, `1h`) | `15m` |
| `JWT_REFRESH_EXPIRES_IN` | Refresh token lifetime (e.g. `30d`) | `30d` |
| `JWT_BCRYPT_COST` | bcrypt cost factor for password hashing | `12` |

> [!IMPORTANT]
> `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` are required — the server will fail to start without them. Use long, randomly generated values and keep them out of version control.

### Database

Drizzle migrations live in the `drizzle/` folder. Run them against your database:

```sh
bun run generate   # generate a new migration from schema changes
bun run migrate    # apply pending migrations
bun run studio     # open Drizzle Studio to browse/edit data
```

### Run the server

```sh
bun run dev
```

The server starts at http://localhost:3000. Run `bun run build` followed by `bun run start` for production.

### Scripts

| Script | Description |
| --- | --- |
| `bun run dev` | Start the dev server with hot reload |
| `bun run start` | Start the server in production mode |
| `bun run build` | Bundle the app into `dist/` |
| `bun test` | Run the test suite |
| `bun run typecheck` | Type-check the project with `tsc --noEmit` |
| `bun run generate` / `migrate` / `push` / `studio` | Drizzle Kit database workflows |

## API

All routes are prefixed with `/api/v1`. Responses follow a consistent envelope: `{ success, message, data, status }`.

### Auth

| Method | Route | Description | Access |
| --- | --- | --- | --- |
| POST | `/auth/register` | Register a new user | Public |
| POST | `/auth/login` | Log in and receive tokens as cookies | Public |
| POST | `/auth/refresh` | Rotate the refresh token and issue a new access token | Refresh cookie |
| POST | `/auth/logout` | Revoke the refresh token and clear cookies | Refresh cookie |
| POST | `/auth/forgot-password` | Issue a time-limited password reset token | Public |
| POST | `/auth/reset-password` | Set a new password, mark the token used, and revoke all sessions | Reset token |

### Tenants

| Method | Route | Description | Access |
| --- | --- | --- | --- |
| POST | `/tenant` | Create a tenant | `admin` |
| GET | `/tenant` | List all tenants | `admin` |
| GET | `/tenant/:id` | Get a tenant by id | `admin` |
| PUT | `/tenant/:id` | Update a tenant | `admin` |
| DELETE | `/tenant/:id` | Delete a tenant | `admin` |

### Users

| Method | Route | Description | Access |
| --- | --- | --- | --- |
| POST | `/user` | Create a user (optionally scoped to a tenant) | `admin` |
| GET | `/user` | List all users | `admin` |
| GET | `/user/self` | Get the currently authenticated user | Any authenticated user |
| GET | `/user/:id` | Get a user by id | `admin` or the user themselves |
| GET | `/user/email/:email` | Get a user by email | `admin` |

### Authentication

Authenticated requests can present the access token either as the `access_token` cookie or as a `Bearer` token in the `Authorization` header. The `authenticate` middleware validates the token and attaches the user payload (`sub`, `email`, `role`) to the context; the `canAccess` middleware then enforces role requirements.

```sh
curl http://localhost:3000/api/v1/user/self \
  -H "Authorization: Bearer <access_token>"
```

> [!NOTE]
> The refresh token is bound to the `/api/v1/auth` path, so it is only sent to auth endpoints. Refresh tokens are stored in the database as SHA-256 hashes — never as plain text — along with device metadata (IP address and user agent). Expired and revoked tokens are cleaned up automatically after logout and refresh.

> [!NOTE]
> `POST /auth/forgot-password` returns the reset token in the response body as a stand-in for email delivery. In production, replace that with sending the token to the user's inbox and never return it in the response. Reset tokens are single-use, expire after 15 minutes, and are stored as SHA-256 hashes.

## Security

- Passwords are hashed with bcrypt (cost 12) and never returned by the API.
- Access and refresh tokens are signed with separate secrets and short/long lifetimes respectively.
- Refresh token rotation detects reuse: presenting an already-revoked token terminates all of the user's sessions.
- Error responses in production hide internal details and always return a generic `Internal Server Error` message for unhandled errors.

## Project structure

```
src/
├── config/       # environment configuration and Zod schemas
├── controllers/  # request handlers
├── db/           # Drizzle connection and schema definitions
├── middleware/   # authentication, RBAC, and body validation
├── routes/       # route definitions for auth, tenants, and users
├── services/     # business logic and data access
├── tests/        # integration tests (bun:test)
├── types/        # shared TypeScript types
└── utils/        # JWT, cookies, errors, and logging helpers
```

## Docker

Two multi-stage Dockerfiles are provided:

- **Development** — `docker/dev/Dockerfile`: installs dependencies and runs `bun run dev` with hot reload.
- **Production** — `docker/prod/Dockerfile`: builds the bundle in a builder stage, then runs it as a non-root user in a minimal runtime image.

```sh
# production build
docker build -f docker/prod/Dockerfile -t auth-service .
docker run -p 3000:3000 \
  -e DATABASE_URL=postgres://... \
  -e JWT_ACCESS_SECRET=... \
  -e JWT_REFRESH_SECRET=... \
  auth-service
```

## Testing

```sh
bun test
```

The test suite requires a PostgreSQL database configured in `.env.test`. Tests run against the real HTTP stack (`app.request`) and cover registration, login, token refresh, tenant CRUD, user CRUD, and authorization rules (401/403/404/409 cases).
