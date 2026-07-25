import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { RecipesService } from './recipes.service';
import type { CreateRecipeInput, UpdateRecipeInput } from './recipes.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('recipes')
export class RecipesController {
  constructor(private recipesService: RecipesService) {}

  @Get()
  getRecipes() {
    return this.recipesService.getRecipes();
  }

  @Get(':id')
  getRecipeById(@Param('id', ParseIntPipe) id: number) {
    return this.recipesService.getRecipeById(id);
  }

  @Post()
  createRecipe(@Body() body: CreateRecipeInput) {
    return this.recipesService.createRecipe(body);
  }

  @Patch(':id')
  updateRecipe(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateRecipeInput,
  ) {
    return this.recipesService.updateRecipe(id, body);
  }

  @Delete(':id')
  deleteRecipe(@Param('id', ParseIntPipe) id: number) {
    return this.recipesService.deleteRecipe(id);
  }
}
