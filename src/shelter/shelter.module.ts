import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { ShelterController } from './shelter.controller';
import { ShelterService } from './shelter.service';

@Module({
  imports: [DatabaseModule],
  controllers: [ShelterController],
  providers: [ShelterService],
})
export class ShelterModule {}