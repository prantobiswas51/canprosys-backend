import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RecipesController } from './recipes.controller';
import { RecipesService } from './recipes.service';
import { RecipeCategoriesController } from './recipe-categories.controller';
import { RecipeCategoriesService } from './recipe-categories.service';
import { Recipe } from './recipe.entity';
import { RecipeTaskRate } from './recipe-task-rate.entity';
import { RecipeMaterialUsage } from './recipe-material-usage.entity';
import { RecipeStageStock } from './recipe-stage-stock.entity';
import { RecipeCategory } from './recipe-category.entity';
import { Task } from '../tasks/task.entity';
import { RawMaterial } from '../raw-materials/raw-material.entity';
import { MaterialBatchesModule } from '../material-batches/material-batches.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Recipe,
      RecipeTaskRate,
      RecipeMaterialUsage,
      RecipeStageStock,
      RecipeCategory,
      Task,
      RawMaterial,
    ]),
    MaterialBatchesModule,
  ],
  controllers: [RecipesController, RecipeCategoriesController],
  providers: [RecipesService, RecipeCategoriesService],
  exports: [RecipesService],
})
export class RecipesModule {}
