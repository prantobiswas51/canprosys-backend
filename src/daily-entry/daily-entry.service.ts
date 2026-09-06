import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { DailyEntry } from './daily-entry.entity';
import { Task } from '../tasks/task.entity';
import { Employee, EmployeeStatus } from '../employees/employee.entity';
import { Recipe } from '../recipes/recipe.entity';
import { RecipeTaskRate } from '../recipes/recipe-task-rate.entity';
import { RecipeStageStock } from '../recipes/recipe-stage-stock.entity';
import { Product } from '../products/product.entity';
import { Payout } from '../payouts/payout.entity';
import { PayoutsService } from '../payouts/payouts.service';
import { MaterialConsumptionsService } from '../material-consumptions/material-consumptions.service';
import { RecipesService } from '../recipes/recipes.service';
import { round } from '../common/round';

// Historical fallback only -- entries created before per-stage tracking
// existed don't have creditedProductStock set, so reversal still needs this
// to know they credited Product.stock. Nothing in the live create/consume
// path branches on this anymore -- see resolveStagePosition, which decides
// "is this the finished-goods step" purely from where a task sits in the
// recipe's own configured sequence, not from what the task happens to be
// named. That's the whole point: a future task can become the last step of
// some recipe's pipeline without any code change here.
const LEGACY_PACKAGING_SLUG = 'packaging';

interface ResolvedBomConsumption {
  rawMaterialId: number;
  rawMaterialName: string;
  quantity: number;
}

// Where a task sits in its recipe's configured pipeline, resolved fresh
// from RecipeTaskRate.sequence every time an entry is created -- see the
// migration guard below for why every row is guaranteed to have a sequence
// by the time this runs.
interface StagePosition {
  isFirstStage: boolean;
  isLastStage: boolean;
  previousTask?: { id: number; name: string };
}

export interface CreateDailyEntryInput {
  taskId: number;
  employeeIds: number[];
  weightKg: number;
  recipeId?: number;
}

export type UpdateDailyEntryInput = CreateDailyEntryInput;

@Injectable()
export class DailyEntryService {
  constructor(
    @InjectRepository(DailyEntry) private dailyEntryRepo: Repository<DailyEntry>,
    @InjectRepository(Task) private taskRepo: Repository<Task>,
    @InjectRepository(Employee) private employeeRepo: Repository<Employee>,
    @InjectRepository(Recipe) private recipeRepo: Repository<Recipe>,
    @InjectRepository(Product) private productRepo: Repository<Product>,
    @InjectRepository(Payout) private payoutRepo: Repository<Payout>,
    private payoutsService: PayoutsService,
    private materialConsumptionsService: MaterialConsumptionsService,
    private recipesService: RecipesService,
  ) {}

  getEntries() {
    return this.dailyEntryRepo.find({
      relations: ['task', 'employees', 'recipe'],
      order: { createdAt: 'DESC' },
    });
  }

  async createEntry(data: CreateDailyEntryInput) {
    // Everything from here on writes to the DB -- run it as one transaction
    // so a failure partway through (entry save, stock update, or payout
    // generation) can't leave a half-applied result committed.
    return this.dailyEntryRepo.manager.transaction((manager) => this.applyEntry(data, manager));
  }

  // Edit = reverse everything the old entry caused (payouts, product stock,
  // material/wood-stock consumption, stage-stock movement), delete the old
  // row, then apply the new values exactly like a fresh create -- all
  // inside one transaction. Simpler and far less error-prone than trying to
  // diff old vs new values field by field and patch each side effect
  // individually.
  async updateEntry(id: number, data: UpdateDailyEntryInput) {
    return this.dailyEntryRepo.manager.transaction(async (manager) => {
      const entry = await manager.findOne(DailyEntry, {
        where: { id },
        relations: ['task', 'employees', 'recipe'],
      });
      if (!entry) {
        throw new NotFoundException(`Daily entry #${id} not found`);
      }

      await this.reverseEntrySideEffects(entry, manager);
      await manager.delete(DailyEntry, id);

      return this.applyEntry(data, manager);
    });
  }

  async deleteEntry(id: number) {
    return this.dailyEntryRepo.manager.transaction(async (manager) => {
      const entry = await manager.findOne(DailyEntry, {
        where: { id },
        relations: ['task', 'employees', 'recipe'],
      });
      if (!entry) {
        throw new NotFoundException(`Daily entry #${id} not found`);
      }

      await this.reverseEntrySideEffects(entry, manager);
      await manager.delete(DailyEntry, id);

      return { deleted: true };
    });
  }

