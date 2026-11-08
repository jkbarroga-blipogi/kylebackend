import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { CategoryModule } from './category/category.module';
import { AnimalModule } from './animal/animal.module';
import { ShelterModule } from './shelter/shelter.module';
import { AdopterModule } from './adopter/adopter.module';

@Module({
  imports: [
    DatabaseModule,
    UsersModule,
    AuthModule,
    CategoryModule,
    AnimalModule,
    ShelterModule,
    AdopterModule,
  ],
})
export class AppModule {}
