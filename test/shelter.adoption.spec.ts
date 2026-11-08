import { describe, expect, it, vi } from "vitest";
import { NotFoundException, ConflictException, BadRequestException } from "@nestjs/common";

import { ShelterService } from "../src/shelter/shelter.service";
import { cannedDb, normSql, type CapturedQuery } from "./helpers/fake-db";

type CannedSlot = Parameters<typeof cannedDb>[0][number];

function setup(results: CannedSlot[]) {
  const canned = cannedDb(results);
  const service = new ShelterService(canned.db);
  return { ...canned, service };
}

function captureOf(canned: ReturnType<typeof cannedDb>): CapturedQuery[] {
  return (
    canned.conn.execute as unknown as ReturnType<typeof vi.fn>
  ).mock.calls.map((call) => ({ sql: normSql(call[0]), params: [...(call[1] ?? [])] }));
}

const ADOPTION_BODY = {
  application_id: 1,
  animal_id: 7,
  adopter_id: 2,
  staff_id: 3,
  adoption_date: "2026-01-15",
};

describe("createAdoption transactions", () => {
  it("locks, inserts, marks Adopted, and commits", async () => {
    const canned = setup([
      { kind: "rows", rows: [{ animal_id: 7, adoption_status: "Available" }] },
      { kind: "rows", rows: [] },
      { kind: "header", insertId: 5, affectedRows: 1 },
      { kind: "header", insertId: 0, affectedRows: 1 },
      { kind: "rows", rows: [{ adoption_id: 5, animal_id: 7 }] },
    ]);
    const row = await canned.service.create("adoption", ADOPTION_BODY);

    expect(row).toEqual({ adoption_id: 5, animal_id: 7 });

    const captured = captureOf(canned);
    expect(captured.length).toBe(5);
    expect(captured[0].sql).toBe(
      "SELECT `animal_id`, `adoption_status` FROM `Animal` WHERE `animal_id` = ? FOR UPDATE",
    );
    expect(captured[0].params).toEqual([7]);
    expect(captured[1].sql).toBe(
      "SELECT `adoption_id` FROM `Adoption` WHERE `animal_id` = ? LIMIT 1 FOR UPDATE",
    );
    expect(captured[2].sql).toBe(
      "INSERT INTO `Adoption` (`application_id`, `animal_id`, `adopter_id`, `staff_id`, `adoption_date`) VALUES (?, ?, ?, ?, ?)",
    );
    expect(captured[2].params).toEqual([1, 7, 2, 3, "2026-01-15"]);
    expect(captured[3].sql).toBe(
      "UPDATE `Animal` SET `adoption_status` = ? WHERE `animal_id` = ?",
    );
    expect(captured[3].params).toEqual(["Adopted", 7]);
    expect(captured[4].sql).toBe("SELECT * FROM `Adoption` WHERE `adoption_id` = ?");
    expect(captured[4].params).toEqual([5]);

    expect(canned.conn.commit).toHaveBeenCalledTimes(1);
    expect(canned.conn.rollback).not.toHaveBeenCalled();
    expect(canned.conn.release).toHaveBeenCalledTimes(1);
  });

  it("rolls back when an adoption row already references the animal", async () => {
    const canned = setup([
      { kind: "rows", rows: [{ animal_id: 7, adoption_status: "Available" }] },
      { kind: "rows", rows: [{ adoption_id: 4 }] },
    ]);
    await expect(canned.service.create("adoption", ADOPTION_BODY)).rejects.toThrow(
      new ConflictException("This animal has already been adopted by someone else"),
    );

    expect(canned.conn.rollback).toHaveBeenCalledTimes(1);
    expect(canned.conn.commit).not.toHaveBeenCalled();
    expect(canned.conn.release).toHaveBeenCalledTimes(1);
    expect(captureOf(canned).length).toBe(2);
  });

  it("rolls back when the animal status says Adopted", async () => {
    const canned = setup([
      { kind: "rows", rows: [{ animal_id: 7, adoption_status: "Adopted" }] },
      { kind: "rows", rows: [] },
    ]);
    await expect(canned.service.create("adoption", ADOPTION_BODY)).rejects.toThrow(
      new ConflictException("This animal has already been adopted by someone else"),
    );
    expect(canned.conn.rollback).toHaveBeenCalledTimes(1);
  });
});

describe("removeAdoption transactions", () => {
  it("deletes and restores Available with no other bases", async () => {
    const canned = setup([
      { kind: "rows", rows: [{ adoption_id: 5, animal_id: 7 }] },
      { kind: "header", insertId: 0, affectedRows: 1 },
      { kind: "rows", rows: [] },
      { kind: "header", insertId: 0, affectedRows: 1 },
    ]);
    const out = await canned.service.remove("adoption", 5);

    expect(out).toEqual({ deleted: true, id: 5 });

    const captured = captureOf(canned);
    expect(captured.length).toBe(4);
    expect(captured[0].sql).toBe(
      "SELECT `animal_id` FROM `Adoption` WHERE `adoption_id` = ? FOR UPDATE",
    );
    expect(captured[0].params).toEqual([5]);
    expect(captured[1].sql).toBe("DELETE FROM `Adoption` WHERE `adoption_id` = ?");
    expect(captured[2].sql).toBe(
      "SELECT `adoption_id` FROM `Adoption` WHERE `animal_id` = ? LIMIT 1",
    );
    expect(captured[3].params).toEqual(["Available", 7]);
    expect(canned.conn.commit).toHaveBeenCalledTimes(1);
  });

  it("throws Record not found when locking misses", async () => {
    const canned = setup([{ kind: "rows", rows: [] }]);
    await expect(canned.service.remove("adoption", 5)).rejects.toThrow(
      new NotFoundException("Record not found"),
    );
    expect(canned.conn.rollback).toHaveBeenCalledTimes(1);
  });
});

