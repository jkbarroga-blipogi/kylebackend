import { Injectable, NotFoundException } from '@nestjs/common';
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

  // ================= SPECIES METHODS =================
  createSpecies(data: Partial<Species>) {
    const species = this.speciesRepo.create(data);
    return this.speciesRepo.save(species);
  }

  findAllSpecies() {
    return this.speciesRepo.find();
  }

  createBreed(data: Partial<Breed>) {
    const breed = this.breedRepo.create(data);
    return this.breedRepo.save(breed);
  }

  findAllBreeds() {
    return this.breedRepo.find({
      relations: { species: true },
    });
  }

  create(data: Partial<Animal>) {
    const animal = this.animalRepo.create(data);
    return this.animalRepo.save(animal);
  }

  findAll() {
    return this.animalRepo.find({
      relations: { breed: true },
    });
  }

  async findOne(id: number) {
    const item = await this.animalRepo.findOne({
      where: { animal_id: id },
      relations: { breed: true },
    });
    if (!item) throw new NotFoundException('Animal not found');
    return item;
  }

  async update(id: number, data: Partial<Animal>) {
    await this.animalRepo.update(id, data);
    return this.findOne(id);
  }

  async remove(id: number) {
    const animal = await this.findOne(id);
    return this.animalRepo.remove(animal);
  }
}