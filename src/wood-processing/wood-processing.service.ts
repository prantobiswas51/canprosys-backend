import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { WoodProcessingEntry } from './wood-processing-entry.entity';
import { WoodProcessingConsumption } from './wood-processing-consumption.entity';
import { WoodStockBatch } from './wood-stock-batch.entity';
import { WoodStagesService } from './wood-stages.service';
import { Employee, EmployeeStatus } from '../employees/employee.entity';
import { Payout } from '../payouts/payout.entity';
import { RawMaterialsService } from '../raw-materials/raw-materials.service';
import { MaterialBatch } from '../material-batches/material-batch.entity';
import { WasteBatch } from '../waste-management/waste-batch.entity';
import { WasteBatchesService } from '../waste-management/waste-batches.service';
import { round } from '../common/round';

export interface CreateWoodProcessingEntryInput {
  stageId: number;
  employeeIds: number[];
  // Weight taken from the input stock BEFORE processing -- e.g. "I took
  // 10kg of raw wood to slice". This is what's drawn from stock and what
  // wages are based on -- the number the operator actually knows going in.
  consumedQuantity: number;
  // Portion of consumedQuantity that didn't survive as good output.
  // outputQuantity (the new batch's quantity) = consumedQuantity - wasteQuantity.
  wasteQuantity?: number;
  // Only needed if wasteQuantity > 0 and the stage has no defaultWasteType
  // configured -- overrides that default either way.
  wasteTypeId?: number;
  entryDate?: string;
}

export type UpdateWoodProcessingEntryInput = CreateWoodProcessingEntryInput;

@Injectable()
export class WoodProcessingService {
  constructor(
    @InjectRepository(WoodProcessingEntry)
    private entryRepository: Repository<WoodProcessingEntry>,
    @InjectRepository(WoodStockBatch)
    private stockBatchRepository: Repository<WoodStockBatch>,
    @InjectRepository(Employee)
    private employeeRepository: Repository<Employee>,
    private woodStagesService: WoodStagesService,
    private rawMaterialsService: RawMaterialsService,
    private wasteBatchesService: WasteBatchesService,
  ) {}

  getEntries() {
    return this.entryRepository.find({
      relations: ['stage', 'stage.inputType', 'stage.outputType', 'employees'],
      order: { createdAt: 'DESC' },
    });
  }

  async createEntry(data: CreateWoodProcessingEntryInput) {
    return this.entryRepository.manager.transaction((manager) => this.applyEntry(data, manager));
  }

  // Edit = reverse everything the old entry caused (input batch draw,
  // output batch, mirrored raw material, waste, payouts), delete the old
  // row, then apply the new values exactly like a fresh create -- same
  // approach as DailyEntryService.updateEntry, for the same reason (far
  // simpler and safer than patching each side effect individually).
  async updateEntry(id: number, data: UpdateWoodProcessingEntryInput) {
    return this.entryRepository.manager.transaction(async (manager) => {
      const entry = await manager.findOne(WoodProcessingEntry, {
        where: { id },
        relations: ['stage', 'stage.inputType', 'stage.outputType', 'employees'],
      });
      if (!entry) {
        throw new NotFoundException(`Wood processing entry #${id} not found`);
      }

      await this.reverseEntry(entry, manager);
      await manager.delete(WoodProcessingEntry, id);

      return this.applyEntry(data, manager);
    });
  }

  async deleteEntry(id: number) {
    return this.entryRepository.manager.transaction(async (manager) => {
      const entry = await manager.findOne(WoodProcessingEntry, {
        where: { id },
        relations: ['stage', 'stage.inputType', 'stage.outputType', 'employees'],
      });
      if (!entry) {
        throw new NotFoundException(`Wood processing entry #${id} not found`);
      }

      await this.reverseEntry(entry, manager);
      await manager.delete(WoodProcessingEntry, id);

      return { deleted: true };
    });
  }