  // Before any entry can be logged for a recipe, every one of its task
  // rates needs a distinct Step (sequence) number set -- that's what makes
  // "which stage comes before this one" answerable at all. Half-migrated
  // (some steps numbered, some not) or duplicate-numbered recipes are
  // rejected outright rather than guessed at, since a wrong guess here
  // means consuming/crediting the wrong stage's stock silently.
  private assertRecipeIsStageTracked(recipe: Recipe): RecipeTaskRate[] {
    const stageRates = recipe.taskRates ?? [];
    if (stageRates.length === 0) {
      throw new BadRequestException(
        `Recipe "${recipe.product}" has no tasks configured -- add its production steps on the Recipes page first.`,
      );
    }
    const missing = stageRates.filter((tr) => tr.sequence == null);
    if (missing.length > 0) {
      throw new BadRequestException(
        `Recipe "${recipe.product}" isn't fully set up for stage tracking yet -- set a Step number for: ${missing
          .map((tr) => tr.taskName)
          .join(', ')} (on the Recipes page).`,
      );
    }
    const sequences = stageRates.map((tr) => tr.sequence as number);
    if (new Set(sequences).size !== sequences.length) {
      throw new BadRequestException(
        `Recipe "${recipe.product}" has two steps sharing the same Step number -- fix that on the Recipes page before logging entries against it.`,
      );
    }
    return stageRates;
  }

  // Resolves where `task` sits in `recipe`'s pipeline. Caller must have
  // already run assertRecipeIsStageTracked so every row is guaranteed to
  // have a sequence.
  private resolveStagePosition(recipe: Recipe, stageRates: RecipeTaskRate[], task: Task): StagePosition {
    const sorted = [...stageRates].sort((a, b) => (a.sequence as number) - (b.sequence as number));
    const index = sorted.findIndex((tr) => tr.taskId === task.id);
    if (index === -1) {
      throw new BadRequestException(
        `Task "${task.name}" isn't one of recipe "${recipe.product}"'s configured steps.`,
      );
    }
    return {
      isFirstStage: index === 0,
      isLastStage: index === sorted.length - 1,
      previousTask: index > 0 ? { id: sorted[index - 1].taskId, name: sorted[index - 1].taskName } : undefined,
    };
  }

  // Undoes everything createEntry (via applyEntry) does for a given entry:
  // deletes its payout rows and debits the balance they credited, restores
  // raw material / wood-stock consumption it drew down, restores whatever
  // upstream stage stock it consumed, and reverses whichever downstream
  // credit it made (another stage's WIP, or Product.stock). Must run inside
  // the same transaction as whatever's about to delete/replace the entry.
  private async reverseEntrySideEffects(entry: DailyEntry, manager: EntityManager) {
    const payoutRepository = manager.getRepository(Payout);
    const employeeRepository = manager.getRepository(Employee);
    const productRepository = manager.getRepository(Product);
    const stageStockRepository = manager.getRepository(RecipeStageStock);

    const payouts = await payoutRepository.find({ where: { dailyEntryId: entry.id } });
    for (const payout of payouts) {
      await employeeRepository.decrement({ id: payout.employeeId }, 'balance', payout.amount);
    }
    if (payouts.length > 0) {
      await payoutRepository.remove(payouts);
    }

    await this.materialConsumptionsService.deleteConsumptionsForDailyEntry(entry.id, manager);

    // Give back whatever this entry drew from an earlier stage's stock.
    if (entry.recipeId && entry.consumedFromTaskId != null) {
      const upstream = await stageStockRepository.findOneBy({
        recipeId: entry.recipeId,
        taskId: entry.consumedFromTaskId,
      });
      if (upstream) {
        upstream.quantity = round(upstream.quantity + entry.weightKg);
        await stageStockRepository.save(upstream);
      }
      // If the row's gone entirely (its task or recipe got cleaned up since),
      // there's nothing left to restore it onto -- nothing more to do.
    }

    // Reverse whatever this entry credited downstream.
    if (entry.recipeId && entry.creditedStageTaskId != null) {
      const ownStage = await stageStockRepository.findOneBy({
        recipeId: entry.recipeId,
        taskId: entry.creditedStageTaskId,
      });
      if (ownStage) {
        if (ownStage.quantity < entry.weightKg) {
          throw new ConflictException(
            `Cannot edit/delete this entry -- some of the ${round(entry.weightKg)} piece(s) it produced have already moved on to the next stage. Reverse those entries first.`,
          );
        }
        ownStage.quantity = round(ownStage.quantity - entry.weightKg);
        await stageStockRepository.save(ownStage);
      }
    } else if (entry.creditedProductStock || entry.task?.slug === LEGACY_PACKAGING_SLUG) {
      // Prefer the live recipe's SKU; fall back to matching on the snapshot
      // product name if the recipe itself has since been deleted.
      const sku = entry.recipe?.sku;
      const product = sku
        ? await productRepository.findOneBy({ sku })
        : entry.productName
          ? await productRepository.findOneBy({ name: entry.productName })
          : null;
      if (product) {
        product.stock = round(Math.max(0, product.stock - entry.weightKg));
        await productRepository.save(product);
      }
    }
  }

