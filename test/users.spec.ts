import { describe, expect, it, vi } from "vitest";
import { NotFoundException, BadRequestException, ConflictException, ForbiddenException } from "@nestjs/common";

import { UsersService } from "../src/users/users.service";
import { cannedDb, normSql, type CapturedQuery } from "./helpers/fake-db";

type CannedSlot = Parameters<typeof cannedDb>[0][number];

function setup(results: CannedSlot[]) {
  const canned = cannedDb(results);
  return { ...canned, users: new UsersService(canned.db) };
}

function captureOf(canned: ReturnType<typeof cannedDb>): CapturedQuery[] {
  return (
    canned.conn.execute as unknown as ReturnType<typeof vi.fn>
  ).mock.calls.map((call) => ({ sql: normSql(call[0]), params: [...(call[1] ?? [])] }));
}

describe("users boundary (V6)", () => {
  it("forbids non-admin accounts from changing roles", async () => {
    const { users, pool } = setup([]);
    await expect(
      users.updateUser(1, { username: "x", role: "admin" }, { id: 1, role: "user" }),
    ).rejects.toThrow(new ForbiddenException("Only administrators can change user roles"));
    await expect(
      users.updateUser(2, { role: "staff" }, { id: 2, role: "staff" }),
    ).rejects.toThrow(new ForbiddenException("Only administrators can change user roles"));
    expect((pool.execute as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
  });

  it("allows an admin to change a user role (for example user to staff or staff to user)", async () => {
    const canned = setup([
      { kind: "header", insertId: 0, affectedRows: 1 },
      { kind: "rows", rows: [{ id: 4, username: "ana", email: null, role: "staff", created_at: "now" }] },
      { kind: "header", insertId: 0, affectedRows: 1 },
      { kind: "rows", rows: [{ id: 4, username: "ana", email: null, role: "user", created_at: "now" }] },
    ]);

    const promoted = await canned.users.updateUser(4, { role: "staff" }, { id: 1, role: "admin" });
    expect(promoted).toEqual({ id: 4, username: "ana", email: null, role: "staff", created_at: "now" });

    const demoted = await canned.users.updateUser(4, { role: "user" }, { id: 1, role: "admin" });
    expect(demoted).toEqual({ id: 4, username: "ana", email: null, role: "user", created_at: "now" });

    const captured = captureOf(canned);
    expect(captured[0].sql).toBe("UPDATE users SET role = ? WHERE id = ?");
    expect(captured[0].params).toEqual(["staff", 4]);
    expect(captured[2].sql).toBe("UPDATE users SET role = ? WHERE id = ?");
    expect(captured[2].params).toEqual(["user", 4]);
  });

  it("rejects invalid role values even from an admin", async () => {
    const { users, pool } = setup([]);
    await expect(
      users.updateUser(4, { role: "superuser" as never }, { id: 1, role: "admin" }),
    ).rejects.toThrow(
      new BadRequestException("role must be one of: admin, staff, volunteer, user"),
    );
    expect((pool.execute as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
  });

  it("rejects unknown fields by name", async () => {
    const { users } = setup([]);
    const payload = { password: "x", hacker: "nope" };
    await expect(
      users.updateUser(1, payload, { id: 1, role: "user" }),
    ).rejects.toThrow(new BadRequestException("Unknown field: hacker"));
  });

  it("enforces self or admin on update", async () => {
    const { users, pool } = setup([]);
    await expect(
      users.updateUser(1, { username: "target" }, { id: 7, role: "user" }),
    ).rejects.toThrow(new NotFoundException("User not found"));
    expect((pool.execute as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
  });

  it("allows self update", async () => {
    const canned = setup([
      { kind: "header", insertId: 0, affectedRows: 1 },
      { kind: "rows", rows: [{ id: 7, username: "ana2", role: "user" }] },
    ]);
    await canned.users.updateUser(7, { username: "ana2" }, { id: 7, role: "user" });
    const captured = captureOf(canned);
    expect(captured[0].sql).toBe("UPDATE users SET username = ? WHERE id = ?");
  });

  it("allows admin update of other users", async () => {
    const canned = setup([
      { kind: "header", insertId: 0, affectedRows: 1 },
      { kind: "rows", rows: [{ id: 1, username: "ana", role: "user" }] },
    ]);
    await canned.users.updateUser(1, { username: "ana" }, { id: 9, role: "admin" });
    const captured = captureOf(canned);
    expect(captured[0].sql).toBe("UPDATE users SET username = ? WHERE id = ?");
  });
});

describe("UsersService SQL contract", () => {
  it("hashes passwords and inserts with role defaults", async () => {
    const canned = setup([{ kind: "header", insertId: 4, affectedRows: 1 }]);
    const out = await canned.users.createUser("ana", "s3cret-pass");

    expect(out).toEqual({ id: 4, username: "ana", email: null, role: "user" });

    const captured = captureOf(canned);
    expect(captured[0].sql).toBe(
      "INSERT INTO users (username, password, role, email) VALUES (?, ?, ?, ?)",
    );
    expect(captured[0].params[0]).toBe("ana");
    expect(captured[0].params[1]).not.toBe("s3cret-pass");
    expect(String(captured[0].params[1]).length).toBeGreaterThan(8);
    expect(captured[0].params[2]).toBe("user");
    expect(captured[0].params[3]).toBeNull();
  });

  it("finds an account by username or email for login", async () => {
    const canned = setup([
      { kind: "rows", rows: [{ id: 1, username: "ana", email: "ana@example.com", password: "hash", role: "user" }] },
      { kind: "rows", rows: [{ id: 1, username: "ana", email: "ana@example.com", password: "hash", role: "user" }] },
    ]);
    await canned.users.findByIdentifier("ana");
    await canned.users.findByIdentifier("Ana@Example.com");

    const captured = captureOf(canned);
    expect(captured[0].sql).toBe(
      "SELECT id, username, email, password, role, refresh_token FROM users WHERE username = ? OR email = ?",
    );
    expect(captured[0].params).toEqual(["ana", "ana"]);
    expect(captured[1].params).toEqual(["Ana@Example.com", "ana@example.com"]);
  });

  it("selects safe user columns for listing", async () => {
    const canned = setup([{ kind: "rows", rows: [{ id: 1, username: "ana", email: "ana@example.com", role: "user", created_at: "now" }] }]);
    const rows = await canned.users.getAll();
    expect(rows).toEqual([{ id: 1, username: "ana", email: "ana@example.com", role: "user", created_at: "now" }]);
    const captured = captureOf(canned);
    expect(captured[0].sql).toBe("SELECT id, username, email, role, created_at FROM users");
    expect(captured[0].params).toEqual([]);
  });

  it("updates an account email in lowercase", async () => {
    const canned = setup([
      { kind: "header", insertId: 0, affectedRows: 1 },
      { kind: "rows", rows: [{ id: 1, username: "ana", email: "ana@example.com", role: "user" }] },
    ]);
    await canned.users.updateUser(
      1,
      { email: "Ana@Example.com" },
      { id: 1, role: "user" },
    );
    const captured = captureOf(canned);
    expect(captured[0].sql).toBe("UPDATE users SET email = ? WHERE id = ?");
    expect(captured[0].params).toEqual(["ana@example.com", 1]);
  });

  it("rejects weak passwords on update", async () => {
    const { users } = setup([]);
    await expect(
      users.updateUser(1, { password: "short" }, { id: 1, role: "user" }),
    ).rejects.toThrow(new BadRequestException("Password must use at least 8 characters"));
    await expect(
      users.updateUser(1, { password: "x".repeat(73) }, { id: 1, role: "user" }),
    ).rejects.toThrow(new BadRequestException("Password must use at most 72 UTF-8 bytes"));
  });

  it("applies only provided update fields after hashing", async () => {
    const canned = setup([
      { kind: "header", insertId: 0, affectedRows: 1 },
      { kind: "rows", rows: [{ id: 1, username: "ana2", role: "user" }] },
    ]);
    await canned.users.updateUser(
      1,
      { username: "ana2", password: "new-password-1" },
      { id: 1, role: "user" },
    );

    const captured = captureOf(canned);
    expect(captured.length).toBe(2);
    expect(captured[0].sql).toBe("UPDATE users SET username = ?, password = ? WHERE id = ?");
    expect(captured[0].params[0]).toBe("ana2");
    expect(captured[0].params[1]).not.toBe("new-password-1");
    expect(captured[0].params[2]).toBe(1);
    expect(captured[1].sql).toBe("SELECT id, username, email, role, created_at FROM users WHERE id = ?");
  });

  it("stores and looks up refresh tokens", async () => {
    const canned = setup([
      { kind: "header", insertId: 0, affectedRows: 1 },
      { kind: "rows", rows: [{ id: 1 }] },
    ]);
    await canned.users.setRefreshToken(1, "tok");
    await canned.users.findByRefreshToken("tok");

    const captured = captureOf(canned);
    expect(captured[0].sql).toBe("UPDATE users SET refresh_token = ? WHERE id = ?");
    expect(captured[0].params).toEqual(["tok", 1]);
    expect(captured[1].sql).toBe(
      "SELECT id, username, role FROM users WHERE refresh_token = ?",
    );
    expect(captured[1].params).toEqual(["tok"]);
  });

  it("returns the matching account for a refresh token", async () => {
    const canned = setup([
      { kind: "rows", rows: [{ id: 1, username: "ana", role: "user" }] },
    ]);
    await expect(canned.users.findByRefreshToken("tok")).resolves.toEqual({
      id: 1,
      username: "ana",
      role: "user",
    });
  });

  it("deletes users and reports affected rows", async () => {
    const canned = setup([{ kind: "header", insertId: 0, affectedRows: 1 }]);
    const out = await canned.users.deleteUser(2);
    expect(out).toEqual({ affectedRows: 1 });
    expect(captureOf(canned)[0].sql).toBe("DELETE FROM users WHERE id = ?");
  });
});

describe("users error mapping (V5)", () => {
  it("maps duplicate-entry errors to Conflict on user create", async () => {
    const { users } = setup([
      { kind: "error", error: { code: "ER_DUP_ENTRY" } },
    ]);
    await expect(users.createUser("ana", "pass1234")).rejects.toThrow(
      new ConflictException("Duplicate value"),
    );
  });

  it("maps still-referenced errors to Conflict on user delete", async () => {
    const { users } = setup([
      { kind: "error", error: { code: "ER_ROW_IS_REFERENCED_2" } },
    ]);
    await expect(users.deleteUser(2)).rejects.toThrow(
      new ConflictException("Another record still uses this record"),
    );
  });

});
