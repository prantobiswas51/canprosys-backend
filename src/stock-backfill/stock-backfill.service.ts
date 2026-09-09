import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RecipeStageStock } from '../recipes/recipe-stage-stock.entity';
import { Product } from '../products/product.entity';
import { RecipesService } from '../recipes/recipes.service';
import { round } from '../common/round';

// TEMPORARY admin tool -- lets an existing WIP count (pieces already
// sitting at some stage, or already-finished stock) be entered directly
// when this system is introduced after production already had stock
// mid-pipeline. Bypasses the normal Daily Entry flow entirely (no artisan,
// no consuming from the previous stage, no payout) since this isn't new
// work being logged, just an existing count being recorded. Purely additive
// -- always adds to whatever's already on record, never overwrites or
// deducts anything, so it's a plain top-up regardless of what else has
// touched that stock in the meantime. Delete this module (and its
// route/page) once every recipe's real starting stock has been entered.
@Injectable()
export class StockBackfillService {
  constructor(
    @InjectRepository(RecipeStageStock) private stageStockRepository: Repository<RecipeStageStock>,
    @InjectRepository(Product) private productRepository: Repository<Product>,
    private recipesService: RecipesService,
  ) {}

  async addStageStock(recipeId: number, taskId: number, quantity: number) {
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new BadRequestException('Quantity must be greater than zero');
    }
    const recipe = await this.recipesService.getRecipeById(recipeId);
    const taskRate = (recipe.taskRates ?? []).find((tr) => tr.taskId === taskId);
    if (!taskRate) {
      throw new BadRequestException(`That task isn't one of recipe "${recipe.product}"'s configured tasks.`);
    }

    let row = await this.stageStockRepository.findOneBy({ recipeId, taskId });
    if (!row) {
      row = this.stageStockRepository.create({
        recipeId,
        taskId,
        taskName: taskRate.taskName,
        quantity: 0,
      });
    }
    row.quantity = round(row.quantity + quantity);
    return this.stageStockRepository.save(row);
  }

  async addFinishedStock(recipeId: number, quantity: number) {
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new BadRequestException('Quantity must be greater than zero');
    }
    const recipe = await this.recipesService.getRecipeById(recipeId);
    if (!recipe.sku) {
      throw new BadRequestException(`Recipe "${recipe.product}" has no SKU set -- add one first.`);
    }

    let product = await this.productRepository.findOneBy({ sku: recipe.sku });
    if (!product) {
      const { unitCost } = await this.recipesService.computeUnitCost(recipe);
      product = this.productRepository.create({
        name: recipe.product,
        sku: recipe.sku,
        costPrice: unitCost,
        stock: 0,
      });
    }
    product.stock = round(product.stock + quantity);
    return this.productRepository.save(product);
  }
}