  // Shared by createEntry and updateEntry -- validates input, then does all
  // the actual writes (entry row, stage-stock movement, material
  // consumption, product stock, payouts) against whatever manager the
  // caller's transaction is using.
  private async applyEntry(data: CreateDailyEntryInput, manager: EntityManager) {
    const taskRepo = manager.getRepository(Task);
    const recipeRepo = manager.getRepository(Recipe);
    const employeeRepo = manager.getRepository(Employee);
    const stageStockRepo = manager.getRepository(RecipeStageStock);

    const task = await taskRepo.findOneBy({ id: data.taskId });
    if (!task) {
      throw new NotFoundException('Task not found');
    }

    if (!data.employeeIds || data.employeeIds.length === 0) {
      throw new BadRequestException('At least one artisan is required');
    }

    const productApplicable = task.requiresProduct;
    let recipe: Recipe | null = null;
    let stagePosition: StagePosition | undefined;
    if (productApplicable) {
      if (!data.recipeId) {
        throw new BadRequestException('A product (recipe) is required for this task');
      }
      recipe = await recipeRepo.findOne({
        where: { id: data.recipeId },
        relations: ['materialUsages', 'taskRates'],
      });
      if (!recipe) {
        throw new NotFoundException('Recipe not found');
      }
      // Fail fast, before writing anything -- every task in this recipe's
      // wage list needs a Step number so "what stage is this, what comes
      // before it" is unambiguous. See the method's own comment for why
      // this is required rather than best-effort.
      const stageRates = this.assertRecipeIsStageTracked(recipe);
      stagePosition = this.resolveStagePosition(recipe, stageRates, task);
    }

    const employees = await employeeRepo.find({ where: { id: In(data.employeeIds) } });
    if (employees.length === 0) {
      throw new BadRequestException('No matching employees found');
    }

    // Inactive employees can't be assigned new work -- catch it here so
    // this is enforced no matter what the frontend sends, not just in the
    // artisan picker's UI.
    const inactiveEmployees = employees.filter((e) => e.status !== EmployeeStatus.ACTIVE);
    if (inactiveEmployees.length > 0) {
      const names = inactiveEmployees.map((e) => e.name).join(', ');
      throw new BadRequestException(
        `Cannot log work for inactive employee(s): ${names}. Reactivate them on the Employees page first.`,
      );
    }

    // The recipe's LAST configured step is what completes a physical unit
    // -- whatever that task happens to be named. A recipe with no SKU at
    // all is a data problem we can't fix automatically, so that still
    // fails fast, before writing anything. A missing Product row for that
    // SKU, though, just means this is the first time it's been finished --
    // created below, inside the transaction, instead of rejecting the entry.
    if (stagePosition?.isLastStage && recipe && !recipe.sku) {
      throw new BadRequestException(
        `Recipe "${recipe.product}" has no SKU set -- add one before its final step can update finished-goods stock.`,
      );
    }

    // Consume whatever this specific task's BOM rows say it needs -- each
    // RecipeMaterialUsage row is tagged to the task that consumes it now,
    // instead of the whole BOM being dumped on the last step only. A task
    // with no rows tagged to it (e.g. a pure-labor step) simply consumes
    // nothing here, which is fine.
    const bomConsumptions: ResolvedBomConsumption[] = recipe
      ? recipe.materialUsages
          .filter((usage) => usage.taskId === task.id)
          .map((usage) => ({
            rawMaterialId: usage.rawMaterialId,
            rawMaterialName: usage.rawMaterialName,
            quantity: usage.quantity * data.weightKg,
          }))
          .filter((c) => c.quantity > 0)
      : [];

    const entry = manager.create(DailyEntry, {
      task,
      taskId: task.id,
      employees,
      weightKg: data.weightKg,
      recipeId: recipe?.id,
      productName: recipe?.product,
      consumedFromTaskId: stagePosition?.previousTask?.id,
      creditedStageTaskId:
        stagePosition && !stagePosition.isLastStage ? task.id : undefined,
      creditedProductStock: Boolean(stagePosition?.isLastStage),
    });
    const saved = await manager.save(entry);

    // Re-fetch with relations so the response the frontend gets back (used
    // to prepend to the list, or replace the edited row) has task/employees
    // populated -- also needed here since generatePayoutsForEntry reads
    // entry.task/employees.
    const savedWithRelations = await manager.findOne(DailyEntry, {
      where: { id: saved.id },
      relations: ['task', 'employees', 'recipe'],
    });

    // Draw down whatever this stage needs from the PREVIOUS stage's WIP --
    // e.g. Cloth Stretching can't process more pieces than Frame Making has
    // actually produced. Blocks the entry (rolling back the whole
    // transaction) if there isn't enough, instead of letting the count go
    // negative and silently lying about how much WIP exists.
    if (recipe && stagePosition?.previousTask) {
      const upstream = await stageStockRepo.findOneBy({
        recipeId: recipe.id,
        taskId: stagePosition.previousTask.id,
      });
      const available = upstream?.quantity ?? 0;
      if (available < data.weightKg) {
        throw new BadRequestException(
          `Not enough "${stagePosition.previousTask.name}" stock for ${recipe.product} -- only ${round(available)} available, need ${round(data.weightKg)}.`,
        );
      }
      upstream!.quantity = round(upstream!.quantity - data.weightKg);
      await stageStockRepo.save(upstream!);
    }

    // FIFO across material_batch rows per material -- oldest batch with
    // stock left is drawn from first, spilling into the next batch if it
    // isn't enough. Throws (rolling back this whole transaction, entry
    // included) if any one of them doesn't have enough stock to cover it.
    for (const consumption of bomConsumptions) {
      await this.materialConsumptionsService.recordConsumption(
        {
          rawMaterialId: consumption.rawMaterialId,
          quantity: consumption.quantity,
          note: `Daily entry #${saved.id}: ${task.name} - ${recipe?.product} (SKU: ${recipe?.sku}) -- ${consumption.rawMaterialName}`,
          dailyEntryId: saved.id,
        },
        manager,
      );
    }

    if (recipe && stagePosition?.isLastStage && recipe.sku) {
      const productRepo = manager.getRepository(Product);
      let product = await productRepo.findOneBy({ sku: recipe.sku });

      // Per-unit cost straight from the recipe: BOM quantities x each
      // material's current average stock price, plus the recipe's flat
      // Artisan Wages rates summed up. Recomputed on every finishing entry
      // so it tracks material price and wage changes -- not a one-time
      // snapshot.
      const { unitCost } = await this.recipesService.computeUnitCost(recipe);

      if (!product) {
        // First time this SKU has been finished -- create the Product row
        // from the recipe instead of failing the entry.
        product = manager.create(Product, {
          name: recipe.product,
          sku: recipe.sku,
          costPrice: unitCost,
          stock: 0,
        });
        product = await manager.save(product);
        console.log(
          `[DailyEntry] No product existed for SKU ${recipe.sku} -- created "${recipe.product}" at cost ৳${unitCost}/unit.`,
        );
      } else {
        product.costPrice = unitCost;
      }

      const artisanNames = employees.map((e) => e.name).join(', ');
      console.log(
        `[DailyEntry] SKU ${product.sku} (${recipe.product}): +${data.weightKg} units by ${artisanNames} -- stock ${product.stock} -> ${product.stock + data.weightKg}`,
      );
      product.stock = round(product.stock + data.weightKg);
      await manager.save(product);
    } else if (recipe && stagePosition && !stagePosition.isLastStage) {
      // Not the last step -- credit this stage's own WIP bucket instead of
      // finished-goods stock. Created on first use for this (recipe, task)
      // pair, incremented from there.
      let ownStage = await stageStockRepo.findOneBy({ recipeId: recipe.id, taskId: task.id });
      if (!ownStage) {
        ownStage = stageStockRepo.create({ recipeId: recipe.id, taskId: task.id, taskName: task.name, quantity: 0 });
      }
      ownStage.quantity = round(ownStage.quantity + data.weightKg);
      await stageStockRepo.save(ownStage);
    }

    if (savedWithRelations) {
      // Compute + save payouts right away instead of waiting for a manual
      // "Generate Payouts" run -- one row per artisan on this entry.
      await this.payoutsService.generatePayoutsForEntry(savedWithRelations, manager);
    }

    return savedWithRelations;
  }
}
