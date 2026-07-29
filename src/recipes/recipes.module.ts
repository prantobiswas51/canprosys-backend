import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RecipesController } from './recipes.controller';
import { RecipesService } from './recipes.service';
import { Recipe } from './recipe.entity';
import { RecipeTaskRate } from './recipe-task-rate.entity';
import { RecipeMaterialUsage } from './recipe-material-usage.entity';
import { Task } from '../tasks/task.entity';
import { RawMaterial } from '../raw-materials/raw-material.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Recipe, RecipeTaskRate, RecipeMaterialUsage, Task, RawMaterial])],
  controllers: [RecipesController],
  providers: [RecipesService],
})
export class RecipesModule {}
