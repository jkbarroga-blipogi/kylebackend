import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AdopterController } from './adopter.controller';
import { AdopterService } from './adopter.service';

@Module({ imports: [DatabaseModule], controllers: [AdopterController], providers: [AdopterService] })
export class AdopterModule {}
