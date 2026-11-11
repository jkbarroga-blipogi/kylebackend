import {
  Controller,
  Get,
  Put,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
  Request,
} from '@nestjs/common';

import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard, type AuthenticatedRequest } from '../auth/roles.guard';

@Controller('users')
@Roles('admin')
export class UsersController {
  constructor(private usersService: UsersService) {}

  // Get all users (protected)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get()
  async getAll() {
    return this.usersService.getAll();
  }

  // Get single user by id (protected)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get(':id')
  async getOne(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.findById(id);
  }

  // Update user (protected: self or admin only; role changes restricted to admin)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'staff', 'volunteer', 'user')
  @Put(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { username?: string; password?: string; email?: string | null; role?: string },
    @Request() req: AuthenticatedRequest,
  ) {
    return this.usersService.updateUser(
      id,
      body,
      { id: req.user.userId, role: req.user.role },
    );
  }

  // Dedicated admin endpoint to assign a user's role (for example: user -> staff)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Put(':id/role')
  async updateRole(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { role?: string },
    @Request() req: AuthenticatedRequest,
  ) {
    return this.usersService.updateUser(
      id,
      { role: body?.role },
      { id: req.user.userId, role: req.user.role },
    );
  }

  // Delete user (protected)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.deleteUser(id);
  }
}
