import { describe, expect, it, vi } from "vitest";
import { NotFoundException } from "@nestjs/common";

import { UsersService } from "../src/users/users.service";
import { CategoryService } from "../src/category/category.service";
import { cannedDb, normSql, type CapturedQuery } from "./helpers/fake-db";

type CannedSlot = Parameters<typeof cannedDb>[0][number];

function setup(results: CannedSlot[]) {
  const canned = cannedDb(results);
  return { ...canned, users: new UsersService(canned.db), category: new CategoryService(canned.db) };
}

function captureOf(canned: ReturnType<typeof cannedDb>): CapturedQuery[] {
  return (
    canned.conn.execute as unknown as ReturnType<typeof vi.fn>
  ).mock.calls.map((call) => ({ sql: normSql(call[0]), params: [...(call[1] ?? [])] }));
}

describe("UsersService SQL contract", () => {
  it("hashes passwords and inserts with role defaults", async () => {
    const canned = setup([{ kind: "header", insertId: 4, affectedRows: 1 }]);
    const out = await canned.users.createUser("ana", "s3cret-pass");

    expect(out).toEqual({ id: 4, username: "ana", role: "user" });

    const captured = captureOf(canned);
    expect(captured[0].sql).toBe(
      "INSERT INTO users (username, password, role) VALUES (?, ?, ?)",
    );
    expect(captured[0].params[0]).toBe("ana");
    expect(captured[0].params[1]).not.toBe("s3cret-pass");
    expect(String(captured[0].params[1]).length).toBeGreaterThan(8);
    expect(captured[0].params[2]).toBe("user");
  });

  it("selects safe user columns for listing", async () => {
    const canned = setup([{ kind: "rows", rows: [{ id: 1, username: "ana", role: "user", created_at: "now" }] }]);
    const rows = await canned.users.getAll();
    expect(rows).toEqual([{ id: 1, username: "ana", role: "user", created_at: "now" }]);
    const captured = captureOf(canned);
    expect(captured[0].sql).toBe("SELECT id, username, role, created_at FROM users");
    expect(captured[0].params).toEqual([]);
  });

  it("applies only provided update fields after hashing", async () => {
    const canned = setup([
      { kind: "header", insertId: 0, affectedRows: 1 },
      { kind: "rows", rows: [{ id: 1, username: "ana2", role: "user" }] },
    ]);
    await canned.users.updateUser(1, { username: "ana2", password: "newpass" });

    const captured = captureOf(canned);
    expect(captured.length).toBe(2);
    expect(captured[0].sql).toBe("UPDATE users SET username = ?, password = ? WHERE id = ?");
    expect(captured[0].params[0]).toBe("ana2");
    expect(captured[0].params[1]).not.toBe("newpass");
    expect(captured[0].params[2]).toBe(1);
    expect(captured[1].sql).toBe("SELECT id, username, role, created_at FROM users WHERE id = ?");
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

  it("deletes users and reports affected rows", async () => {
    const canned = setup([{ kind: "header", insertId: 0, affectedRows: 1 }]);
    const out = await canned.users.deleteUser(2);
    expect(out).toEqual({ affectedRows: 1 });
    expect(captureOf(canned)[0].sql).toBe("DELETE FROM users WHERE id = ?");
  });
});

describe("CategoryService SQL contract", () => {
  it("inserts with null description default", async () => {
    const canned = setup([{ kind: "header", insertId: 8, affectedRows: 1 }]);
    const out = await canned.category.createCategory({ name: "Vaccines" });
    expect(out).toEqual({ id: 8, name: "Vaccines", description: null });

    const captured = captureOf(canned);
    expect(captured[0].sql).toBe("INSERT INTO categories (name, description) VALUES (?, ?)");
    expect(captured[0].params).toEqual(["Vaccines", null]);
  });

  it("reports missing categories", async () => {
    const { category } = setup([{ kind: "rows", rows: [] }]);
    await expect(category.findById(1)).rejects.toThrow(
      new NotFoundException("Category with ID 1 not found"),
    );
  });

  it("updates only provided fields", async () => {
    const canned = setup([
      { kind: "header", insertId: 0, affectedRows: 1 },
      { kind: "rows", rows: [{ id: 1, name: "b", description: "d" }] },
    ]);
    const row = await canned.category.updateCategory(1, { name: "b", description: "d" });
    expect(row).toEqual({ id: 1, name: "b", description: "d" });

    const captured = captureOf(canned);
    expect(captured.length).toBe(2);
    expect(captured[0].sql).toBe(
      "UPDATE categories SET name = ?, description = ? WHERE id = ?",
    );
    expect(captured[0].params).toEqual(["b", "d", 1]);
  });

  it("no-ops on empty update and reads back", async () => {
    const canned = setup([{ kind: "rows", rows: [{ id: 1, name: "a" }] }]);
    const row = await canned.category.updateCategory(1, {});
    expect(row).toEqual({ id: 1, name: "a" });
    expect(captureOf(canned).length).toBe(1);
  });
});
