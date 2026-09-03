import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { Recipe } from './recipe.entity';
import { RecipeTaskRate } from './recipe-task-rate.entity';
import { RecipeMaterialUsage } from './recipe-material-usage.entity';
import { Task } from '../tasks/task.entity';
import { RawMaterial } from '../raw-materials/raw-material.entity';
import { MaterialBatchesService } from '../material-batches/material-batches.service';
import { round } from '../common/round';
import { isUniqueViolation } from '../common/is-unique-violation';

export interface RecipeCostBreakdown {
  materialCost: number;
  laborCost: number;
  unitCost: number;
}

export interface RecipeTaskRateInput {
  taskId: number;
  rate: number;
}

export interface RecipeMaterialUsageInput {
  rawMaterialId: number;
  quantity: number;
}

export interface CreateRecipeInput {
  product: string;
  sku: string;
  taskRates: RecipeTaskRateInput[];
  materialUsages: RecipeMaterialUsageInput[];
}

export type UpdateRecipeInput = Partial<CreateRecipeInput>;

const RELATIONS = ['taskRates', 'materialUsages'];

@Injectable()
export class RecipesService {
  constructor(
    @InjectRepository(Recipe)
    private recipeRepository: Repository<Recipe>,
    @InjectRepository(Task)
    private taskRepository: Repository<Task>,
    @InjectRepository(RawMaterial)
    private rawMaterialRepository: Repository<RawMaterial>,
    private materialBatchesService: MaterialBatchesService,
  ) {}

  getRecipes() {
    return this.recipeRepository.find({ relations: RELATIONS });
  }

  async getRecipeById(id: number) {
    const recipe = await this.recipeRepository.findOne({
      where: { id },
      relations: RELATIONS,
    });
    if (!recipe) {
      throw new NotFoundException(`Recipe #${id} not found`);
    }
    return recipe;
  }

  // Recipe.sku doubles as Product.sku (see daily-entry.service.ts), so this
  // is how anything costing a finished product finds its recipe. Null, not
  // a throw, if no recipe uses that SKU -- callers treat that as "can't
  // price this one, fall back to whatever's already stored".
  getRecipeBySku(sku: string) {
    return this.recipeRepository.findOne({ where: { sku }, relations: RELATIONS });
  }

  // Case-insensitive partial match on product name OR sku -- how the AI
  // assistant (and anything else that only has a rough name, not an exact
  // SKU) finds the right recipe. "canvas" matches "Canvas 3x4", sku "3x4wb"
  // matches itself.
  async searchRecipes(query: string) {
    const trimmed = query.trim();
    if (!trimmed) return this.getRecipes();
    return this.recipeRepository
      .createQueryBuilder('recipe')
      .leftJoinAndSelect('recipe.taskRates', 'taskRates')
      .leftJoinAndSelect('recipe.materialUsages', 'materialUsages')
      .where('recipe.product ILIKE :q OR recipe.sku ILIKE :q', { q: `%${trimmed}%` })
      .getMany();
  }

  // Cost to produce one unit of this recipe's output, straight from its
  // setup: materialCost is each BOM line's quantity-per-unit times that
  // material's current average stock price, laborCost is just the sum of
  // its Artisan Wages rates (already flat per-unit figures, not tied to any
  // one employee -- same philosophy as wood-processing wages). No actual
  // consumption/payout records involved, so this reflects "what would the
  // next unit cost right now", not what a specific past batch actually cost.
  async computeUnitCost(recipe: Recipe): Promise<RecipeCostBreakdown> {
    let materialCost = 0;
    for (const usage of recipe.materialUsages ?? []) {
      const unitPrice = await this.materialBatchesService.getAverageUnitPrice(usage.rawMaterialId);
      materialCost += usage.quantity * unitPrice;
    }
    const laborCost = (recipe.taskRates ?? []).reduce((sum, tr) => sum + tr.rate, 0);
    materialCost = round(materialCost);
    const roundedLabor = round(laborCost);
    return {
      materialCost,
      laborCost: roundedLabor,
      unitCost: round(materialCost + roundedLabor),
    };
  }

  async createRecipe(data: CreateRecipeInput) {
    const { taskRates, materialUsages, ...recipeFields } = data;

    // Fail fast, before writing anything -- every id in either pivot list
    // has to actually exist.
    await this.assertTasksExist(taskRates);
    await this.assertRawMaterialsExist(materialUsages);

    return this.recipeRepository.manager.transaction(async (manager) => {
      const recipe = manager.create(Recipe, recipeFields);
      const saved = await this.saveRecipe(manager, recipe);
      await this.replaceTaskRates(manager, saved.id, taskRates ?? []);
      await this.replaceMaterialUsages(manager, saved.id, materialUsages ?? []);
      return this.findWithRelations(manager, saved.id);
    });
  }

