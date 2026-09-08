import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { RecipeCategoriesService } from './recipe-categories.service';
import type { CreateRecipeCategoryInput, UpdateRecipeCategoryInput } from './recipe-categories.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('recipe-categories')
export class RecipeCategoriesController {
  constructor(private categoriesService: RecipeCategoriesService) {}

  @Get()
  getCategories() {
    return this.categoriesService.getCategories();
  }

  @Post()
  createCategory(@Body() body: CreateRecipeCategoryInput) {
    return this.categoriesService.createCategory(body);
  }

  @Patch(':id')
  updateCategory(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateRecipeCategoryInput) {
    return this.categoriesService.updateCategory(id, body);
  }

  @Delete(':id')
  deleteCategory(@Param('id', ParseIntPipe) id: number) {
    return this.categoriesService.deleteCategory(id);
  }
}
