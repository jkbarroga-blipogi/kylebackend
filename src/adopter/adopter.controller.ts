import { Body, Controller, Get, Param, ParseIntPipe, Post, Put, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import type { AuthenticatedRequest } from '../auth/roles.guard';
import { AdopterService } from './adopter.service';

@Controller('adopter')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('user')
export class AdopterController {
  constructor(private readonly service: AdopterService) {}

  @Get('animals')
  listAnimals() { return this.service.listAnimals(); }

  @Get('all-animals')
  listAllAnimals() { return this.service.listAllAnimals(); }

  @Get('profile')
  getProfile(@Request() request: AuthenticatedRequest) { return this.service.getProfile(request.user.userId); }

  @Put('profile')
  saveProfile(@Request() request: AuthenticatedRequest, @Body() body: unknown) { return this.service.saveProfile(request.user.userId, body); }

  @Get('applications')
  listApplications(@Request() request: AuthenticatedRequest) { return this.service.listApplications(request.user.userId); }

  @Get('applications/:id')
  getApplication(@Request() request: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number) { return this.service.getApplication(request.user.userId, id); }

  @Post('applications')
  createApplication(@Request() request: AuthenticatedRequest, @Body() body: unknown) { return this.service.createApplication(request.user.userId, body); }
}
