import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { MixRecipesService } from './mix-recipes.service';
import type { CreateMixRecipeInput, UpdateMixRecipeInput } from './mix-recipes.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('mix-recipes')
export class MixRecipesController {
  constructor(private mixRecipesService: MixRecipesService) {}

  @Get()
  getMixRecipes() {
    return this.mixRecipesService.getMixRecipes();
  }

  @Post()
  createMixRecipe(@Body() body: CreateMixRecipeInput) {
    return this.mixRecipesService.createMixRecipe(body);
  }

  @Patch(':id')
  updateMixRecipe(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateMixRecipeInput) {
    return this.mixRecipesService.updateMixRecipe(id, body);
  }

  @Delete(':id')
  deleteMixRecipe(@Param('id', ParseIntPipe) id: number) {
    return this.mixRecipesService.deleteMixRecipe(id);
  }
}
