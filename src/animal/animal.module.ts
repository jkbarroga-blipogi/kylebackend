import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AnimalService } from './animal.service';
import { AnimalController } from './animal.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [AnimalController],
  providers: [AnimalService],
})
export class AnimalModule {}
