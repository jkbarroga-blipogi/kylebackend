import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { parseLogin, parseRegistration, parseRefresh } from './auth.validation';
import type { AuthenticatedRequest } from './roles.guard';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
  ) {}

  @Post('register')
  async register(@Body() input: unknown) {
    const body = parseRegistration(input);
    return this.usersService.createUser(body.username, body.password, body.email);
  }

  @Post('login')
  async login(@Body() input: unknown) {
    const body = parseLogin(input);
    return this.authService.authenticate(body.username, body.password);
  }

  // Logout clears only the caller's own refresh token. The identity
  // comes from the JWT; the request body is never trusted for it.
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  async logout(@Request() req: AuthenticatedRequest) {
    return this.authService.logout(req.user.userId);
  }

  @Post('refresh')
  async refresh(@Body() input: unknown) {
    const body = parseRefresh(input);
    return this.authService.refreshTokens(body.refreshToken);
  }
}
