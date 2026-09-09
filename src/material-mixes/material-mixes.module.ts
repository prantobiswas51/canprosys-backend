import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MaterialMixesController } from './material-mixes.controller';
import { MaterialMixesService } from './material-mixes.service';
import { MaterialMix } from './material-mix.entity';
import { MixRecipesController } from './mix-recipes.controller';
import { MixRecipesService } from './mix-recipes.service';
import { MixRecipe } from './mix-recipe.entity';
import { MaterialBatch } from '../material-batches/material-batch.entity';
import { RawMaterialsModule } from '../raw-materials/raw-materials.module';
import { MaterialConsumptionsModule } from '../material-consumptions/material-consumptions.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([MaterialMix, MaterialBatch, MixRecipe]),
    RawMaterialsModule,
    MaterialConsumptionsModule,
  ],
  controllers: [MaterialMixesController, MixRecipesController],
  providers: [MaterialMixesService, MixRecipesService],
  // Exported so MaterialBatchesModule can auto-run a mix right after a
  // purchase batch is recorded -- see MaterialBatchesService.createBatch.
  exports: [MaterialMixesService, MixRecipesService],
})
export class MaterialMixesModule {}
