import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { DailyEntry } from './daily-entry.entity';
import { Task } from '../tasks/task.entity';
import { Employee, EmployeeStatus } from '../employees/employee.entity';
import { Recipe } from '../recipes/recipe.entity';
import { Product } from '../products/product.entity';
import { RawMaterial } from '../raw-materials/raw-material.entity';
import { MaterialBatch } from '../material-batches/material-batch.entity';
import { PayoutsService } from '../payouts/payouts.service';
import { MaterialConsumptionsService } from '../material-consumptions/material-consumptions.service';

// Packaging is the last step in production -- once it's logged, the units
// packaged are finished goods, so that's when we credit the Product's stock.
const PACKAGING_SLUG = 'packaging';

// Wood processing pipeline: raw_wood -> [Wood Slicing] -> sliced_wood ->
// [Corner Cutting] -> corner_cut_wood. Each of these two tasks is a
// raw-material-to-raw-material transform -- consume one material's stock,
// produce the same quantity into the next one in the chain. The resulting
// corner_cut_wood stock later gets consumed as a recipe's BOM input (e.g. by
// কোনা কাটা কাঠ) same as any other raw material.
const WOOD_SLICING_SLUG = 'wood_slicing';
const CORNER_CUTTING_SLUG = 'corner_cutting';
const RAW_WOOD_SLUG = 'raw_wood';
const SLICED_WOOD_SLUG = 'sliced_wood';
const CORNER_CUT_WOOD_SLUG = 'corner_cut_wood';

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

@Injectable()
export class DailyEntryService {
  constructor(
    @InjectRepository(DailyEntry) private dailyEntryRepo: Repository<DailyEntry>,
    @InjectRepository(Task) private taskRepo: Repository<Task>,
    @InjectRepository(Employee) private employeeRepo: Repository<Employee>,
    @InjectRepository(Recipe) private recipeRepo: Repository<Recipe>,
    @InjectRepository(Product) private productRepo: Repository<Product>,
    @InjectRepository(RawMaterial) private rawMaterialRepo: Repository<RawMaterial>,
    @InjectRepository(MaterialBatch) private materialBatchRepo: Repository<MaterialBatch>,
    private payoutsService: PayoutsService,
    private materialConsumptionsService: MaterialConsumptionsService,
  ) {}

  getEntries() {
    return this.dailyEntryRepo.find({
      relations: ['task', 'employees', 'recipe'],
      order: { createdAt: 'DESC' },
    });
  }

  async createEntry(data: CreateDailyEntryInput) {
    const task = await this.taskRepo.findOneBy({ id: data.taskId });
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
      // resolved below into actual raw material deductions.
      recipe = await this.recipeRepo.findOne({
        where: { id: data.recipeId },
        relations: ['materialUsages'],
      });
      if (!recipe) {
        throw new NotFoundException('Recipe not found');
      }
    }

    const employees = await this.employeeRepo.find({ where: { id: In(data.employeeIds) } });
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

    // Recipe BOM -> raw material consumption. Each unit produced (weightKg)
    // consumes recipe.materialUsages[].quantity of that raw material --
    // each row already points at a specific RawMaterial by id (set on the
    // Recipes page), so there's no name/unit guessing left to do here, just
    // multiply by weightKg. The actual FIFO deduction across batches
    // happens inside the transaction below.
    const bomConsumptions: ResolvedBomConsumption[] = recipe
      ? recipe.materialUsages
          .map((usage) => ({
            rawMaterialId: usage.rawMaterialId,
            rawMaterialName: usage.rawMaterialName,
            quantity: usage.quantity * data.weightKg,
          }))
          .filter((c) => c.quantity > 0)
      : [];

