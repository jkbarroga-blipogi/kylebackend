import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { AppModule } from './app.module';
import { corsOrigins, validateEnvironment } from './config/env';
import { securityHeaders } from './common/http/security-headers';

export async function createConfiguredApp(): Promise<NestExpressApplication> {
  validateEnvironment();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });

  app.disable('x-powered-by');
  app.use(securityHeaders);
  app.useBodyParser('json', { limit: '3mb' });
  app.useBodyParser('urlencoded', { limit: '100kb', extended: true });

  const origins = corsOrigins();
  app.enableCors(
    origins
      ? {
          origin: origins,
          methods: ['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
          allowedHeaders: ['Content-Type', 'Authorization'],
        }
      : undefined,
  );

  app.getHttpAdapter().getInstance().get('/', (_req: Request, res: Response) => {
    res.send({ message: 'Server Running Successfully!' });
  });

  return app;
}
