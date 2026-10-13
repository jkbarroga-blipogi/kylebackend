import * as dotenv from 'dotenv';
dotenv.config();

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const port = Number(process.env.PORT) || 3000;

  app.enableCors();

  app.getHttpAdapter().get('/', (req, res) =>
    res.send({ message: 'Server Running Successfully!' }),
  );

  await app.listen(port, '0.0.0.0');

  console.log(`Server listening on http://localhost:${port}`);
}

bootstrap();