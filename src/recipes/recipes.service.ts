import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Recipe } from './recipe.entity';

export interface CreateRecipeInput {
  product: string;
  sizeId: string;
  sizeNameBengali: string;
  sizeNameEnglish: string;
  woodKg: string;
  boardSheet: string;
  screwAndHinges: string;
  polyBagType: string;
  polyBagQuantity: string;
  frameMakingRate: string;
  boardFittingRate: string;
  packagingRate: string;
}

export type UpdateRecipeInput = Partial<CreateRecipeInput>;

@Injectable()
export class RecipesService {
  constructor(
    @InjectRepository(Recipe)
    private recipeRepository: Repository<Recipe>,
  ) {}

  getRecipes() {
    return this.recipeRepository.find();
  }

  async getRecipeById(id: number) {
    const recipe = await this.recipeRepository.findOneBy({ id });
    if (!recipe) {
      throw new NotFoundException(`Recipe #${id} not found`);
    }
    return recipe;
  }

  createRecipe(data: CreateRecipeInput) {
    const recipe = this.recipeRepository.create(data);
    return this.recipeRepository.save(recipe);
  }

  async updateRecipe(id: number, data: UpdateRecipeInput) {
    const recipe = await this.getRecipeById(id);
    Object.assign(recipe, data);
    return this.recipeRepository.save(recipe);
  }

  async deleteRecipe(id: number) {
    const recipe = await this.getRecipeById(id);
    await this.recipeRepository.remove(recipe);
    return { deleted: true };
  }
}
