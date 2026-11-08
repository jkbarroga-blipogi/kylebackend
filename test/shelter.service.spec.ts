import { describe, expect, it, vi } from "vitest";
import { NotFoundException, BadRequestException } from "@nestjs/common";

import { ShelterService } from "../src/shelter/shelter.service";
import { cannedDb, normSql, type CapturedQuery } from "./helpers/fake-db";

function setup(results: Parameters<typeof cannedDb>[0]) {
  const canned = cannedDb(results);
  const service = new ShelterService(canned.db);
  return { ...canned, service };
}

function captureOf(canned: ReturnType<typeof cannedDb>): CapturedQuery[] {
  return (
    canned.conn.execute as unknown as ReturnType<typeof vi.fn>
  ).mock.calls.map((call) => ({ sql: normSql(call[0]), params: [...(call[1] ?? [])] }));
}

describe("ShelterService validation and dispatch", () => {
  it("rejects unknown resources", async () => {
    const { service } = setup([]);
    await expect(service.create("job", { a: 1 })).rejects.toThrow(
      new NotFoundException("Unknown resource"),
    );
  });

  it("rejects array bodies", async () => {
    const { service } = setup([]);
    await expect(service.create("staff", [])).rejects.toThrow(
      new BadRequestException("Send a JSON object"),
    );
  });

  it("rejects empty body", async () => {
    const { service } = setup([]);
    await expect(service.create("staff", {})).rejects.toThrow(
      new BadRequestException("Empty body or unknown field"),
    );
  });

  it("rejects unknown fields", async () => {
    const { service } = setup([]);
    await expect(
      service.create("staff", { first_name: "a", last_name: "b", position: "c", nope: "x" }),
    ).rejects.toThrow(new BadRequestException("Empty body or unknown field"));
  });

  it("names all required fields when missing", async () => {
    const { service } = setup([]);
    await expect(
      service.create("staff", { first_name: "a" }),
    ).rejects.toThrow(
      new BadRequestException("Required: first_name, last_name, position"),
    );
  });

  it("rejects non-numeric _id fields", async () => {
    const { service } = setup([]);
    await expect(
      service.create("adoption-application", {
        animal_id: "seven",
        adopter_id: 2,
        staff_id: 3,
        application_date: "2026-01-15",
      }),
    ).rejects.toThrow(new BadRequestException("animal_id must be a number"));
  });

  it("rejects zero or negative ids", async () => {
    const { service } = setup([]);
    await expect(
      service.create("adoption-application", {
        animal_id: 0,
        adopter_id: 2,
        staff_id: 3,
        application_date: "2026-01-15",
      }),
    ).rejects.toThrow(new BadRequestException("ID must be a positive integer"));
  });

  it("rejects blank required strings", async () => {
    const { service } = setup([]);
    await expect(
      service.create("staff", { first_name: "   ", last_name: "b", position: "c" }),
    ).rejects.toThrow(new BadRequestException("first_name cannot be empty"));
  });

  it("rejects malformed dates before opening a connection", async () => {
    const { service, pool } = setup([]);
    const getConnection = (pool.getConnection as unknown as ReturnType<typeof vi.fn>).mock;
    await expect(
      service.create("adoption-application", {
        animal_id: 1,
        adopter_id: 2,
        staff_id: 3,
        application_date: "2026-13-40",
      }),
    ).rejects.toThrow(
      new BadRequestException("application_date must be a valid YYYY-MM-DD date"),
    );
    expect(getConnection.calls.length).toBe(0);
  });
});

describe("ShelterService generic CRUD", () => {
  it("INSERTs then reads back the created row", async () => {
    const canned = cannedDb([
      { kind: "header", insertId: 9, affectedRows: 1 },
      {
        kind: "rows",
        rows: [{ staff_id: 9, first_name: "Ana", last_name: "Reyes", position: "Keeper" }],
      },
    ]);
    const service = new ShelterService(canned.db);
    const row = await service.create("staff", {
      first_name: "Ana",
      last_name: "Reyes",
      position: "Keeper",
    });

    expect(row).toEqual({
      staff_id: 9,
      first_name: "Ana",
      last_name: "Reyes",
      position: "Keeper",
    });

    const captured = captureOf(canned);
    expect(captured.length).toBe(2);
    expect(captured[0].sql).toBe(
      "INSERT INTO `Staff` (`first_name`, `last_name`, `position`) VALUES (?, ?, ?)",
    );
    expect(captured[0].params).toEqual(["Ana", "Reyes", "Keeper"]);
    expect(captured[1].sql).toBe("SELECT * FROM `Staff` WHERE `staff_id` = ?");
    expect(captured[1].params).toEqual([9]);
  });

  it("throws Record not found when the read-back misses", async () => {
    const { service } = setup([{ kind: "rows", rows: [] }]);
    await expect(service.findOne("staff", 999)).rejects.toThrow(
      new NotFoundException("Record not found"),
    );
  });

  it("rejects non-positive ids before querying", async () => {
    const { service, pool } = setup([]);
    await expect(service.findOne("staff", 0)).rejects.toThrow(
      new BadRequestException("ID must be a positive integer"),
    );
    expect((pool.execute as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
  });

  it("passes null through for optional fields", async () => {
    const canned = cannedDb([
      { kind: "header", insertId: 3, affectedRows: 1 },
      {
        kind: "rows",
        rows: [
          {
            adopter_id: 3,
            first_name: "Ana",
            last_name: "Reyes",
            phone: "1",
            address: "x",
            email: null,
          },
        ],
      },
    ]);
    const service = new ShelterService(canned.db);
    const row = await service.create("adopter", {
      first_name: "Ana",
      last_name: "Reyes",
      phone: "1",
      address: "x",
      email: null,
    });

    expect(row).toEqual({
      adopter_id: 3,
      first_name: "Ana",
      last_name: "Reyes",
      phone: "1",
      address: "x",
      email: null,
    });

    const captured = captureOf(canned);
    expect(captured[0].sql).toBe(
      "INSERT INTO `Adopter` (`first_name`, `last_name`, `phone`, `address`, `email`) VALUES (?, ?, ?, ?, ?)",
    );
    expect(captured[0].params).toEqual(["Ana", "Reyes", "1", "x", null]);
  });
});
