import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';

import { AnimalService } from './animal.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller()
export class AnimalController {
  constructor(private animalService: AnimalService) {}

  // ================= SPECIES ENDPOINTS =================

  // Get all species (protected)
  @UseGuards(JwtAuthGuard)
  @Get('species')
  async getAllSpecies() {
    return this.animalService.findAllSpecies();
  }

  // Create species (protected / open kung ire-remove ang @UseGuards)
  @UseGuards(JwtAuthGuard)
  @Post('species')
  async createSpecies(@Body() body: any) {
    return this.animalService.createSpecies(body);
  }

  // ================= BREED ENDPOINTS =================

  // Get all breeds (protected)
  @UseGuards(JwtAuthGuard)
  @Get('breed')
  async getAllBreeds() {
    return this.animalService.findAllBreeds();
  }

  // Create breed (protected)
  @UseGuards(JwtAuthGuard)
  @Post('breed')
  async createBreed(@Body() body: any) {
    return this.animalService.createBreed(body);
  }

  // ================= ANIMAL ENDPOINTS =================

  // Get all animals (protected)
  @UseGuards(JwtAuthGuard)
  @Get('animal')
  async getAllAnimals() {
    return this.animalService.findAll();
  }

  // Get single animal by id (protected)
  @UseGuards(JwtAuthGuard)
  @Get('animal/:id')
  async getOneAnimal(@Param('id') id: string) {
    return this.animalService.findOne(+id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('animal')
  async createAnimal(@Body() body: any) {
    return this.animalService.create(body);
  }

  @UseGuards(JwtAuthGuard)
  @Put('animal/:id')
  async updateAnimal(@Param('id') id: string, @Body() body: any) {
    return this.animalService.update(+id, body);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('animal/:id')
  async removeAnimal(@Param('id') id: string) {
    return this.animalService.remove(+id);
  }
}