import { describe, expect, it, vi, beforeEach } from "vitest";
import { NotFoundException, BadRequestException, ConflictException } from "@nestjs/common";

import { AnimalService } from "../src/animal/animal.service";
import { cannedDb, normSql, type CapturedQuery } from "./helpers/fake-db";

type CannedSlot = Parameters<typeof cannedDb>[0][number];

function setup(results: CannedSlot[]) {
  const canned = cannedDb(results);
  const service = new AnimalService(canned.db);
  return { ...canned, service };
}

function captureOf(canned: ReturnType<typeof cannedDb>): CapturedQuery[] {
  return (
    canned.conn.execute as unknown as ReturnType<typeof vi.fn>
  ).mock.calls.map((call) => ({ sql: normSql(call[0]), params: [...(call[1] ?? [])] }));
}

const ANIMAL_ROW_7 = {
  animal_id: 7,
  breed_id: 2,
  animal_name: "Bantay",
  sex: "M",
  birth_date: "2024-02-01",
  arrival_date: "2025-01-10",
  color: "white",
  adoption_status: "Available",
  breed_breed_id: 2,
  breed_species_id: 3,
  breed_breed_name: "Shiba",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("species contract", () => {
  it("rejects invalid ids", async () => {
    const { service } = setup([]);
    await expect(service.findOneSpecies(0)).rejects.toThrow(
      new BadRequestException("Invalid ID"),
    );
  });

  it("reports missing species", async () => {
    const { service } = setup([{ kind: "rows", rows: [] }]);
    await expect(service.findOneSpecies(7)).rejects.toThrow(
      new NotFoundException("Species not found"),
    );
  });

  it("reads species flat rows", async () => {
    const canned = setup([
      { kind: "rows", rows: [{ species_id: 3, species_name: "Dog" }] },
    ]);
    const row = await canned.service.findOneSpecies(3);
    expect(row).toEqual({ species_id: 3, species_name: "Dog" });
    expect(captureOf(canned)[0].sql).toBe(
      "SELECT * FROM `Species` WHERE `species_id` = ?",
    );
  });

  it("inserts then reads back created species", async () => {
    const canned = setup([
      { kind: "header", insertId: 6, affectedRows: 1 },
      { kind: "rows", rows: [{ species_id: 6, species_name: "Cat" }] },
    ]);
    const row = await canned.service.createSpecies({ species_name: "Cat" });
    expect(row).toEqual({ species_id: 6, species_name: "Cat" });

    const captured = captureOf(canned);
    expect(captured.length).toBe(2);
    expect(captured[0].sql).toBe(
      "INSERT INTO `Species` (`species_name`) VALUES (?)",
    );
    expect(captured[0].params).toEqual(["Cat"]);
    expect(captured[1].sql).toBe(
      "SELECT * FROM `Species` WHERE `species_id` = ?",
    );
    expect(captured[1].params).toEqual([6]);
  });

  it("rejects bad species names on update before any query", async () => {
    const { service, pool } = setup([]);
    await expect(service.updateSpecies(1, { species_name: "   " })).rejects.toThrow(
      new BadRequestException("species_name must contain 1 to 50 characters"),
    );
    await expect(
      service.updateSpecies(1, { species_name: "x".repeat(51) }),
    ).rejects.toThrow(
      new BadRequestException("species_name must contain 1 to 50 characters"),
    );
    expect(
      (pool.execute as unknown as ReturnType<typeof vi.fn>).mock.calls.length,
    ).toBe(0);
  });

  it("reports missing species on update", async () => {
    const { service } = setup([{ kind: "rows", rows: [] }]);
    await expect(service.updateSpecies(1, { species_name: "Dog" })).rejects.toThrow(
      new NotFoundException("Species not found"),
    );
  });

  it("maps duplicate-entry errors to Conflict", async () => {
    const canned = setup([
      { kind: "rows", rows: [{ species_id: 1, species_name: "Dog" }] },
      { kind: "error", error: { driverError: { code: "ER_DUP_ENTRY" } } },
    ]);
    await expect(
      canned.service.updateSpecies(1, { species_name: "Dog" }),
    ).rejects.toThrow(new ConflictException("Duplicate value"));
    expect(canned.conn.rollback).not.toHaveBeenCalled();
    expect(canned.conn.release).not.toHaveBeenCalled();
  });

  it("maps foreign-key errors to BadRequest", async () => {
    const canned = setup([
      { kind: "rows", rows: [{ species_id: 1, species_name: "Dog" }] },
      { kind: "error", error: { driverError: { code: "ER_NO_REFERENCED_ROW_2" } } },
    ]);
    await expect(
      canned.service.updateSpecies(1, { species_name: "Dog" }),
    ).rejects.toThrow(new BadRequestException("A referenced ID does not exist"));
  });

  it("maps still-referenced errors to Conflict on delete", async () => {
    const canned = setup([
      { kind: "rows", rows: [{ species_id: 1, species_name: "Dog" }] },
      { kind: "error", error: { driverError: { code: "ER_ROW_IS_REFERENCED_2" } } },
    ]);
    await expect(canned.service.removeSpecies(1)).rejects.toThrow(
      new ConflictException("Another record still uses this record"),
    );
  });

  it("reports missing species on delete", async () => {
    const { service } = setup([{ kind: "rows", rows: [] }]);
    await expect(service.removeSpecies(1)).rejects.toThrow(
      new NotFoundException("Species not found"),
    );
  });
});

describe("breed contract", () => {
  it("rejects bad breed names and blank patches", async () => {
    const { service } = setup([]);
    await expect(
      service.updateBreed(1, { breed_name: "x".repeat(101) }),
    ).rejects.toThrow(
      new BadRequestException("breed_name must contain 1 to 100 characters"),
    );
    await expect(service.updateBreed(1, {})).rejects.toThrow(
      new BadRequestException("No valid fields to update"),
    );
  });

  it("verifies the species before reassigning", async () => {
    const { service } = setup([{ kind: "rows", rows: [] }]);
    await expect(service.updateBreed(1, { species_id: 42 })).rejects.toThrow(
      new NotFoundException("Species not found"),
    );
  });

  it("applies only allowed patch fields and reads back with the nested species", async () => {
    const canned = setup([
      {
        kind: "rows",
        rows: [
          {
            breed_id: 1,
            species_id: 3,
            breed_name: "Mixed",
            species_species_id: 3,
            species_species_name: "Dog",
          },
        ],
      },
      { kind: "header", insertId: 0, affectedRows: 1 },
      {
        kind: "rows",
        rows: [
          {
            breed_id: 1,
            species_id: 3,
            breed_name: "Shiba",
            species_species_id: 3,
            species_species_name: "Dog",
          },
        ],
      },
    ]);
    const row = await canned.service.updateBreed(1, { breed_name: " Shiba " });
    expect(row).toEqual({
      breed_id: 1,
      species_id: 3,
      breed_name: "Shiba",
      species: { species_id: 3, species_name: "Dog" },
    });

    const captured = captureOf(canned);
    expect(captured.length).toBe(3);
    expect(captured[1].sql).toBe(
      "UPDATE `Breed` SET `breed_name` = ? WHERE `breed_id` = ?",
    );
    expect(captured[1].params).toEqual(["Shiba", 1]);
  });

  it("joins species for breed rows and nests the relation", async () => {
    const canned = setup([
      {
        kind: "rows",
        rows: [
          {
            breed_id: 1,
            species_id: 3,
            breed_name: "Shiba",
            species_species_id: 3,
            species_species_name: "Dog",
          },
        ],
      },
    ]);
    const rows = await canned.service.findAllBreeds();
    expect(rows).toEqual([
      {
        breed_id: 1,
        species_id: 3,
        breed_name: "Shiba",
        species: { species_id: 3, species_name: "Dog" },
      },
    ]);
    expect(captureOf(canned)[0].sql).toBe(
      "SELECT `b`.`breed_id`, `b`.`species_id`, `b`.`breed_name`, `s`.`species_id` AS `species_species_id`, `s`.`species_name` AS `species_species_name` FROM `Breed` `b` LEFT JOIN `Species` `s` ON `s`.`species_id` = `b`.`species_id`",
    );
  });
});

describe("animal contract", () => {
  it("reports missing animals", async () => {
    const { service } = setup([{ kind: "rows", rows: [] }]);
    await expect(service.findOne(7)).rejects.toThrow(
      new NotFoundException("Animal not found"),
    );
  });

  it("selects date columns as YYYY-MM-DD strings and nests breed", async () => {
    const canned = setup([{ kind: "rows", rows: [ANIMAL_ROW_7] }]);
    const row = await canned.service.findOne(7);
    expect(row).toEqual({
      animal_id: 7,
      breed_id: 2,
      animal_name: "Bantay",
      sex: "M",
      birth_date: "2024-02-01",
      arrival_date: "2025-01-10",
      color: "white",
      adoption_status: "Available",
      breed: { breed_id: 2, species_id: 3, breed_name: "Shiba" },
    });
    expect(captureOf(canned)[0].sql).toBe(
      "SELECT `a`.`animal_id`, `a`.`breed_id`, `a`.`animal_name`, `a`.`sex`, DATE_FORMAT(`a`.`birth_date`, '%Y-%m-%d') AS `birth_date`, DATE_FORMAT(`a`.`arrival_date`, '%Y-%m-%d') AS `arrival_date`, `a`.`color`, `a`.`adoption_status`, `b`.`breed_id` AS `breed_breed_id`, `b`.`species_id` AS `breed_species_id`, `b`.`breed_name` AS `breed_breed_name` FROM `Animal` `a` LEFT JOIN `Breed` `b` ON `b`.`breed_id` = `a`.`breed_id` WHERE `a`.`animal_id` = ?",
    );
  });

  it("inserts only allowlisted fields for animal create", async () => {
    const canned = setup([
      { kind: "header", insertId: 12, affectedRows: 1 },
      {
        kind: "rows",
        rows: [
          {
            ...ANIMAL_ROW_7,
            animal_id: 12,
            birth_date: null,
            color: null,
          },
        ],
      },
    ]);
    const row = await canned.service.create({
      breed_id: 2,
      animal_name: "Bantay",
      sex: "M",
      arrival_date: "2025-01-10",
      stolen_field: "nope",
    });

    expect(Object.keys(row)).not.toContain("stolen_field");

    const captured = captureOf(canned);
    expect(captured[0].sql).toBe(
      "INSERT INTO `Animal` (`breed_id`, `animal_name`, `sex`, `arrival_date`) VALUES (?, ?, ?, ?)",
    );
    expect(captured[0].params).toEqual([2, "Bantay", "M", "2025-01-10"]);
  });

  it("updates only allowlisted fields", async () => {
    const canned = setup([
      { kind: "header", insertId: 0, affectedRows: 1 },
      { kind: "rows", rows: [ANIMAL_ROW_7] },
    ]);
    const row = await canned.service.update(7, { color: "white", hacker: "nope" });

    expect(row.adoption_status).toBe("Available");

    const captured = captureOf(canned);
    expect(captured.length).toBe(2);
    expect(captured[0].sql).toBe("UPDATE `Animal` SET `color` = ? WHERE `animal_id` = ?");
    expect(captured[0].params).toEqual(["white", 7]);
  });

  it("deletes by id after a confirmed read", async () => {
    const canned = setup([
      { kind: "rows", rows: [ANIMAL_ROW_7] },
      { kind: "header", insertId: 0, affectedRows: 1 },
    ]);
    const row = await canned.service.remove(7);

    const captured = captureOf(canned);
    expect(captured.length).toBe(2);
    expect(captured[1].sql).toBe("DELETE FROM `Animal` WHERE `animal_id` = ?");
    expect(captured[1].params).toEqual([7]);
    expect(row.animal_id).toBe(7);
  });
});
