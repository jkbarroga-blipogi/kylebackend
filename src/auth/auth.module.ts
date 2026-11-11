import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './jwt-strategy';
import { LoginThrottle } from './login-throttle';
import { accessTokenSecret, accessTokenTtlSeconds } from '../config/env';

@Module({
  imports: [
    UsersModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: accessTokenSecret(),
        signOptions: {
          expiresIn: accessTokenTtlSeconds(),
        },
      }),
    }),
  ],
  providers: [AuthService, JwtStrategy, LoginThrottle],
  controllers: [AuthController],
})
export class AuthModule {}
