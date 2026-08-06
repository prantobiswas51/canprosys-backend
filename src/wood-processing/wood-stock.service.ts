import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WoodStockBatch } from './wood-stock-batch.entity';
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
