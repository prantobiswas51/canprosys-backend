import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { WoodStockBatch } from './wood-stock-batch.entity';
import { WoodStage } from './wood-stage.entity';
import { WoodTypesService } from './wood-types.service';
import { round } from '../common/round';

export interface PurchaseWoodInput {
  woodTypeId: number;
  quantity: number;
  unitPrice: number;
  batchDate?: string;
  note?: string;
}

export interface WoodStockSummaryRow {
  woodTypeId: number;
  woodTypeName: string;
  unit: string;
  quantityRemaining: number;
  // Weighted average of unitPrice across whatever batches still have stock
  // left -- not a single number stored anywhere, computed fresh each time.
  averageUnitPrice: number;
  stockValue: number;
}

@Injectable()
export class WoodStockService {
  constructor(
    @InjectRepository(WoodStockBatch) private batchRepository: Repository<WoodStockBatch>,
    @InjectRepository(WoodStage) private woodStageRepository: Repository<WoodStage>,
    private woodTypesService: WoodTypesService,
  ) {}

  // Buying raw wood (or, in principle, any wood type) directly from a
  // supplier -- no processing involved, so no consumption/wages/waste, just
  // a plain batch at whatever price was paid.
  async purchase(data: PurchaseWoodInput) {
    if (data.quantity <= 0) {
      throw new BadRequestException('Quantity must be greater than zero');
    }
    if (data.unitPrice < 0) {
      throw new BadRequestException('Unit price cannot be negative');
    }

    const woodType = await this.woodTypesService.getWoodTypeById(data.woodTypeId);

    const batch = this.batchRepository.create({
      woodTypeId: woodType.id,
      woodTypeName: woodType.name,
      quantity: data.quantity,
      quantityRemaining: data.quantity,
      unitPrice: data.unitPrice,
      totalCost: round(data.quantity * data.unitPrice),
      batchDate: data.batchDate,
      note: data.note,
    });
    return this.batchRepository.save(batch);
  }

  getBatches(woodTypeId?: number) {
    return this.batchRepository.find({
      where: woodTypeId != null ? { woodTypeId } : {},
      order: { createdAt: 'DESC' },
    });
  }

  // Called by MaterialConsumptionsService right after it draws down
  // RawMaterial/MaterialBatch stock for some rawMaterialId. If that raw
  // material happens to be the mirrored output of a wood-processing stage
  // (e.g. Packaging consuming কোনা কাটা কাঠ), this draws the SAME quantity
  // down from that stage's WoodStockBatch rows too -- oldest batch first --
  // so the wood-processing stock view stays in sync with the general
  // inventory instead of only ever growing. A no-op for any raw material
  // that isn't wood-processing output (the common case).
  async syncConsumptionFromRawMaterial(
    rawMaterialId: number,
    quantity: number,
    manager?: EntityManager,
  ): Promise<void> {
    if (quantity <= 0) return;

    const stageRepository = manager ? manager.getRepository(WoodStage) : this.woodStageRepository;
    const stage = await stageRepository.findOneBy({ mirrorToRawMaterialId: rawMaterialId });
    if (!stage) return;

    const batchRepository = manager ? manager.getRepository(WoodStockBatch) : this.batchRepository;
    const batches = await batchRepository.find({
      where: { woodTypeId: stage.outputTypeId },
      order: { batchDate: 'ASC', id: 'ASC' },
    });

    let remaining = quantity;
    for (const batch of batches) {
      if (remaining <= 0) break;
      if (batch.quantityRemaining <= 0) continue;
      const drawn = Math.min(batch.quantityRemaining, remaining);
      batch.quantityRemaining = round(batch.quantityRemaining - drawn);
      await batchRepository.save(batch);
      remaining -= drawn;
    }
    // If remaining > 0 here, the wood-processing side simply doesn't have
    // enough batch history to fully mirror this draw (e.g. stock that
    // existed before this sync was added) -- RawMaterial/MaterialBatch is
    // still the authoritative stock check, so this stays a best-effort
    // sync rather than something that can block the consumption.
  }

  async getStockSummary(): Promise<WoodStockSummaryRow[]> {
    const woodTypes = await this.woodTypesService.getWoodTypes();
    const batches = await this.batchRepository.find({ where: {} });

    return woodTypes.map((woodType) => {
      const relevant = batches.filter(
        (b) => b.woodTypeId === woodType.id && b.quantityRemaining > 0,
      );
      const quantityRemaining = round(relevant.reduce((sum, b) => sum + b.quantityRemaining, 0));
      const stockValue = round(relevant.reduce((sum, b) => sum + b.quantityRemaining * b.unitPrice, 0));
      return {
        woodTypeId: woodType.id,
        woodTypeName: woodType.name,
        unit: woodType.unit,
        quantityRemaining,
        averageUnitPrice: quantityRemaining > 0 ? round(stockValue / quantityRemaining) : 0,
        stockValue,
      };
    });
  }
}