describe("adoption-application transactions", () => {
  it("marks Adopted and closes other apps when status turns final", async () => {
    const canned = setup([
      { kind: "rows", rows: [{ animal_id: 7, application_status: "Pending" }] },
      { kind: "rows", rows: [{ animal_id: 7, adoption_status: "Available" }] },
      { kind: "rows", rows: [] },
      { kind: "header", insertId: 0, affectedRows: 1 },
      { kind: "header", insertId: 0, affectedRows: 1 },
      { kind: "header", insertId: 0, affectedRows: 2 },
      { kind: "rows", rows: [{ application_id: 11, animal_id: 7 }] },
    ]);
    const row = await canned.service.update("adoption-application", 11, {
      application_status: "Completed",
    });

    expect(row).toEqual({ application_id: 11, animal_id: 7 });

    const captured = captureOf(canned);
    expect(captured.length).toBe(7);
    expect(captured[0].sql).toBe(
      "SELECT `animal_id`, `application_status` FROM `Adoption_Application` WHERE `application_id` = ? FOR UPDATE",
    );
    expect(captured[0].params).toEqual([11]);
    expect(captured[1].sql).toBe(
      "SELECT `animal_id`, `adoption_status` FROM `Animal` WHERE `animal_id` = ? FOR UPDATE",
    );
    expect(
      captured[2].sql,
    ).toContain(
      "COALESCE(LOWER(TRIM(`application_status`)), '') IN ('adopted', 'completed') LIMIT 1 FOR UPDATE",
    );
    expect(captured[3].sql).toMatch(
      /UPDATE `Adoption_Application` SET `application_status` = \? WHERE `application_id` = \?/,
    );
    expect(captured[3].params).toEqual(["Completed", 11]);
    expect(captured[4].sql).toBe(
      "UPDATE `Animal` SET `adoption_status` = ? WHERE `animal_id` = ?",
    );
    expect(captured[4].params).toEqual(["Adopted", 7]);
    expect(captured[5].sql).toMatch(
      /UPDATE `Adoption_Application` SET `application_status` = \? WHERE `animal_id` = \? AND `application_id` <> \?/,
    );
    expect(captured[5].params).toEqual(["Rejected", 7, 11]);
    expect(captured[6].sql).toBe(
      "SELECT * FROM `Adoption_Application` WHERE `application_id` = ?",
    );
    expect(captured[6].params).toEqual([11]);
    expect(canned.conn.commit).toHaveBeenCalledTimes(1);
  });

  it("deletes a final application and releases the animal when no other bases exist", async () => {
    const canned = setup([
      { kind: "rows", rows: [{ animal_id: 7, application_status: "Adopted" }] },
      { kind: "header", insertId: 0, affectedRows: 1 },
      { kind: "rows", rows: [] },
      { kind: "rows", rows: [] },
      { kind: "header", insertId: 0, affectedRows: 1 },
    ]);
    const out = await canned.service.remove("adoption-application", 9);

    expect(out).toEqual({ deleted: true, id: 9 });

    const captured = captureOf(canned);
    expect(captured.length).toBe(5);
    expect(captured[1].sql).toBe(
      "DELETE FROM `Adoption_Application` WHERE `application_id` = ?",
    );
    expect(captured[4].params).toEqual(["Available", 7]);
    expect(canned.conn.commit).toHaveBeenCalledTimes(1);
  });

  it("skips the release when another Adoption record still exists", async () => {
    const canned = setup([
      { kind: "rows", rows: [{ animal_id: 7, application_status: "Adopted" }] },
      { kind: "header", insertId: 0, affectedRows: 1 },
      { kind: "rows", rows: [{ adoption_id: 1 }] },
      { kind: "rows", rows: [] },
    ]);
    const out = await canned.service.remove("adoption-application", 9);

    expect(out).toEqual({ deleted: true, id: 9 });
    const captured = captureOf(canned);
    expect(captured.length).toBe(4);
    expect(captured.some((call) => call.params[0] === "Available")).toBe(false);
  });

  it("rejects unknown fields before opening the connection", async () => {
    const { service, pool } = setup([]);
    const getConnection = (pool.getConnection as unknown as ReturnType<typeof vi.fn>).mock;
    await expect(
      service.update("adoption-application", 11, { status: "bogus" }),
    ).rejects.toThrow(new BadRequestException("Empty body or unknown field"));
    expect(getConnection.calls.length).toBe(0);
  });
});
