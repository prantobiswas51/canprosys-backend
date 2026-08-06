import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, FindOperator, Repository } from 'typeorm';
import { WasteSale } from './waste-sale.entity';
import { WasteBatch } from './waste-batch.entity';
import { WasteTypesService } from './waste-types.service';
import { round } from '../common/round';

export interface CreateWasteSaleInput {
  wasteTypeId: number;
  quantity: number;
  unitPrice: number;
  saleDate?: string;
  buyer?: string;
  note?: string;
}

@Injectable()
export class WasteSalesService {
  constructor(
    @InjectRepository(WasteSale) private wasteSaleRepository: Repository<WasteSale>,
    @InjectRepository(WasteBatch) private wasteBatchRepository: Repository<WasteBatch>,
    private wasteTypesService: WasteTypesService,
  ) {}

  // "Waste minus" -- selling waste off. FIFO draw across whatever batches
  // of this waste type still have stock, same pattern as material
  // consumption, just without a separate per-draw audit entity (waste sales
  // are lower-stakes than raw material COGS).
  async createSale(data: CreateWasteSaleInput) {
    if (data.quantity <= 0) {
      throw new BadRequestException('Quantity must be greater than zero');
    }
    if (data.unitPrice < 0) {
      throw new BadRequestException('Unit price cannot be negative');
    }

    const wasteType = await this.wasteTypesService.getWasteTypeById(data.wasteTypeId);

    return this.wasteSaleRepository.manager.transaction(async (manager) => {
      const batchRepo = manager.getRepository(WasteBatch);
      const batches = await batchRepo.find({
        where: { wasteTypeId: wasteType.id },
        order: { collectedDate: 'ASC', id: 'ASC' },
      });
      const available = batches.filter((b) => b.quantityRemaining > 0);
      const totalAvailable = available.reduce((sum, b) => sum + b.quantityRemaining, 0);

      if (totalAvailable < data.quantity) {
        throw new BadRequestException(
          `Not enough "${wasteType.name}" waste in stock: requested ${data.quantity}, only ${totalAvailable} available`,
        );
      }

      let remaining = data.quantity;
      for (const batch of available) {
        if (remaining <= 0) break;
        const drawn = Math.min(batch.quantityRemaining, remaining);
        batch.quantityRemaining = round(batch.quantityRemaining - drawn);
        await batchRepo.save(batch);
        remaining -= drawn;
      }

      const saleDate = data.saleDate || new Date().toISOString().slice(0, 10);
      const sale = manager.create(WasteSale, {
        wasteTypeId: wasteType.id,
        wasteTypeName: wasteType.name,
        quantity: data.quantity,
        unitPrice: data.unitPrice,
        totalAmount: round(data.quantity * data.unitPrice),
        saleDate,
        buyer: data.buyer,
        note: data.note,
      });
      return manager.save(sale);
    });
  }

  getSales(wasteTypeId?: number, from?: string, to?: string) {
    const where: { wasteTypeId?: number; saleDate?: FindOperator<string> } = {};
    if (wasteTypeId != null) where.wasteTypeId = wasteTypeId;
    if (from && to) where.saleDate = Between(from, to);

    return this.wasteSaleRepository.find({
      where,
      order: { saleDate: 'DESC', id: 'DESC' },
    });
  }
}