  // Undoes everything applyEntry does for a given entry -- but only if
  // nothing downstream has touched what it produced yet. If this entry's
  // output batch was itself drawn from by a later stage, or its mirrored
  // raw material stock got packaged into a product, or its waste got sold,
  // there's no clean way to "un-happen" that further down the chain -- so
  // this blocks instead of silently leaving the ledger inconsistent.
  private async reverseEntry(entry: WoodProcessingEntry, manager: EntityManager) {
    const batchRepo = manager.getRepository(WoodStockBatch);
    const consumptionRepo = manager.getRepository(WoodProcessingConsumption);
    const materialBatchRepo = manager.getRepository(MaterialBatch);
    const wasteBatchRepo = manager.getRepository(WasteBatch);
    const payoutRepo = manager.getRepository(Payout);
    const employeeRepo = manager.getRepository(Employee);

    const outputBatch = await batchRepo.findOneBy({ sourceEntryId: entry.id });
    if (outputBatch && outputBatch.quantityRemaining !== outputBatch.quantity) {
      throw new ConflictException(
        `Cannot edit or delete this entry -- ${round(outputBatch.quantity - outputBatch.quantityRemaining)} ${outputBatch.woodTypeName} of its output has already been used further downstream.`,
      );
    }

    const mirroredBatch = await materialBatchRepo.findOneBy({ sourceWoodProcessingEntryId: entry.id });
    if (mirroredBatch && mirroredBatch.quantityRemaining !== mirroredBatch.quantityPurchased) {
      throw new ConflictException(
        `Cannot edit or delete this entry -- its mirrored raw material stock (${mirroredBatch.rawMaterialName}) has already been consumed, e.g. packaged into a product.`,
      );
    }

    const wasteBatches = await wasteBatchRepo.find({ where: { sourceEntryId: entry.id } });
    const touchedWaste = wasteBatches.find((wb) => wb.quantityRemaining !== wb.quantity);
    if (touchedWaste) {
      throw new ConflictException(
        `Cannot edit or delete this entry -- its waste output (${touchedWaste.wasteTypeName}) has already been sold.`,
      );
    }

    // All clear -- restore whatever this entry's input draw took from
    // upstream batches, oldest-consumption-row first (order doesn't
    // actually matter here since nothing else has touched these since).
    const consumptions = await consumptionRepo.find({ where: { entryId: entry.id } });
    for (const c of consumptions) {
      if (c.batchId != null) {
        const batch = await batchRepo.findOneBy({ id: c.batchId });
        if (batch) {
          batch.quantityRemaining = round(Math.min(batch.quantity, batch.quantityRemaining + c.quantity));
          await batchRepo.save(batch);
        }
      }
    }
    if (consumptions.length > 0) {
      await consumptionRepo.remove(consumptions);
    }

    if (outputBatch) {
      await batchRepo.remove(outputBatch);
    }
    if (mirroredBatch) {
      await materialBatchRepo.remove(mirroredBatch);
    }
    if (wasteBatches.length > 0) {
      await wasteBatchRepo.remove(wasteBatches);
    }

    const payouts = await payoutRepo.find({ where: { woodProcessingEntryId: entry.id } });
    for (const payout of payouts) {
      await employeeRepo.decrement({ id: payout.employeeId }, 'balance', payout.amount);
    }
    if (payouts.length > 0) {
      await payoutRepo.remove(payouts);
    }
  }

