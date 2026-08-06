import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, EntityManager, FindOperator, Repository } from 'typeorm';
import { WasteBatch } from './waste-batch.entity';
import { WasteTypesService } from './waste-types.service';
import { round } from '../common/round';

export interface CreateWasteBatchInput {
  wasteTypeId: number;
  quantity: number;
  collectedDate?: string;
  note?: string;
  sourceEntryId?: number;
}

export interface WasteStockRow {
  wasteTypeId: number;
  wasteTypeName: string;
  quantityRemaining: number;
}

@Injectable()
export class WasteBatchesService {
  constructor(
    @InjectRepository(WasteBatch) private wasteBatchRepository: Repository<WasteBatch>,
    private wasteTypesService: WasteTypesService,
  ) {}

  // Manual "Add waste" -- the automatic path (waste produced as a byproduct
  // of a wood processing entry) goes through WoodProcessingService instead,
  // which sets sourceEntryId. This one is for anything collected outside
  // that flow.
  // Accepts an optional transaction `manager` -- when WoodProcessingService
  // calls this from inside its own transaction (to auto-record waste
  // produced by a processing entry), passing the manager through means this
  // write commits/rolls back together with the entry, instead of being a
  // separate, un-rollback-able write.
  async createWasteBatch(data: CreateWasteBatchInput, manager?: EntityManager) {
    if (data.quantity <= 0) {
      throw new BadRequestException('Quantity must be greater than zero');
    }
    const wasteType = await this.wasteTypesService.getWasteTypeById(data.wasteTypeId);
    const collectedDate = data.collectedDate || new Date().toISOString().slice(0, 10);

    const batchRepository = manager ? manager.getRepository(WasteBatch) : this.wasteBatchRepository;
    const batch = batchRepository.create({
      wasteTypeId: wasteType.id,
      wasteTypeName: wasteType.name,
      quantity: data.quantity,
      quantityRemaining: data.quantity,
      sourceEntryId: data.sourceEntryId,
      collectedDate,
      note: data.note,
    });
    return batchRepository.save(batch);
  }

  // from/to are plain YYYY-MM-DD strings -- the today/3/7/15/month/custom
  // presets are computed on the frontend and passed down as a date range,
  // same pattern as Shipment's date search.
  getWasteBatches(wasteTypeId?: number, from?: string, to?: string) {
    const where: { wasteTypeId?: number; collectedDate?: FindOperator<string> } = {};
    if (wasteTypeId != null) where.wasteTypeId = wasteTypeId;
    if (from && to) where.collectedDate = Between(from, to);

    return this.wasteBatchRepository.find({
      where,
      order: { collectedDate: 'DESC', id: 'DESC' },
    });
  }

  async getStock(): Promise<WasteStockRow[]> {
    const batches = await this.wasteBatchRepository.find({ where: {} });
    const map = new Map<number, WasteStockRow>();
    for (const b of batches) {
      const row = map.get(b.wasteTypeId) ?? {
        wasteTypeId: b.wasteTypeId,
        wasteTypeName: b.wasteTypeName,
        quantityRemaining: 0,
      };
      row.quantityRemaining = round(row.quantityRemaining + b.quantityRemaining);
      map.set(b.wasteTypeId, row);
    }
    return Array.from(map.values()).sort((a, b) => a.wasteTypeName.localeCompare(b.wasteTypeName));
  }

  async getBatchById(id: number) {
    const batch = await this.wasteBatchRepository.findOneBy({ id });
    if (!batch) {
      throw new NotFoundException(`Waste batch #${id} not found`);
    }
    return batch;
  }
}
