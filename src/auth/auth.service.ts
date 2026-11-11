import { Injectable, Optional, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { UsersService } from '../users/users.service';
import { refreshTokenSecret, refreshTokenTtlSeconds } from '../config/env';
import { LoginThrottle } from './login-throttle';

type AuthenticatedUser = { id: number; username: string; role: string };

const DUMMY_PASSWORD_HASH = bcrypt.hashSync('barroga-timing-equalizer-placeholder', 10);

const refreshClaimsSchema = z.object({
  sub: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  token_use: z.literal('refresh'),
});

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class AuthService {
  private readonly throttle: LoginThrottle;

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    @Optional() throttle?: LoginThrottle,
  ) {
    this.throttle = throttle ?? new LoginThrottle();
  }

  async validateUser(identifier: string, pass: string): Promise<AuthenticatedUser | null> {
    const user = await this.usersService.findByIdentifier(identifier);
    const targetHash = typeof user?.password === 'string' ? user.password : DUMMY_PASSWORD_HASH;
    const valid = await bcrypt.compare(pass, targetHash);

    if (!user || !valid) {
      return null;
    }

    return {
      id: user.id,
      username: user.username,
      role: user.role,
    };
  }

  async authenticate(identifier: string, pass: string) {
    this.throttle.assertAllowed(identifier);
    const user = await this.validateUser(identifier, pass);
    if (!user) {
      this.throttle.recordFailure(identifier);
      throw new UnauthorizedException('Invalid credentials');
    }
    this.throttle.clear(identifier);
    return this.login(user);
  }

  async login(user: AuthenticatedUser) {
    return this.issueTokens(user);
  }

  async logout(userId: number) {
    await this.usersService.setRefreshToken(userId, null);
    return { ok: true };
  }

  async refreshTokens(refreshToken: string) {
    try {
      const verified = this.jwtService.verify<Record<string, unknown>>(refreshToken, {
        secret: refreshTokenSecret(),
      });
      const claims = refreshClaimsSchema.safeParse(verified);
      if (!claims.success) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const found = await this.usersService.findByRefreshToken(hashRefreshToken(refreshToken));
      if (!found || found.id !== claims.data.sub) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      return this.issueTokens({
        id: found.id,
        username: found.username,
        role: found.role,
      });
    } catch {
      throw new UnauthorizedException('Could not refresh tokens');
    }
  }

  private async issueTokens(user: AuthenticatedUser) {
    const basePayload = {
      sub: user.id,
      username: user.username,
      role: user.role,
    };

    const accessToken = this.jwtService.sign({ ...basePayload, token_use: 'access' });
    const refreshToken = this.jwtService.sign(
      { ...basePayload, token_use: 'refresh', jti: randomUUID() },
      {
        secret: refreshTokenSecret(),
        expiresIn: refreshTokenTtlSeconds(),
      },
    );

    await this.usersService.setRefreshToken(user.id, hashRefreshToken(refreshToken));

    return { accessToken, refreshToken };
  }
}
