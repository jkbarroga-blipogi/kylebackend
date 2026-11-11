import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { z } from 'zod';

export const VALID_ROLES = ['admin', 'master', 'staff', 'volunteer', 'user'] as const;
export type Role = (typeof VALID_ROLES)[number];
const ROLES = 'barroga.roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);
export const actorSchema = z.object({ userId: z.number().int().positive(), username: z.string().min(1), role: z.string().min(1) });
export type AuthenticatedRequest = { user: z.infer<typeof actorSchema> };

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const parsed = actorSchema.safeParse(context.switchToHttp().getRequest<{ user?: unknown }>().user);
    if (!parsed.success) throw new UnauthorizedException();
    const roles = this.reflector.getAllAndOverride<readonly string[]>(ROLES, [context.getHandler(), context.getClass()]);
    if (!roles?.includes(parsed.data.role)) throw new ForbiddenException('Your account does not have access to this action');
    return true;
  }
}
