import { describe, expect, it } from "vitest";
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { AdopterService } from "../src/adopter/adopter.service";
import { cannedDb, type CannedResult } from "./helpers/fake-db";

const row = (rows: Record<string, unknown>[]): CannedResult => ({ kind: "rows", rows });
const inserted = (id: number): CannedResult => ({ kind: "header", insertId: id, affectedRows: 1 });
const profile = { adopter_id: 10, first_name: "Ana", last_name: "Cruz", phone: "+63 00123", address: "One\nTwo", email: null };
const application = { application_id: 20, animal_id: 5, animal_name: "Luna", application_date: "2026-11-08", application_status: "Pending", reviewer_assigned: 0 };
function setup(results: CannedResult[]) {
  const canned = cannedDb(results);
  return { ...canned, service: new AdopterService(canned.db) };
}

describe("adopter ownership and workflow", () => {
  it("reads profiles only through the authenticated account link", async () => {
    const { service, captured } = setup([row([profile])]);
    expect(await service.getProfile(7)).toEqual(profile);
    expect(captured[0].sql).toMatch(/WHERE.*user_id.*= \?/);
    expect(captured[0].params).toEqual([7]);
  });

  it("does not expose another account's application by identifier", async () => {
    const { service, captured } = setup([row([])]);
    await expect(service.getApplication(7, 20)).rejects.toBeInstanceOf(NotFoundException);
    expect(captured[0].sql).toMatch(/user_id.*= \?.*application_id.*= \?/);
    expect(captured[0].params).toEqual([7, 20]);
  });

  it("filters catalog eligibility in SQL without exposing contact records", async () => {
    const { service, captured } = setup([row([])]);
    await expect(service.listAnimals()).resolves.toEqual([]);
    expect(captured[0].sql).toContain("NOT EXISTS");
    expect(captured[0].sql).toContain("'available'");
    expect(captured[0].sql).not.toMatch(/password|refresh_token|phone|email/);
  });

  it("lists all animals including adopted with the adopter name", async () => {
    const { service, captured } = setup([
      row([
        { animal_id: 5, animal_name: "Luna", adoption_status: "Available", adopter_first_name: null, adopter_last_name: null },
        { animal_id: 6, animal_name: "Milo", adoption_status: "Adopted", adopter_first_name: "Ana", adopter_last_name: "Cruz" },
      ]),
    ]);
    const rows = await service.listAllAnimals();
    expect(rows).toHaveLength(2);
    expect((rows[0] as { adopter_name: unknown }).adopter_name).toBeNull();
    expect((rows[1] as { adopter_name: unknown }).adopter_name).toBe("Ana Cruz");
    expect(captured[0].sql).toContain("LEFT JOIN Adoption");
    expect(captured[0].sql).not.toContain("NOT EXISTS");
  });

  it.each([{ animal_id: 5, adopter_id: 999 }, { animal_id: 5, user_id: 999 }, { animal_id: 5, staff_id: 3 }, { animal_id: 5, application_status: "Adopted" }, { animal_id: "5" }, { animal_id: -1 }])("rejects forged or malformed application fields: %j", async (payload) => {
    const { service, captured } = setup([]);
    await expect(service.createApplication(7, payload)).rejects.toBeInstanceOf(BadRequestException);
    expect(captured).toEqual([]);
  });

  it("creates a Pending, unassigned application for the authenticated adopter", async () => {
    const { service, captured, conn } = setup([
      row([{ animal_id: 5, adoption_status: "Available" }]), row([]), row([]),
      row([{ adopter_id: 10 }]), row([]), inserted(20), row([application]),
    ]);
    expect(await service.createApplication(7, { animal_id: 5 })).toEqual({ ...application, reviewer_assigned: false });
    expect(captured[3].params).toEqual([7]);
    expect(captured[5].sql).toContain("NULL, UTC_DATE(), 'Pending'");
    expect(captured[5].params).toEqual([5, 10]);
    expect(conn.commit).toHaveBeenCalledTimes(1);
    expect(conn.rollback).not.toHaveBeenCalled();
  });

  it("rejects duplicate open applications and rolls back", async () => {
    const { service, conn, captured } = setup([
      row([{ animal_id: 5, adoption_status: "Available" }]), row([]), row([]),
      row([{ adopter_id: 10 }]), row([{ application_id: 20 }]),
    ]);
    await expect(service.createApplication(7, { animal_id: 5 })).rejects.toBeInstanceOf(ConflictException);
    expect(captured.some((query) => query.sql.startsWith("INSERT"))).toBe(false);
    expect(conn.rollback).toHaveBeenCalledTimes(1);
    expect(conn.release).toHaveBeenCalledTimes(1);
  });

  it("rejects animals outside Available status under the row lock", async () => {
    const { service, captured, conn } = setup([row([{ animal_id: 5, adoption_status: "Medical" }])]);
    await expect(service.createApplication(7, { animal_id: 5 })).rejects.toBeInstanceOf(ConflictException);
    expect(captured[0].sql).toContain("FOR UPDATE");
    expect(conn.rollback).toHaveBeenCalledTimes(1);
  });

  it("requires an owned profile before submission", async () => {
    const { service } = setup([row([{ animal_id: 5, adoption_status: "Available" }]), row([]), row([]), row([])]);
    await expect(service.createApplication(7, { animal_id: 5 })).rejects.toThrow("Save your contact details");
  });

  it.each([{ ...profile, user_id: 9 }, { first_name: "a".repeat(51), last_name: "Cruz", phone: "123", address: "City" }, { first_name: "Ana", last_name: "Cruz", phone: "123", address: "City", email: "broken" }])("validates profile fields before SQL: %j", async (payload) => {
    const { service, captured } = setup([]);
    await expect(service.saveProfile(7, payload)).rejects.toBeInstanceOf(BadRequestException);
    expect(captured).toEqual([]);
  });

  it("creates a profile linked to the authenticated user, preserving phone text", async () => {
    const { adopter_id, ...payload } = profile;
    const { service, captured, conn } = setup([row([{ id: 7 }]), row([]), inserted(adopter_id), row([profile])]);
    await expect(service.saveProfile(7, payload)).resolves.toEqual(profile);
    expect(captured[2].sql).toContain("user_id");
    expect(captured[2].params).toEqual([7, "Ana", "Cruz", "+63 00123", "One\nTwo", null]);
    expect(conn.commit).toHaveBeenCalledTimes(1);
  });
});
