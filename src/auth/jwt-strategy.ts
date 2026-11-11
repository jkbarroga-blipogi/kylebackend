import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-jwt';
import { z } from 'zod';
import { UsersService } from '../users/users.service';
import { accessTokenSecret } from '../config/env';

const claimsSchema = z.object({
  sub: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  token_use: z.literal('access').optional(),
});
const accountSchema = z.object({
  id: z.number().int().positive(),
  username: z.string().min(1),
  role: z.string().min(1),
});

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly users: UsersService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: accessTokenSecret(),
    });
  }

  async validate(payload: unknown) {
    const claims = claimsSchema.safeParse(payload);
    if (!claims.success) throw new UnauthorizedException();
    const account = accountSchema.safeParse(await this.users.findById(claims.data.sub));
    if (!account.success) throw new UnauthorizedException();
    return {
      userId: account.data.id,
      username: account.data.username,
      role: account.data.role,
    };
  }
}
