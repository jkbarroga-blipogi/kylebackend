import { describe, expect, it, vi, beforeEach } from "vitest";
import { NotFoundException, BadRequestException, ConflictException } from "@nestjs/common";

import { AnimalService } from "../src/animal/animal.service";

function repo() {
  return {
    create: vi.fn((x: unknown) => x),
    save: vi.fn(async (x: unknown) => x),
    find: vi.fn(async () => []),
    findOneBy: vi.fn(async () => null),
    findOne: vi.fn(async () => null),
    update: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
    remove: vi.fn(async (x: unknown) => x),
  };
}

type Repo = ReturnType<typeof repo>;

function setup() {
  const animal = repo();
  const breed = repo();
  const species = repo();
  const service = new AnimalService(
    animal as never,
    breed as never,
    species as never,
  );
  return { service, animal: animal as Repo, breed: breed as Repo, species: species as Repo };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("species contract", () => {
  it("rejects invalid ids", async () => {
    const { service } = setup();
    await expect(service.findOneSpecies(0)).rejects.toThrow(
      new BadRequestException("Invalid ID"),
    );
  });

  it("reports missing species", async () => {
    const { service } = setup();
    await expect(service.findOneSpecies(7)).rejects.toThrow(
      new NotFoundException("Species not found"),
    );
  });

  it("creates by delegating to the repository", async () => {
    const { service, species } = setup();
    (species.findOneBy as ReturnType<typeof vi.fn>).mockResolvedValue({ species_id: 1, species_name: "Dog" });
    await service.createSpecies({ species_name: "Dog" });
    expect(species.create).toHaveBeenCalledWith({ species_name: "Dog" });
    expect(species.save).toHaveBeenCalled();
  });

  it("rejects bad species names on update", async () => {
    const { service } = setup();
    await expect(service.updateSpecies(1, { species_name: "   " })).rejects.toThrow(
      new BadRequestException("species_name must contain 1 to 50 characters"),
    );
    await expect(
      service.updateSpecies(1, { species_name: "x".repeat(51) }),
    ).rejects.toThrow(
      new BadRequestException("species_name must contain 1 to 50 characters"),
    );
  });

  it("reports missing species on update", async () => {
    const { service, species } = setup();
    (species.findOneBy as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(service.updateSpecies(1, { species_name: "Dog" })).rejects.toThrow(
      new NotFoundException("Species not found"),
    );
  });

  it("maps duplicate-entry errors to Conflict", async () => {
    const { service, species } = setup();
    (species.findOneBy as ReturnType<typeof vi.fn>).mockResolvedValue({ species_id: 1 });
    (species.update as ReturnType<typeof vi.fn>).mockRejectedValue({
      driverError: { code: "ER_DUP_ENTRY" },
    });
    await expect(service.updateSpecies(1, { species_name: "Dog" })).rejects.toThrow(
      new ConflictException("Duplicate value"),
    );
  });

  it("maps foreign-key errors to BadRequest", async () => {
    const { service, species } = setup();
    (species.findOneBy as ReturnType<typeof vi.fn>).mockResolvedValue({ species_id: 1 });
    (species.update as ReturnType<typeof vi.fn>).mockRejectedValue({
      driverError: { code: "ER_NO_REFERENCED_ROW_2" },
    });
    await expect(service.updateSpecies(1, { species_name: "Dog" })).rejects.toThrow(
      new BadRequestException("A referenced ID does not exist"),
    );
  });

  it("maps still-referenced errors to Conflict", async () => {
    const { service, species } = setup();
    (species.findOneBy as ReturnType<typeof vi.fn>).mockResolvedValue({ species_id: 1 });
    (species.delete as ReturnType<typeof vi.fn>).mockRejectedValue({
      driverError: { code: "ER_ROW_IS_REFERENCED_2" },
    });
    await expect(service.removeSpecies(1)).rejects.toThrow(
      new ConflictException("Another record still uses this record"),
    );
  });

  it("reports missing species on delete", async () => {
    const { service, species } = setup();
    (species.findOneBy as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(service.removeSpecies(1)).rejects.toThrow(
      new NotFoundException("Species not found"),
    );
  });
});

describe("breed contract", () => {
  it("rejects bad breed names and blanks", async () => {
    const { service } = setup();
    await expect(
      service.updateBreed(1, { breed_name: "x".repeat(101) }),
    ).rejects.toThrow(
      new BadRequestException("breed_name must contain 1 to 100 characters"),
    );
  });

  it("rejects empty patches", async () => {
    const { service } = setup();
    await expect(service.updateBreed(1, {})).rejects.toThrow(
      new BadRequestException("No valid fields to update"),
    );
  });

  it("verifies the species before reassigning", async () => {
    const { service, species } = setup();
    await expect(service.updateBreed(1, { species_id: 42 })).rejects.toThrow(
      new NotFoundException("Species not found"),
    );
    expect(species.findOneBy).toHaveBeenCalledWith({ species_id: 42 });
  });

  it("applies only allowed patch fields", async () => {
    const { service, breed } = setup();
    (breed.findOne as ReturnType<typeof vi.fn>).mockImplementation(
      async () => ({ breed_id: 1, breed_name: "Mixed", species_id: 3 }),
    );
    await service.updateBreed(1, { breed_name: " Shiba " });
    expect(breed.update).toHaveBeenCalledWith(1, { breed_name: "Shiba" });
  });
});

describe("animal contract", () => {
  it("reports missing animals", async () => {
    const { service, animal } = setup();
    (animal.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(service.findOne(7)).rejects.toThrow(
      new NotFoundException("Animal not found"),
    );
  });

  it("passes the update through unvalidated (current behavior, pinned until V6)", async () => {
    const { service, animal } = setup();
    (animal.findOne as ReturnType<typeof vi.fn>).mockResolvedValue({ animal_id: 7 });
    await service.update(7, { color: "white" });
    expect(animal.update).toHaveBeenCalledWith(7, { color: "white" });
  });

  it("deletes by entity after a confirmed read", async () => {
    const { service, animal } = setup();
    (animal.findOne as ReturnType<typeof vi.fn>).mockResolvedValue({ animal_id: 7 });
    await service.remove(7);
    expect(animal.findOne).toHaveBeenCalledWith({
      where: { animal_id: 7 },
      relations: { breed: true },
    });
    expect(animal.remove).toHaveBeenCalledWith({ animal_id: 7 });
  });
});
