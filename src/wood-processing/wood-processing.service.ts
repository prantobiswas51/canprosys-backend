import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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
import { WasteBatchesService } from '../waste-management/waste-batches.service';
import { round } from '../common/round';

export interface CreateWoodProcessingEntryInput {
  stageId: number;
  employeeIds: number[];
  // Weight taken AFTER this step -- wages and the new batch's quantity are
  // both based on this number, not on how much was fed in.
  outputQuantity: number;
  wasteQuantity?: number;
  // Only needed if wasteQuantity > 0 and the stage has no defaultWasteType
  // configured -- overrides that default either way.
  wasteTypeId?: number;
  entryDate?: string;
}

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
    if (!data.outputQuantity || data.outputQuantity <= 0) {
      throw new BadRequestException('Output quantity must be greater than zero');
    }
    const wasteQuantity = data.wasteQuantity ?? 0;
    if (wasteQuantity < 0) {
      throw new BadRequestException('Waste quantity cannot be negative');
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

    const employees = await this.employeeRepository.find({ where: { id: In(data.employeeIds) } });
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

    // How much has to come OUT of the input stock -- the good output plus
    // whatever became waste. Cost of that whole draw still ends up entirely
    // on the good output below; waste itself carries no cost basis.
    const consumedQuantity = data.outputQuantity + wasteQuantity;
    const entryDate = data.entryDate || new Date().toISOString().slice(0, 10);

    return this.entryRepository.manager.transaction(async (manager) => {
      const entry = manager.create(WoodProcessingEntry, {
        stageId: stage.id,
        stageName: stage.name,
        employees,
        outputQuantity: data.outputQuantity,
        wasteQuantity,
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

      const laborCost = round(data.outputQuantity * stage.wageRatePerUnit);
      const totalCost = round(materialCost + laborCost);
      const unitPrice = round(totalCost / data.outputQuantity);

      const outputBatchRepo = manager.getRepository(WoodStockBatch);
      const outputBatch = await outputBatchRepo.save(
        outputBatchRepo.create({
          woodTypeId: stage.outputTypeId,
          woodTypeName: stage.outputType.name,
          quantity: data.outputQuantity,
          quantityRemaining: data.outputQuantity,
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
            quantityPurchased: data.outputQuantity,
            unitPrice,
            totalCost,
            quantityRemaining: data.outputQuantity,
            purchaseDate: entryDate,
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
      // across whoever's on the entry, based on OUTPUT quantity, per the
      // agreed wage model.
      const weightShare = round(data.outputQuantity / employees.length);
      const amount = round(weightShare * stage.wageRatePerUnit);
      const periodMonth = entryDate.slice(0, 7);
      const payoutRepo = manager.getRepository(Payout);
      const employeeRepo = manager.getRepository(Employee);
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
