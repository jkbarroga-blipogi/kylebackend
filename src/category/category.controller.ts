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
import { CategoryService } from './category.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';

@Controller('category')
@Roles('admin')
export class CategoryController {
  constructor(private categoryService: CategoryService) {}

  // Get all categories
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get()
  async getAll() {
    return this.categoryService.getAll();
  }

  // Get single category by id
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get(':id')
  async getOne(@Param('id', ParseIntPipe) id: number) {
    return this.categoryService.findById(id);
  }

  // Create a new category
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post()
  async create(@Body() body: { name: string; description?: string }) {
    return this.categoryService.createCategory(body);
  }

  // Update a category
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Put(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { name?: string; description?: string },
  ) {
    return this.categoryService.updateCategory(id, body);
  }

  // Delete a category
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.categoryService.deleteCategory(id);
  }
}
