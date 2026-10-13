import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Animal } from './animal.entity';
import { Breed } from './breed.entity';
import { Species } from './species.entity';
import { AnimalService } from './animal.service';
import { AnimalController } from './animal.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Animal, Breed, Species])],
  controllers: [AnimalController],
  providers: [AnimalService],
})
export class AnimalModule {}