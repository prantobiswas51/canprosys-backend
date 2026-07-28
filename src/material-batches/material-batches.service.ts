import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MaterialBatch } from './material-batch.entity';
import { RawMaterialsService } from '../raw-materials/raw-materials.service';

export interface CreateMaterialBatchInput {
  rawMaterialId: number;
  quantityPurchased: number;
  unitPrice: number;
  purchaseDate?: string;
}

export type UpdateMaterialBatchInput = Partial<CreateMaterialBatchInput>;

@Injectable()
export class MaterialBatchesService {
  constructor(
    @InjectRepository(MaterialBatch)
    private batchRepository: Repository<MaterialBatch>,
    private rawMaterialsService: RawMaterialsService,
  ) {}

  getBatches(rawMaterialId?: number) {
    return this.batchRepository.find({
      where: rawMaterialId != null ? { rawMaterialId } : {},
      order: { purchaseDate: 'ASC', id: 'ASC' },
    });
  }

  async getBatchById(id: number) {
    const batch = await this.batchRepository.findOneBy({ id });
    if (!batch) {
      throw new NotFoundException(`Material batch #${id} not found`);
    }
    return batch;
  }

  async createBatch(data: CreateMaterialBatchInput) {
    if (data.quantityPurchased <= 0) {
      throw new BadRequestException('Quantity purchased must be greater than zero');
    }
    if (data.unitPrice < 0) {
      throw new BadRequestException('Unit price cannot be negative');
    }

    const rawMaterial = await this.rawMaterialsService.getRawMaterialById(
      data.rawMaterialId,
    );

    const batch = this.batchRepository.create({
      rawMaterialId: rawMaterial.id,
      rawMaterialName: rawMaterial.name,
      rawMaterialUnit: rawMaterial.unit,
      quantityPurchased: data.quantityPurchased,
      unitPrice: data.unitPrice,
      totalCost: data.quantityPurchased * data.unitPrice,
      quantityRemaining: data.quantityPurchased,
      purchaseDate: data.purchaseDate,
    });
    return this.batchRepository.save(batch);
  }

  // Batches are meant to be near-immutable purchase records -- this only
  // exists to fix data-entry mistakes, not to "re-price" old stock.
  async updateBatch(id: number, data: UpdateMaterialBatchInput) {
    const batch = await this.getBatchById(id);

    if (data.quantityPurchased != null) {
      if (data.quantityPurchased <= 0) {
        throw new BadRequestException('Quantity purchased must be greater than zero');
      }
      const alreadyConsumed = batch.quantityPurchased - batch.quantityRemaining;
      if (data.quantityPurchased < alreadyConsumed) {
        throw new BadRequestException(
          `Cannot reduce quantity below what's already been consumed (${alreadyConsumed})`,
        );
      }
      batch.quantityRemaining = data.quantityPurchased - alreadyConsumed;
      batch.quantityPurchased = data.quantityPurchased;
    }

    if (data.unitPrice != null) {
      if (data.unitPrice < 0) {
        throw new BadRequestException('Unit price cannot be negative');
      }
      batch.unitPrice = data.unitPrice;
    }

    batch.totalCost = batch.quantityPurchased * batch.unitPrice;

    if (data.purchaseDate != null) {
      batch.purchaseDate = data.purchaseDate;
    }

    return this.batchRepository.save(batch);
  }

  async deleteBatch(id: number) {
    const batch = await this.getBatchById(id);
    await this.batchRepository.remove(batch);
    return { deleted: true };
  }
}
