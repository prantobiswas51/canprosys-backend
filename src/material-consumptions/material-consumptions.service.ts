import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { MaterialConsumption } from './material-consumption.entity';
import { MaterialBatch } from '../material-batches/material-batch.entity';
import { RawMaterialsService } from '../raw-materials/raw-materials.service';
import { WoodStockService } from '../wood-processing/wood-stock.service';
import { round } from '../common/round';

export interface RecordConsumptionInput {
  rawMaterialId: number;
  quantity: number;
  note?: string;
  dailyEntryId?: number;
}

@Injectable()
export class MaterialConsumptionsService {
  constructor(
    @InjectRepository(MaterialConsumption)
    private consumptionRepository: Repository<MaterialConsumption>,
    @InjectRepository(MaterialBatch)
    private batchRepository: Repository<MaterialBatch>,
    private rawMaterialsService: RawMaterialsService,
    private woodStockService: WoodStockService,
  ) {}

  getConsumptions(rawMaterialId?: number) {
    return this.consumptionRepository.find({
      where: rawMaterialId != null ? { rawMaterialId } : {},
      order: { consumedAt: 'DESC' },
    });
  }

  async getConsumptionById(id: number) {
    const consumption = await this.consumptionRepository.findOneBy({ id });
    if (!consumption) {
      throw new NotFoundException(`Material consumption #${id} not found`);
    }
    return consumption;
  }

  // FIFO: draws from the oldest batch with quantityRemaining > 0 first,
  // spilling into the next batch if one isn't enough. Each batch touched
  // gets its own consumption row since each can carry a different unit cost
  // -- this is what makes later COGS/margin computation possible.
  //
  // Accepts an optional transaction `manager` -- when another service (e.g.
  // DailyEntryService) calls this from inside its own transaction, passing
  // the manager through means these batch/consumption writes commit or
  // rollback together with whatever triggered the consumption, instead of
  // being separate, un-rollback-able writes.
  async recordConsumption(data: RecordConsumptionInput, manager?: EntityManager) {
    if (data.quantity <= 0) {
      throw new BadRequestException('Quantity must be greater than zero');
    }

    const batchRepository = manager ? manager.getRepository(MaterialBatch) : this.batchRepository;
    const consumptionRepository = manager
      ? manager.getRepository(MaterialConsumption)
      : this.consumptionRepository;

    const rawMaterial = await this.rawMaterialsService.getRawMaterialById(
      data.rawMaterialId,
    );

    const batches = await batchRepository.find({
      where: { rawMaterialId: rawMaterial.id },
      order: { purchaseDate: 'ASC', id: 'ASC' },
    });
    const available = batches.filter((b) => b.quantityRemaining > 0);
    const totalAvailable = available.reduce(
      (sum, b) => sum + b.quantityRemaining,
      0,
    );

    if (totalAvailable < data.quantity) {
      throw new BadRequestException(
        `Not enough stock: requested ${data.quantity} ${rawMaterial.unit}, only ${totalAvailable} ${rawMaterial.unit} available`,
      );
    }

    let remainingToConsume = data.quantity;
    const created: MaterialConsumption[] = [];

    for (const batch of available) {
      if (remainingToConsume <= 0) break;

      const drawn = Math.min(batch.quantityRemaining, remainingToConsume);
      batch.quantityRemaining = round(batch.quantityRemaining - drawn);
      await batchRepository.save(batch);

      const consumption = consumptionRepository.create({
        rawMaterialId: rawMaterial.id,
        rawMaterialName: rawMaterial.name,
        rawMaterialUnit: rawMaterial.unit,
        materialBatchId: batch.id,
        quantity: drawn,
        unitCost: batch.unitPrice,
        totalCost: round(drawn * batch.unitPrice),
        note: data.note,
        dailyEntryId: data.dailyEntryId,
      });
      created.push(await consumptionRepository.save(consumption));

      remainingToConsume -= drawn;
    }

    // If this raw material is the mirrored output of a wood-processing
    // stage (e.g. Packaging drawing on কোনা কাটা কাঠ), keep that module's
    // own stock view in sync -- same quantity, oldest WoodStockBatch first.
    // No-op for any raw material that isn't wood-processing output.
    await this.woodStockService.syncConsumptionFromRawMaterial(
      rawMaterial.id,
      data.quantity,
      manager,
    );

    return created;
  }

  // Reverses a consumption row: restores its quantity back to the batch it
  // was drawn from (if that batch still exists), mirrors that restore back
  // into wood-processing stock if applicable, then deletes the record.
  // Accepts an optional transaction `manager` for the same reason
  // recordConsumption does -- so an entry edit/delete's reversal commits or
  // rolls back atomically with everything else it's undoing.
  async deleteConsumption(id: number, manager?: EntityManager) {
    const batchRepository = manager ? manager.getRepository(MaterialBatch) : this.batchRepository;
    const consumptionRepository = manager
      ? manager.getRepository(MaterialConsumption)
      : this.consumptionRepository;

    const consumption = await consumptionRepository.findOneBy({ id });
    if (!consumption) {
      throw new NotFoundException(`Material consumption #${id} not found`);
    }

    if (consumption.materialBatchId != null) {
      const batch = await batchRepository.findOneBy({
        id: consumption.materialBatchId,
      });
      if (batch) {
        batch.quantityRemaining = round(batch.quantityRemaining + consumption.quantity);
        await batchRepository.save(batch);
      }
    }

    await this.woodStockService.restoreConsumptionToRawMaterial(
      consumption.rawMaterialId,
      consumption.quantity,
      manager,
    );

    await consumptionRepository.remove(consumption);
    return { deleted: true };
  }

  // Reverses every consumption row tied to a given daily entry -- used when
  // that entry is edited or deleted, so the raw material (and mirrored wood
  // stock) draw it caused gets fully undone before either re-applying new
  // values or removing the entry outright.
  async deleteConsumptionsForDailyEntry(dailyEntryId: number, manager?: EntityManager) {
    const consumptionRepository = manager
      ? manager.getRepository(MaterialConsumption)
      : this.consumptionRepository;
    const rows = await consumptionRepository.find({ where: { dailyEntryId } });
    for (const row of rows) {
      await this.deleteConsumption(row.id, manager);
    }
  }
}
