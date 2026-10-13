import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { CategoryModule } from './category/category.module';
import { AnimalModule } from './animal/animal.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'mysql',
      host: process.env.DB_HOST || 'mysql-29d2b153-gbox-dae0.k.aivencloud.com',
      port: Number(process.env.DB_PORT) || 19730,
      username: process.env.DB_USER || 'avnadmin',
      password: process.env.DB_PASSWORD || 'AVNS_7Mv8ayKCHYuS8WwI__S',
      database: process.env.DB_NAME || 'defaultdb',
      autoLoadEntities: true,
      synchronize: false,
      ssl: {
        rejectUnauthorized: false,
      },
    }),
    UsersModule,
    AuthModule,
    CategoryModule,
    AnimalModule,
  ],
})
export class AppModule {}