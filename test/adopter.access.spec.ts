import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Module } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PassportModule } from '@nestjs/passport';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'node:crypto';
import { AnimalController } from '../src/animal/animal.controller';
import { AnimalService } from '../src/animal/animal.service';
import { ShelterController } from '../src/shelter/shelter.controller';
import { ShelterService } from '../src/shelter/shelter.service';
import { UsersController } from '../src/users/users.controller';
import { UsersService } from '../src/users/users.service';
import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';
import { AdopterController } from '../src/adopter/adopter.controller';
import { AdopterService } from '../src/adopter/adopter.service';
import { RolesGuard } from '../src/auth/roles.guard';
import { JwtStrategy } from '../src/auth/jwt-strategy';

const roles = ['admin', 'staff', 'volunteer', 'user', 'unknown'];
const users = {
  findById: vi.fn(async (id: number) => id > 0 && id <= roles.length ? { id, username: `account-${id}`, role: roles[id - 1] } : undefined),
  getAll: vi.fn(async () => []), createUser: vi.fn(async (username: string) => ({ id: 6, username, role: 'user' })),
  updateUser: vi.fn(async (id: number, body: { role?: string }) => ({ id, username: `account-${id}`, role: body.role || 'user' })),
};
const animals = { findAll: vi.fn(async () => []), findAllSpecies: vi.fn(async () => []), findAllBreeds: vi.fn(async () => []) };
const shelter = { findAll: vi.fn(async () => []), create: vi.fn(async () => ({ staff_id: 8 })) };
const adopter = {
  listAnimals: vi.fn(async () => []), listApplications: vi.fn(async () => []),
  getApplication: vi.fn(async () => ({})), getProfile: vi.fn(async () => null),
  createApplication: vi.fn(async () => ({ application_id: 8 })),
};
let app: INestApplication;
let origin: string;
let jwt: JwtService;

// Vitest's transformer omits constructor metadata. These match the production constructors.
for (const [controller, dependencies] of [
  [AnimalController, [AnimalService]], [ShelterController, [ShelterService]],
  [UsersController, [UsersService]],
  [AuthController, [AuthService, UsersService]], [AdopterController, [AdopterService]],
] as const) Reflect.defineMetadata('design:paramtypes', dependencies, controller);

class AccessTestModule {}
Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
  controllers: [AnimalController, ShelterController, UsersController, AuthController, AdopterController],
  providers: [
    RolesGuard,
    { provide: UsersService, useValue: users }, { provide: AnimalService, useValue: animals },
    { provide: ShelterService, useValue: shelter },
    { provide: AuthService, useValue: {} }, { provide: AdopterService, useValue: adopter },
    { provide: JwtStrategy, useFactory: () => new JwtStrategy(users as unknown as UsersService) },
  ],
})(AccessTestModule);

beforeAll(async () => {
  const secret = randomBytes(32).toString('hex');
  vi.stubEnv('JWT_ACCESS_TOKEN_SECRET', secret);
  jwt = new JwtService({ secret });
  app = await NestFactory.create(AccessTestModule, { logger: false });
  await app.listen(0, '127.0.0.1');
  origin = await app.getUrl();
});
afterAll(async () => { if (app) await app.close(); vi.unstubAllEnvs(); });

async function request(path: string, id?: number, method = 'GET', body?: unknown, claimedRole?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (id) headers.Authorization = `Bearer ${jwt.sign({ sub: id, username: `account-${id}`, role: claimedRole || roles[id - 1] })}`;
  return fetch(origin + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

describe('HTTP role boundaries for adopter access', () => {
  it('requires authentication and rejects deleted accounts', async () => {
    expect((await request('/adopter/animals')).status).toBe(401);
    expect((await request('/adopter/animals', 999)).status).toBe(401);
  });

  it.each(['/animal', '/species', '/breed', '/users', '/users/1', '/shelter/adopter', '/shelter/staff', '/shelter/adoption-application', '/shelter/medical-record', '/shelter/adoption'])('denies a user direct access to %s', async (path) => {
    expect((await request(path, 4)).status).toBe(403);
  });

  it.each(['/animal', '/species', '/breed', '/shelter/adopter', '/shelter/adoption-application', '/shelter/adoption'])('denies user writes to %s', async (path) => {
    expect((await request(path, 4, 'POST', {})).status).toBe(403);
  });

  it('uses the database role rather than stale privileged token claims', async () => {
    expect((await request('/users', 4, 'GET', undefined, 'admin')).status).toBe(403);
  });

  it('allows scoped adopter reads and passes the verified account ID', async () => {
    expect((await request('/adopter/applications', 4)).status).toBe(200);
    expect(adopter.listApplications).toHaveBeenCalledWith(4);
    expect((await request('/adopter/profile', 4)).status).toBe(200);
    expect(adopter.getProfile).toHaveBeenCalledWith(4);
    expect((await request('/adopter/applications/12', 4)).status).toBe(200);
    expect(adopter.getApplication).toHaveBeenCalledWith(4, 12);
  });

  it('denies adopter routes to staff and unknown roles', async () => {
    expect((await request('/adopter/applications', 2)).status).toBe(403);
    expect((await request('/adopter/applications', 5)).status).toBe(403);
  });

  it('allows volunteer animal reads but denies medical data and writes', async () => {
    expect((await request('/animal', 3)).status).toBe(200);
    expect((await request('/animal', 3, 'POST', {})).status).toBe(403);
    expect((await request('/shelter/medical-record', 3)).status).toBe(403);
  });

  it('allows staff reference reads but reserves staff writes and user directories for admins', async () => {
    expect((await request('/shelter/staff', 2)).status).toBe(200);
    expect((await request('/shelter/staff', 2, 'POST', {})).status).toBe(403);
    expect((await request('/users', 2)).status).toBe(403);
    expect((await request('/users', 1)).status).toBe(200);
    expect((await request('/shelter/staff', 1, 'POST', {})).status).toBe(201);
  });

  it('rejects registration role injection and creates ordinary adopter accounts', async () => {
    expect((await request('/auth/register', undefined, 'POST', { username: 'Ana', password: 'test-password', role: 'admin' })).status).toBe(400);
    const response = await request('/auth/register', undefined, 'POST', { username: ' Ana ', password: 'test-password' });
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ username: 'Ana', role: 'user' });
    expect(users.createUser).toHaveBeenCalledWith('Ana', 'test-password', undefined);
  });

  it('allows admins to update user roles via PUT /users/:id/role and denies non-admins', async () => {
    expect((await request('/users/4/role', 4, 'PUT', { role: 'staff' })).status).toBe(403);
    expect((await request('/users/4/role', 2, 'PUT', { role: 'staff' })).status).toBe(403);
    const response = await request('/users/4/role', 1, 'PUT', { role: 'staff' });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: 4, role: 'staff' });
    expect(users.updateUser).toHaveBeenCalledWith(4, { role: 'staff' }, { id: 1, role: 'admin' });
  });
});
