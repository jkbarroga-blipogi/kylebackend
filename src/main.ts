import * as dotenv from 'dotenv';
dotenv.config();

import 'reflect-metadata';
import { createConfiguredApp } from './bootstrap';

async function bootstrap() {
  const app = await createConfiguredApp();
  const port = Number(process.env.PORT) || 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`Server listening on http://localhost:${port}`);
}

bootstrap();
