import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { DailyEntry } from './daily-entry.entity';
import { Task } from '../tasks/task.entity';
import { Employee, EmployeeStatus } from '../employees/employee.entity';
import { Recipe } from '../recipes/recipe.entity';
import { Product } from '../products/product.entity';
import { Payout } from '../payouts/payout.entity';
import { PayoutsService } from '../payouts/payouts.service';
import { MaterialConsumptionsService } from '../material-consumptions/material-consumptions.service';
import { RecipesService } from '../recipes/recipes.service';
import { round } from '../common/round';

// Packaging is the last step in production -- that's when a recipe's BOM
// actually gets consumed and the resulting units get credited to the
// Product's stock. Every other task is just a record of work done, driving
// wage/payout calculation only. (Wood processing -- slicing, corner
// cutting -- moved to its own dedicated module; no longer handled here.)
const PACKAGING_SLUG = 'packaging';

interface ResolvedBomConsumption {
  rawMaterialId: number;
  rawMaterialName: string;
  quantity: number;
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
  // material/wood-stock consumption), delete the old row, then apply the
  // new values exactly like a fresh create -- all inside one transaction.
  // Simpler and far less error-prone than trying to diff old vs new values
  // field by field and patch each side effect individually.
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

  // Undoes everything createEntry (via applyEntry) does for a given entry:
  // deletes its payout rows and debits the balance they credited, restores
  // raw material / wood-stock consumption it drew down, and rolls back the
  // finished-goods stock it added (Packaging only). Must run inside the same
  // transaction as whatever's about to delete/replace the entry itself.
  private async reverseEntrySideEffects(entry: DailyEntry, manager: EntityManager) {
    const payoutRepository = manager.getRepository(Payout);
    const employeeRepository = manager.getRepository(Employee);
    const productRepository = manager.getRepository(Product);

    const payouts = await payoutRepository.find({ where: { dailyEntryId: entry.id } });
    for (const payout of payouts) {
      await employeeRepository.decrement({ id: payout.employeeId }, 'balance', payout.amount);
    }
    if (payouts.length > 0) {
      await payoutRepository.remove(payouts);
    }

    await this.materialConsumptionsService.deleteConsumptionsForDailyEntry(entry.id, manager);

    if (entry.task?.slug === PACKAGING_SLUG) {
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
  // the actual writes (entry row, material consumption, product stock,
  // payouts) against whatever manager the caller's transaction is using.
  private async applyEntry(data: CreateDailyEntryInput, manager: EntityManager) {
    const taskRepo = manager.getRepository(Task);
    const recipeRepo = manager.getRepository(Recipe);
    const employeeRepo = manager.getRepository(Employee);

    const task = await taskRepo.findOneBy({ id: data.taskId });
    if (!task) {
      throw new NotFoundException('Task not found');
    }

    if (!data.employeeIds || data.employeeIds.length === 0) {
      throw new BadRequestException('At least one artisan is required');
    }

    const productApplicable = task.requiresProduct;
    let recipe: Recipe | null = null;
    if (productApplicable) {
      if (!data.recipeId) {
        throw new BadRequestException('A product (recipe) is required for this task');
      }
      // materialUsages relation needed here -- that's the recipe's BOM,
      // resolved below into actual raw material deductions (only applied
      // when this task is Packaging -- see bomConsumptions below).
      // taskRates needed alongside materialUsages now, too -- both feed the
      // per-unit cost computed below when this is a Packaging entry.
      recipe = await recipeRepo.findOne({
        where: { id: data.recipeId },
        relations: ['materialUsages', 'taskRates'],
      });
      if (!recipe) {
        throw new NotFoundException('Recipe not found');
      }
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

    // Packaging = finished goods. A recipe with no SKU at all is a data
    // problem we can't fix automatically, so that still fails fast, before
    // writing anything. A missing Product row for that SKU, though, just
    // means this is the first time it's been packaged -- created below,
    // inside the transaction, instead of rejecting the entry.
    if (task.slug === PACKAGING_SLUG && recipe && !recipe.sku) {
      throw new BadRequestException(
        `Recipe "${recipe.product}" has no SKU set -- add one before packaging entries can update stock.`,
      );
    }

    // Recipe BOM -> raw material consumption, Packaging only. Other tasks
    // that require a product still need a recipe selected for wage
    // calculation, but don't touch raw material stock -- only the
    // Packaging step, which is when a unit is actually considered "made",
    // draws down the BOM. Each unit produced (weightKg) consumes
    // recipe.materialUsages[].quantity of that raw material -- each row
    // already points at a specific RawMaterial by id (set on the Recipes
    // page), so there's no name/unit guessing left to do here, just
    // multiply by weightKg. The actual FIFO deduction across batches
    // happens below.
    const bomConsumptions: ResolvedBomConsumption[] =
      recipe && task.slug === PACKAGING_SLUG
        ? recipe.materialUsages
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

    // FIFO across material_batch rows per material -- oldest batch with
    // stock left is drawn from first, spilling into the next batch if it
    // isn't enough. Throws (rolling back this whole transaction, entry
    // included) if any one of them doesn't have enough stock to cover it.
    // Empty (and thus a no-op) for every task except Packaging.
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

    if (task.slug === PACKAGING_SLUG && recipe?.sku) {
      const productRepo = manager.getRepository(Product);
      let product = await productRepo.findOneBy({ sku: recipe.sku });

      // Per-unit cost straight from the recipe: BOM quantities x each
      // material's current average stock price, plus the recipe's flat
      // Artisan Wages rates summed up. Recomputed on every packaging
      // entry so it tracks material price and wage changes -- not a
      // one-time snapshot.
      const { unitCost } = await this.recipesService.computeUnitCost(recipe);

      if (!product) {
        // First time this SKU has been packaged -- create the Product row
        // from the recipe instead of failing the entry.
        product = manager.create(Product, {
          name: recipe.product,
          sku: recipe.sku,
          costPrice: unitCost,
          stock: 0,
        });
        product = await manager.save(product);
        console.log(
          `[Packaging] No product existed for SKU ${recipe.sku} -- created "${recipe.product}" at cost ৳${unitCost}/unit.`,
        );
      } else {
        product.costPrice = unitCost;
      }

      const artisanNames = employees.map((e) => e.name).join(', ');
      console.log(
        `[Packaging] SKU ${product.sku} (${recipe.product}): +${data.weightKg} units by ${artisanNames} -- stock ${product.stock} -> ${product.stock + data.weightKg}`,
      );
      product.stock = round(product.stock + data.weightKg);
      await manager.save(product);
    }

    if (savedWithRelations) {
      // Compute + save payouts right away instead of waiting for a manual
      // "Generate Payouts" run -- one row per artisan on this entry.
      await this.payoutsService.generatePayoutsForEntry(savedWithRelations, manager);
    }

    return savedWithRelations;
  }
}
