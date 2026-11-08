import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  UseGuards,
  Request,
  ForbiddenException,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ShelterService } from './shelter.service';
import { Roles, RolesGuard } from '../auth/roles.guard';
import type { AuthenticatedRequest } from '../auth/roles.guard';

function requireStaffWriteAccess(resource: string, request: AuthenticatedRequest) {
  if (resource === 'staff' && request.user.role !== 'admin') throw new ForbiddenException('Only administrators manage Staff records');
}

@Controller('shelter')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'staff')
export class ShelterController {
  constructor(private readonly service: ShelterService) {}

  @Get(':resource')
  findAll(@Param('resource') resource: string) {
    return this.service.findAll(resource);
  }

  @Get(':resource/:id')
  findOne(
    @Param('resource') resource: string,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.findOne(resource, id);
  }

  @Post(':resource')
  create(
    @Param('resource') resource: string,
    @Body() body: unknown,
    @Request() request: AuthenticatedRequest,
  ) {
    requireStaffWriteAccess(resource, request);
    return this.service.create(resource, body);
  }

  @Put(':resource/:id')
  update(
    @Param('resource') resource: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
    @Request() request: AuthenticatedRequest,
  ) {
    requireStaffWriteAccess(resource, request);
    return this.service.update(resource, id, body);
  }

  @Delete(':resource/:id')
  remove(
    @Param('resource') resource: string,
    @Param('id', ParseIntPipe) id: number,
    @Request() request: AuthenticatedRequest,
  ) {
    requireStaffWriteAccess(resource, request);
    return this.service.remove(resource, id);
  }
}
