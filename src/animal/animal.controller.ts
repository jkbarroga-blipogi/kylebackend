import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';

import { AnimalService } from './animal.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';

@Controller()
@Roles('admin', 'staff')
export class AnimalController {
  constructor(private animalService: AnimalService) {}

  // ================= SPECIES ENDPOINTS =================

  // GET all species
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get('species')
  async getAllSpecies() {
    return this.animalService.findAllSpecies();
  }

  // GET species by ID
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get('species/:id')
  async getOneSpecies(@Param('id', ParseIntPipe) id: number) {
    return this.animalService.findOneSpecies(id);
  }

  // POST species
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post('species')
  async createSpecies(@Body() body: { species_name: string }) {
    return this.animalService.createSpecies(body);
  }

  // PUT species
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Put('species/:id')
  async updateSpecies(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { species_name: string },
  ) {
    return this.animalService.updateSpecies(id, body);
  }

  // DELETE species
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Delete('species/:id')
  async removeSpecies(@Param('id', ParseIntPipe) id: number) {
    return this.animalService.removeSpecies(id);
  }

  // ================= BREED ENDPOINTS =================

  // GET all breeds
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get('breed')
  async getAllBreeds() {
    return this.animalService.findAllBreeds();
  }

  // GET breed by ID
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get('breed/:id')
  async getOneBreed(@Param('id', ParseIntPipe) id: number) {
    return this.animalService.findOneBreed(id);
  }

  // POST breed
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post('breed')
  async createBreed(
    @Body() body: { species_id: number; breed_name: string },
  ) {
    return this.animalService.createBreed(body);
  }

  // PUT breed
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Put('breed/:id')
  async updateBreed(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { species_id?: number; breed_name?: string },
  ) {
    return this.animalService.updateBreed(id, body);
  }

  // DELETE breed
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Delete('breed/:id')
  async removeBreed(@Param('id', ParseIntPipe) id: number) {
    return this.animalService.removeBreed(id);
  }

  // ================= ANIMAL ENDPOINTS =================

  // GET all animals
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'staff', 'volunteer')
  @Get('animal')
  async getAllAnimals() {
    return this.animalService.findAll();
  }

  // GET animal by ID
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'staff', 'volunteer')
  @Get('animal/:id')
  async getOneAnimal(@Param('id', ParseIntPipe) id: number) {
    return this.animalService.findOne(id);
  }

  // POST animal
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post('animal')
  async createAnimal(@Body() body: any) {
    return this.animalService.create(body);
  }

  // PUT animal
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Put('animal/:id')
  async updateAnimal(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: any,
  ) {
    return this.animalService.update(id, body);
  }

  // DELETE animal
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Delete('animal/:id')
  async removeAnimal(@Param('id', ParseIntPipe) id: number) {
    return this.animalService.remove(id);
  }
}