  async updateRecipe(id: number, data: UpdateRecipeInput) {
    const recipe = await this.getRecipeById(id);
    const { taskRates, materialUsages, ...recipeFields } = data;

    if (taskRates) {
      await this.assertTasksExist(taskRates);
    }
    if (materialUsages) {
      await this.assertRawMaterialsExist(materialUsages);
    }

    Object.assign(recipe, recipeFields);

    return this.recipeRepository.manager.transaction(async (manager) => {
      const saved = await this.saveRecipe(manager, recipe);
      if (taskRates) {
        await this.replaceTaskRates(manager, saved.id, taskRates);
      }
      if (materialUsages) {
        await this.replaceMaterialUsages(manager, saved.id, materialUsages);
      }
      return this.findWithRelations(manager, saved.id);
    });
  }

  async deleteRecipe(id: number) {
    const recipe = await this.getRecipeById(id);
    await this.recipeRepository.remove(recipe);
    return { deleted: true };
  }

  private findWithRelations(manager: EntityManager, id: number) {
    return manager.findOne(Recipe, { where: { id }, relations: RELATIONS });
  }

  private async assertTasksExist(taskRates?: RecipeTaskRateInput[]) {
    if (!taskRates || taskRates.length === 0) return;
    const taskIds = taskRates.map((t) => t.taskId);
    const found = await this.taskRepository.findBy({ id: In(taskIds) });
    if (found.length !== new Set(taskIds).size) {
      const foundIds = new Set(found.map((t) => t.id));
      const missing = taskIds.filter((id) => !foundIds.has(id));
      throw new BadRequestException(`Task(s) not found: ${missing.join(', ')}`);
    }
  }

  private async assertRawMaterialsExist(materialUsages?: RecipeMaterialUsageInput[]) {
    if (!materialUsages || materialUsages.length === 0) return;
    const rawMaterialIds = materialUsages.map((m) => m.rawMaterialId);
    const found = await this.rawMaterialRepository.findBy({ id: In(rawMaterialIds) });
    if (found.length !== new Set(rawMaterialIds).size) {
      const foundIds = new Set(found.map((m) => m.id));
      const missing = rawMaterialIds.filter((id) => !foundIds.has(id));
      throw new BadRequestException(`Raw material(s) not found: ${missing.join(', ')}`);
    }
  }

  // Simplest correct way to sync a "recipe uses these tasks at these rates"
  // set: wipe whatever was there for this recipe and re-insert the given
  // list, inside the same transaction as the recipe save. Avoids TypeORM's
  // cascade/orphan-removal edge cases for array relations.
  private async replaceTaskRates(manager: EntityManager, recipeId: number, taskRates: RecipeTaskRateInput[]) {
    await manager.delete(RecipeTaskRate, { recipeId });
    if (taskRates.length === 0) return;

    const tasks = await manager.findBy(Task, { id: In(taskRates.map((t) => t.taskId)) });
    const taskById = new Map(tasks.map((t) => [t.id, t]));

    for (const tr of taskRates) {
      const task = taskById.get(tr.taskId);
      if (!task) continue; // already validated in assertTasksExist; defensive only
      const row = manager.create(RecipeTaskRate, {
        recipeId,
        taskId: task.id,
        taskName: task.name,
        rate: tr.rate,
      });
      await manager.save(row);
    }
  }

  // Same replace-all approach as replaceTaskRates, for the BOM pivot.
  private async replaceMaterialUsages(
    manager: EntityManager,
    recipeId: number,
    materialUsages: RecipeMaterialUsageInput[],
  ) {
    await manager.delete(RecipeMaterialUsage, { recipeId });
    if (materialUsages.length === 0) return;

    const rawMaterials = await manager.findBy(RawMaterial, {
      id: In(materialUsages.map((m) => m.rawMaterialId)),
    });
    const rawMaterialById = new Map(rawMaterials.map((m) => [m.id, m]));

    for (const mu of materialUsages) {
      const rawMaterial = rawMaterialById.get(mu.rawMaterialId);
      if (!rawMaterial) continue; // already validated in assertRawMaterialsExist; defensive only
      const row = manager.create(RecipeMaterialUsage, {
        recipeId,
        rawMaterialId: rawMaterial.id,
        rawMaterialName: rawMaterial.name,
        rawMaterialUnit: rawMaterial.unit,
        quantity: mu.quantity,
      });
      await manager.save(row);
    }
  }

  // Postgres unique-violation (SKU already exists) surfaces as a raw
  // QueryFailedError, which NestJS's default filter turns into an opaque
  // 500 "Internal server error" -- no usable message. Catch it here and
  // rethrow as a proper 409 with a message the frontend can actually show.
  private async saveRecipe(manager: EntityManager, recipe: Recipe) {
    try {
      return await manager.save(recipe);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(`SKU "${recipe.sku}" is already in use by another recipe.`);
      }
      throw err;
    }
  }

}
