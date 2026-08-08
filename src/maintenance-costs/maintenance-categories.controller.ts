import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { MaintenanceCategoriesService } from './maintenance-categories.service';
import type { CreateMaintenanceCategoryInput } from './maintenance-categories.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('maintenance-categories')
export class MaintenanceCategoriesController {
  constructor(private categoriesService: MaintenanceCategoriesService) {}

  @Get()
  getCategories() {
    return this.categoriesService.getCategories();
  }

  @Post()
  createCategory(@Body() body: CreateMaintenanceCategoryInput) {
    return this.categoriesService.createCategory(body);
  }

  @Delete(':id')
  deleteCategory(@Param('id', ParseIntPipe) id: number) {
    return this.categoriesService.deleteCategory(id);
  }
}
