import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Animal } from './animal.entity';
import { Breed } from './breed.entity';
import { Species } from './species.entity';

@Injectable()
export class AnimalService {
  constructor(
    @InjectRepository(Animal)
    private readonly animalRepo: Repository<Animal>,

    @InjectRepository(Breed)
    private readonly breedRepo: Repository<Breed>,

    @InjectRepository(Species)
    private readonly speciesRepo: Repository<Species>,
  ) {}

  // Handle duplicate values and foreign-key errors
  private async lookupWrite<T>(action: () => Promise<T>) {
    try {
      return await action();
    } catch (error) {
      const code = (
        error as { driverError?: { code?: string } }
      ).driverError?.code;

      if (code === 'ER_DUP_ENTRY') {
        throw new ConflictException('Duplicate value');
      }

      if (code === 'ER_ROW_IS_REFERENCED_2') {
        throw new ConflictException(
          'Another record still uses this record',
        );
      }

      if (code === 'ER_NO_REFERENCED_ROW_2') {
        throw new BadRequestException(
          'A referenced ID does not exist',
        );
      }

      throw error;
    }
  }

  // ================= SPECIES METHODS =================

  // POST
  createSpecies(data: Partial<Species>) {
    const species = this.speciesRepo.create(data);
    return this.speciesRepo.save(species);
  }

  // GET all
  findAllSpecies() {
    return this.speciesRepo.find();
  }

  // GET by ID
  async findOneSpecies(id: number) {
    if (!Number.isSafeInteger(id) || id <= 0) {
      throw new BadRequestException('Invalid ID');
    }

    const species = await this.speciesRepo.findOneBy({
      species_id: id,
    });

    if (!species) {
      throw new NotFoundException('Species not found');
    }

    return species;
  }

  // PUT
  async updateSpecies(
    id: number,
    data: { species_name: string },
  ) {
    const name = data?.species_name;

    if (
      typeof name !== 'string' ||
      !name.trim() ||
      name.trim().length > 50
    ) {
      throw new BadRequestException(
        'species_name must contain 1 to 50 characters',
      );
    }

    await this.findOneSpecies(id);

    await this.lookupWrite(() =>
      this.speciesRepo.update(id, {
        species_name: name.trim(),
      }),
    );

    return this.findOneSpecies(id);
  }

  // DELETE
  async removeSpecies(id: number) {
    await this.findOneSpecies(id);

    await this.lookupWrite(() =>
      this.speciesRepo.delete(id),
    );

    return {
      deleted: true,
      species_id: id,
    };
  }

  // ================= BREED METHODS =================

  // POST
  createBreed(data: Partial<Breed>) {
    const breed = this.breedRepo.create(data);
    return this.breedRepo.save(breed);
  }

  // GET all
  findAllBreeds() {
    return this.breedRepo.find({
      relations: { species: true },
    });
  }

  // GET by ID
  async findOneBreed(id: number) {
    if (!Number.isSafeInteger(id) || id <= 0) {
      throw new BadRequestException('Invalid ID');
    }

    const breed = await this.breedRepo.findOne({
      where: { breed_id: id },
      relations: { species: true },
    });

    if (!breed) {
      throw new NotFoundException('Breed not found');
    }

    return breed;
  }

  // PUT
  async updateBreed(
    id: number,
    data: {
      breed_name?: string;
      species_id?: number;
    },
  ) {
    const patch: Partial<Breed> = {};

    if (data?.breed_name !== undefined) {
      if (
        typeof data.breed_name !== 'string' ||
        !data.breed_name.trim() ||
        data.breed_name.trim().length > 100
      ) {
        throw new BadRequestException(
          'breed_name must contain 1 to 100 characters',
        );
      }

      patch.breed_name = data.breed_name.trim();
    }

    if (data?.species_id !== undefined) {
      await this.findOneSpecies(data.species_id);
      patch.species_id = data.species_id;
    }

    if (!Object.keys(patch).length) {
      throw new BadRequestException(
        'No valid fields to update',
      );
    }

    await this.findOneBreed(id);

    await this.lookupWrite(() =>
      this.breedRepo.update(id, patch),
    );

    return this.findOneBreed(id);
  }

  // DELETE
  async removeBreed(id: number) {
    await this.findOneBreed(id);

    await this.lookupWrite(() =>
      this.breedRepo.delete(id),
    );

    return {
      deleted: true,
      breed_id: id,
    };
  }

  // ================= ANIMAL METHODS =================

  // POST
  create(data: Partial<Animal>) {
    const animal = this.animalRepo.create(data);
    return this.animalRepo.save(animal);
  }

  // GET all
  findAll() {
    return this.animalRepo.find({
      relations: { breed: true },
    });
  }

  // GET by ID
  async findOne(id: number) {
    const animal = await this.animalRepo.findOne({
      where: { animal_id: id },
      relations: { breed: true },
    });

    if (!animal) {
      throw new NotFoundException('Animal not found');
    }

    return animal;
  }

  // PUT
  async update(id: number, data: Partial<Animal>) {
    await this.animalRepo.update(id, data);
    return this.findOne(id);
  }

  // DELETE
  async remove(id: number) {
    const animal = await this.findOne(id);
    return this.animalRepo.remove(animal);
  }
}