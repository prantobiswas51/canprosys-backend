import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { DailyEntry } from './daily-entry.entity';
import { Task } from '../tasks/task.entity';
import { Employee } from '../employees/employee.entity';
import { Recipe } from '../recipes/recipe.entity';
import { Product } from '../products/product.entity';
import { RawMaterial } from '../raw-materials/raw-material.entity';
import { PayoutsService } from '../payouts/payouts.service';
import { MaterialConsumptionsService } from '../material-consumptions/material-consumptions.service';

// Tasks where "which product" doesn't apply yet -- raw material prep that
// happens before a product is chosen.
const PRODUCT_NOT_APPLICABLE_SLUGS = ['wood_slicing', 'corner_cutting'];

// Packaging is the last step in production -- once it's logged, the units
// packaged are finished goods, so that's when we credit the Product's stock.
const PACKAGING_SLUG = 'packaging';

// Raw material catalog names this looks up, by partial case-insensitive
// match (all keywords must appear somewhere in the name -- see
// findRawMaterial below), to deduct BOM consumption per recipe. Partial
// rather than exact match so small naming differences ("Board" vs "Board
// Sheet") don't break the lookup.
//
// Poly is the odd one out: real-world catalogs can have TWO rows both
// literally named "Poly" -- one bought by the piece, one by the yard -- with
// nothing in the name itself to tell them apart. So poly additionally
// filters on RawMaterial.unit ('piece' vs 'yard') rather than relying on the
// name. That unit gets snapshotted onto MaterialBatch.rawMaterialUnit /
// MaterialConsumption.rawMaterialUnit at write time, which is what actually
// answers "was this batch Poly (Piece) or Poly (Yard)" later.
const WOOD_KEYWORDS = ['wood'];
const BOARD_KEYWORDS = ['board'];
const SCREWS_HINGES_KEYWORDS = ['screw'];
const POLY_KEYWORDS = ['poly'];
const POLY_PIECE_UNIT = 'piece';
const POLY_YARD_UNIT = 'yard';

interface BomConsumptionNeed {
  keywords: string[];
  unit?: string;
  label: string;
  quantity: number;
}

interface ResolvedBomConsumption {
  rawMaterial: RawMaterial;
  label: string;
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

    const productApplicable = !PRODUCT_NOT_APPLICABLE_SLUGS.includes(task.slug);
    let recipe: Recipe | null = null;
    if (productApplicable) {
      if (!data.recipeId) {
        throw new BadRequestException('A product (recipe) is required for this task');
      }
      recipe = await this.recipeRepo.findOneBy({ id: data.recipeId });
      if (!recipe) {
        throw new NotFoundException('Recipe not found');
      }
    }

    const employees = await this.employeeRepo.find({ where: { id: In(data.employeeIds) } });
    if (employees.length === 0) {
      throw new BadRequestException('No matching employees found');
    }

    // Packaging = finished goods. A recipe with no SKU at all is a data
    // problem we can't fix automatically, so that still fails fast, before
    // writing anything. A missing Product row for that SKU, though, just
    // means this is the first time it's been packaged -- created below,
    // inside the transaction, instead of rejecting the entry.
    if (task.slug === PACKAGING_SLUG && recipe && !recipe.sku) {
      throw new BadRequestException(
        `Recipe "${recipe.product} (${recipe.sizeNameEnglish})" has no SKU set -- add one before packaging entries can update stock.`,
      );
    }

    // Recipe BOM -> raw material consumption. Each unit produced (weightKg)
    // consumes woodKg/boardSheet/screwAndHinges/polyBagQuantity per the
    // recipe -- resolve (and validate) every raw material row this entry
    // will need to draw from up front, before writing anything. The actual
    // FIFO deduction across batches happens inside the transaction below.
    const bomConsumptions = recipe ? await this.resolveBomConsumptions(recipe, data.weightKg) : [];

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
            rawMaterialId: consumption.rawMaterial.id,
            quantity: consumption.quantity,
            note: `Daily entry #${saved.id}: ${task.name} - ${recipe?.product} (${recipe?.sizeNameEnglish}) -- ${consumption.label}`,
          },
          manager,
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

  // Works out how much of each raw material this entry's recipe/quantity
  // needs, and resolves each to its RawMaterial catalog row. Recipe fields
  // are free-text strings like "6 piece" -- parseFloat reads the leading
  // number and ignores the rest, which is all we need. A field that parses
  // to 0/NaN (empty/not set on this recipe) is simply skipped, not required.
  private async resolveBomConsumptions(
    recipe: Recipe,
    weightKg: number,
  ): Promise<ResolvedBomConsumption[]> {
    const isYard = recipe.polyBagType?.trim().toLowerCase().startsWith('yard');
    const polyUnit = isYard ? POLY_YARD_UNIT : POLY_PIECE_UNIT;
    const polyLabel = isYard ? 'Poly (Yard)' : 'Poly (Piece)';

    const needs: BomConsumptionNeed[] = [
      { keywords: WOOD_KEYWORDS, label: 'Wood', quantity: parseFloat(recipe.woodKg) },
      { keywords: BOARD_KEYWORDS, label: 'Board', quantity: parseFloat(recipe.boardSheet) },
      {
        keywords: SCREWS_HINGES_KEYWORDS,
        label: 'Screws and Hinges',
        quantity: parseFloat(recipe.screwAndHinges),
      },
      { keywords: POLY_KEYWORDS, unit: polyUnit, label: polyLabel, quantity: parseFloat(recipe.polyBagQuantity) },
    ].map((need) => ({
      ...need,
      quantity: (isNaN(need.quantity) ? 0 : need.quantity) * weightKg,
    }));

    const resolved: ResolvedBomConsumption[] = [];
    for (const need of needs) {
      if (need.quantity <= 0) continue;

      const rawMaterial = await this.findRawMaterial(need.keywords, need.unit);

      if (!rawMaterial) {
        const unitNote = need.unit ? ` with unit "${need.unit}"` : '';
        throw new BadRequestException(
          `Recipe "${recipe.product}" needs ${need.quantity} of ${need.label}, but no raw material with "${need.keywords.join('" and "')}" in its name${unitNote} exists -- create one on the Raw Materials Inventory page first.`,
        );
      }

      resolved.push({ rawMaterial, label: need.label, quantity: need.quantity });
    }

    return resolved;
  }

  // Partial, case-insensitive match on name -- every keyword must appear
  // somewhere in it (in any order), so "Screws and Hinges", "Screws &
  // Hinges" and "Screw Set" all satisfy keywords: ['screw']. When `unit` is
  // given, it's also matched exactly (case-insensitive) -- this is what
  // disambiguates two rows that share the same name (e.g. "Poly" piece vs
  // "Poly" yard) since the name-only match alone can't tell them apart.
  private findRawMaterial(keywords: string[], unit?: string) {
    const qb = this.rawMaterialRepo.createQueryBuilder('rm');
    keywords.forEach((keyword, index) => {
      const param = `keyword${index}`;
      qb.andWhere(`rm.name ILIKE :${param}`, { [param]: `%${keyword}%` });
    });
    if (unit) {
      qb.andWhere('rm.unit ILIKE :unit', { unit });
    }
    return qb.getOne();
  }
  //end daily entry

}