  // Shared by createEntry and updateEntry -- validates input, then does all
  // the actual writes (entry row, input consumption, output batch, mirrored
  // raw material, waste, payouts) against whatever manager the caller's
  // transaction is using.
  private async applyEntry(data: CreateWoodProcessingEntryInput, manager: EntityManager) {
    if (!data.consumedQuantity || data.consumedQuantity <= 0) {
      throw new BadRequestException('Quantity taken (before processing) must be greater than zero');
    }
    const wasteQuantity = data.wasteQuantity ?? 0;
    if (wasteQuantity < 0) {
      throw new BadRequestException('Waste quantity cannot be negative');
    }
    if (wasteQuantity >= data.consumedQuantity) {
      throw new BadRequestException(
        'Waste quantity must be less than the quantity taken -- there has to be some good output',
      );
    }
    if (!data.employeeIds || data.employeeIds.length === 0) {
      throw new BadRequestException('At least one artisan is required');
    }

    const stage = await this.woodStagesService.getWoodStageById(data.stageId);

    const wasteTypeId = wasteQuantity > 0 ? data.wasteTypeId ?? stage.defaultWasteTypeId : undefined;
    if (wasteQuantity > 0 && !wasteTypeId) {
      throw new BadRequestException(
        `A waste type is required to record ${wasteQuantity} of waste -- set a default waste type on the "${stage.name}" stage, or pick one on this entry.`,
      );
    }

    const employeeRepo = manager.getRepository(Employee);
    const employees = await employeeRepo.find({ where: { id: In(data.employeeIds) } });
    if (employees.length === 0) {
      throw new BadRequestException('No matching employees found');
    }
    const inactive = employees.filter((e) => e.status !== EmployeeStatus.ACTIVE);
    if (inactive.length > 0) {
      const names = inactive.map((e) => e.name).join(', ');
      throw new BadRequestException(
        `Cannot log work for inactive employee(s): ${names}. Reactivate them on the Employees page first.`,
      );
    }

    // The good, useable output -- whatever was taken from stock minus
    // whatever became waste. Cost of the whole draw still ends up entirely
    // on this below; waste itself carries no cost basis.
    const consumedQuantity = data.consumedQuantity;
    const outputQuantity = round(consumedQuantity - wasteQuantity);
    const entryDate = data.entryDate || new Date().toISOString().slice(0, 10);

    const entry = manager.create(WoodProcessingEntry, {
      stageId: stage.id,
      stageName: stage.name,
      employees,
      consumedQuantity,
      wasteQuantity,
      outputQuantity,
      wageRateUsed: stage.wageRatePerUnit,
      entryDate,
    });
    const savedEntry = await manager.save(entry);

    // FIFO draw of consumedQuantity from the input wood type's stock --
    // same pattern as MaterialConsumptionsService, just scoped to
    // WoodStockBatch. Throws (rolling back the whole entry) if there
    // isn't enough stock to cover it.
    const materialCost = await this.consumeInput(
      manager,
      stage.inputTypeId,
      consumedQuantity,
      savedEntry.id,
    );

    // Wages are paid on the weight taken BEFORE processing (consumedQuantity
    // = output + waste), not on the good output alone -- e.g. slicing 10kg
    // down to 9kg good + 1kg waste still pays for 10kg of work.
    const laborCost = round(consumedQuantity * stage.wageRatePerUnit);
    const totalCost = round(materialCost + laborCost);
    const unitPrice = round(totalCost / outputQuantity);

    const outputBatchRepo = manager.getRepository(WoodStockBatch);
    await outputBatchRepo.save(
      outputBatchRepo.create({
        woodTypeId: stage.outputTypeId,
        woodTypeName: stage.outputType.name,
        quantity: outputQuantity,
        quantityRemaining: outputQuantity,
        unitPrice,
        totalCost,
        sourceEntryId: savedEntry.id,
        batchDate: entryDate,
      }),
    );

    // Final-stage output -- mirror into the general RawMaterial/
    // MaterialBatch system so Packaging's BOM consumption (which only
    // knows about RawMaterial) can keep drawing on it exactly like any
    // other purchased material, no special-casing required.
    // sourceWoodProcessingEntryId traces it back for reverseEntry above.
    if (stage.mirrorToRawMaterialId) {
      const rawMaterial = await this.rawMaterialsService.getRawMaterialById(
        stage.mirrorToRawMaterialId,
      );
      const materialBatchRepo = manager.getRepository(MaterialBatch);
      await materialBatchRepo.save(
        materialBatchRepo.create({
          rawMaterialId: rawMaterial.id,
          rawMaterialName: rawMaterial.name,
          rawMaterialUnit: rawMaterial.unit,
          quantityPurchased: outputQuantity,
          unitPrice,
          totalCost,
          quantityRemaining: outputQuantity,
          purchaseDate: entryDate,
          sourceWoodProcessingEntryId: savedEntry.id,
        }),
      );
    }

    if (wasteQuantity > 0 && wasteTypeId) {
      await this.wasteBatchesService.createWasteBatch(
        {
          wasteTypeId,
          quantity: wasteQuantity,
          collectedDate: entryDate,
          sourceEntryId: savedEntry.id,
          note: `From ${stage.name} (wood processing entry #${savedEntry.id})`,
        },
        manager,
      );
    }

    // Wages -- same unified ledger as daily-entry payouts (Payout table
    // + Employee.balance), just with taskId left null and
    // woodProcessingEntryId set instead of dailyEntryId. Split equally
    // across whoever's on the entry, based on consumedQuantity (weight
    // taken before processing), matching laborCost above.
    const weightShare = round(consumedQuantity / employees.length);
    const amount = round(weightShare * stage.wageRatePerUnit);
    const periodMonth = entryDate.slice(0, 7);
    const payoutRepo = manager.getRepository(Payout);
    for (const employee of employees) {
      await payoutRepo.save(
        payoutRepo.create({
          employeeId: employee.id,
          employeeName: employee.name,
          taskName: stage.name,
          woodProcessingEntryId: savedEntry.id,
          weightShare,
          ratePerUnit: stage.wageRatePerUnit,
          amount,
          periodMonth,
        }),
      );
      await employeeRepo.increment({ id: employee.id }, 'balance', amount);
    }

    return manager.findOne(WoodProcessingEntry, {
      where: { id: savedEntry.id },
      relations: ['stage', 'stage.inputType', 'stage.outputType', 'employees'],
    });
  }

  // FIFO draw of `quantity` from whichever WoodStockBatch rows hold this
  // wood type, oldest first. Writes a WoodProcessingConsumption row per
  // batch touched (the traceability trail) and returns the total cost of
  // the draw (sum of drawn x that batch's unitPrice).
  private async consumeInput(
    manager: EntityManager,
    woodTypeId: number,
    quantity: number,
    entryId: number,
  ): Promise<number> {
    const batchRepo = manager.getRepository(WoodStockBatch);
    const consumptionRepo = manager.getRepository(WoodProcessingConsumption);

    const batches = await batchRepo.find({
      where: { woodTypeId },
      order: { batchDate: 'ASC', id: 'ASC' },
    });
    const available = batches.filter((b) => b.quantityRemaining > 0);
    const totalAvailable = available.reduce((sum, b) => sum + b.quantityRemaining, 0);

    if (totalAvailable < quantity) {
      throw new BadRequestException(
        `Not enough stock for this stage's input: requested ${quantity}, only ${totalAvailable} available`,
      );
    }

    let remaining = quantity;
    let materialCost = 0;

    for (const batch of available) {
      if (remaining <= 0) break;
      const drawn = Math.min(batch.quantityRemaining, remaining);
      batch.quantityRemaining = round(batch.quantityRemaining - drawn);
      await batchRepo.save(batch);

      const cost = round(drawn * batch.unitPrice);
      materialCost += cost;
      await consumptionRepo.save(
        consumptionRepo.create({
          entryId,
          batchId: batch.id,
          quantity: drawn,
          unitCost: batch.unitPrice,
          totalCost: cost,
        }),
      );

      remaining -= drawn;
    }

    return round(materialCost);
  }
}
