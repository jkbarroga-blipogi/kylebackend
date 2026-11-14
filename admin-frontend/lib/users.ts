// One function per backend endpoint.
// This file is the connection map: each function names the exact HTTP call
// that a dashboard button triggers.

import { requestJson } from "./api";
import type { AuthedRequest } from "./auth";

export type UserRow = {
  id: number;
  username: string;
  email: string | null;
  role: string;
  created_at: string;
};

export const USER_ROLES = ["user", "staff", "volunteer", "admin", "master"] as const;

// GET /users -> list every user (admin role required)
export function listUsers(req: AuthedRequest): Promise<UserRow[]> {
  return req<UserRow[]>("users");
}

// GET /users/:id -> fetch one user by id
export function getUser(req: AuthedRequest, id: number): Promise<UserRow> {
  return req<UserRow>(`users/${id}`);
}

// POST /auth/register -> create a new account (public endpoint, no token)
export type CreateUserInput = { username: string; email?: string; password: string };
export function createUser(input: CreateUserInput): Promise<unknown> {
  return requestJson("auth/register", { method: "POST", body: input });
}

// PUT /users/:id -> update fields. Omit password to keep the current one.
export type UpdateUserInput = { username?: string; email?: string | null; password?: string };
export function updateUser(req: AuthedRequest, id: number, input: UpdateUserInput): Promise<unknown> {
  return req(`users/${id}`, { method: "PUT", body: input });
}

// PUT /users/:id/role -> dedicated endpoint for role changes
export function updateUserRole(req: AuthedRequest, id: number, role: string): Promise<unknown> {
  return req(`users/${id}/role`, { method: "PUT", body: { role } });
}

// DELETE /users/:id -> remove the account
export function deleteUser(req: AuthedRequest, id: number): Promise<unknown> {
  return req(`users/${id}`, { method: "DELETE" });
}
