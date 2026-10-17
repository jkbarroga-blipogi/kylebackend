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
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ShelterService } from './shelter.service';

@Controller('shelter')
@UseGuards(JwtAuthGuard)
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
  ) {
    return this.service.create(resource, body);
  }

  @Put(':resource/:id')
  update(
    @Param('resource') resource: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
  ) {
    return this.service.update(resource, id, body);
  }

  @Delete(':resource/:id')
  remove(
    @Param('resource') resource: string,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.remove(resource, id);
  }
}