    // Everything from here on writes to the DB -- run it as one transaction
    // so a failure partway through (entry save, stock update, or payout
    // generation) can't leave a half-applied result committed.
    return this.dailyEntryRepo.manager.transaction(async (manager) => {
      const entry = manager.create(DailyEntry, {
        task,
        taskId: task.id,
        employees,
        weightKg: data.weightKg,
        recipeId: recipe?.id,
        productName: recipe?.product,
      });
      const saved = await manager.save(entry);

      // Re-fetch with relations so the response the frontend gets back
      // (used to prepend to the list) has task/employees populated -- also
      // needed here since generatePayoutsForEntry reads entry.task/employees.
      const savedWithRelations = await manager.findOne(DailyEntry, {
        where: { id: saved.id },
        relations: ['task', 'employees', 'recipe'],
      });

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
          },
          manager,
        );
      }

      if (task.slug === WOOD_SLICING_SLUG) {
        await this.consumeRawMaterialBySlug(
          manager,
          RAW_WOOD_SLUG,
          data.weightKg,
          `Daily entry #${saved.id}: ${task.name}`,
        );
        await this.produceRawMaterialBySlug(
          manager,
          SLICED_WOOD_SLUG,
          'কাটা কাঠ',
          'kg',
          data.weightKg,
          task.name,
        );
      }

      if (task.slug === CORNER_CUTTING_SLUG) {
        await this.consumeRawMaterialBySlug(
          manager,
          SLICED_WOOD_SLUG,
          data.weightKg,
          `Daily entry #${saved.id}: ${task.name}`,
        );
        await this.produceRawMaterialBySlug(
          manager,
          CORNER_CUT_WOOD_SLUG,
          'কোনা কাটা কাঠ',
          'kg',
          data.weightKg,
          task.name,
        );
      }

      if (task.slug === PACKAGING_SLUG && recipe?.sku) {
        let product = await manager.findOneBy(Product, { sku: recipe.sku });

        if (!product) {
          // First time this SKU has been packaged -- create the Product row
          // from the recipe instead of failing the entry. costPrice defaults
          // to 0 since Recipe doesn't track a sale price; set the real value
          // on the Products page afterward.
          product = manager.create(Product, {
            name: recipe.product,
            sku: recipe.sku,
            costPrice: 0,
            stock: 0,
          });
          product = await manager.save(product);
          console.log(
            `[Packaging] No product existed for SKU ${recipe.sku} -- created "${recipe.product}" (set its cost price on the Products page).`,
          );
        }

        const artisanNames = employees.map((e) => e.name).join(', ');
        console.log(
          `[Packaging] SKU ${product.sku} (${recipe.product}): +${data.weightKg} units by ${artisanNames} -- stock ${product.stock} -> ${product.stock + data.weightKg}`,
        );
        product.stock += data.weightKg;
        await manager.save(product);
      }

      if (savedWithRelations) {
        // Compute + save payouts right away instead of waiting for a manual
        // "Generate Payouts" run -- one row per artisan on this entry.
        await this.payoutsService.generatePayoutsForEntry(savedWithRelations, manager);
      }

      return savedWithRelations;
    });
  }

  // FIFO-consumes `quantity` from an existing raw material's batches, found
  // by slug. Throws if that material doesn't exist yet or doesn't have
  // enough stock -- rolling back the whole entry, same as a recipe's BOM
  // consumption does.
  private async consumeRawMaterialBySlug(
    manager: EntityManager,
    slug: string,
    quantity: number,
    note: string,
  ) {
    const rawMaterial = await manager.findOneBy(RawMaterial, { slug });
    if (!rawMaterial) {
      throw new BadRequestException(
        `Raw material "${slug}" not found -- seed it or add it on the Raw Materials Inventory page first.`,
      );
    }
    await this.materialConsumptionsService.recordConsumption(
      { rawMaterialId: rawMaterial.id, quantity, note },
      manager,
    );
  }

  // Adds `quantity` of stock to a raw material (found or created by slug) as
  // a new batch -- this is production, not a purchase, so unitPrice is 0.
  // Everything else follows the normal batch shape so it shows up in
  // Inventory and FIFO-consumes like any other batch.
  private async produceRawMaterialBySlug(
    manager: EntityManager,
    slug: string,
    fallbackName: string,
    unit: string,
    quantity: number,
    logLabel: string,
  ) {
    let rawMaterial = await manager.findOneBy(RawMaterial, { slug });

    if (!rawMaterial) {
      // Should normally already exist via the raw material seeder -- this
      // is just a safety net for a DB that hasn't been seeded.
      rawMaterial = manager.create(RawMaterial, { name: fallbackName, unit, slug });
      rawMaterial = await manager.save(rawMaterial);
      console.log(`[${logLabel}] No raw material existed for "${slug}" -- created it.`);
    }

    const batch = manager.create(MaterialBatch, {
      rawMaterialId: rawMaterial.id,
      rawMaterialName: rawMaterial.name,
      rawMaterialUnit: rawMaterial.unit,
      quantityPurchased: quantity,
      unitPrice: 0,
      totalCost: 0,
      quantityRemaining: quantity,
      purchaseDate: new Date().toISOString().slice(0, 10),
    });
    await manager.save(batch);

    console.log(
      `[${logLabel}] +${quantity} ${rawMaterial.unit} added to "${rawMaterial.name}" stock (batch #${batch.id}).`,
    );
  }
}
