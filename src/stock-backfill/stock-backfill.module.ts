import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StockBackfillController } from './stock-backfill.controller';
import { StockBackfillService } from './stock-backfill.service';
import { RecipeStageStock } from '../recipes/recipe-stage-stock.entity';
import { Product } from '../products/product.entity';
import { RecipesModule } from '../recipes/recipes.module';

// TEMPORARY module -- see StockBackfillService for why this exists. Safe to
// delete this whole folder (and its app.module.ts import/route/sidebar
// entry) once it's no longer needed.
@Module({
  imports: [TypeOrmModule.forFeature([RecipeStageStock, Product]), RecipesModule],
  controllers: [StockBackfillController],
  providers: [StockBackfillService],
})
export class StockBackfillModule {}
