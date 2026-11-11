import * as dotenv from 'dotenv';
dotenv.config();

import 'reflect-metadata';
import { createConfiguredApp } from './bootstrap';

type ExpressHandler = (req: unknown, res: unknown) => unknown;

export function createServerlessHandler(
  bootstrap: () => Promise<ExpressHandler> = async () => {
    const app = await createConfiguredApp();
    await app.init();
    return app.getHttpAdapter().getInstance() as ExpressHandler;
  },
) {
  let cached: Promise<ExpressHandler> | null = null;
  return async (req: unknown, res: unknown) => {
    if (!cached) {
      cached = bootstrap().catch((error) => {
        cached = null;
        throw error;
      });
    }
    const instance = await cached;
    return instance(req, res);
  };
}

export default createServerlessHandler();
