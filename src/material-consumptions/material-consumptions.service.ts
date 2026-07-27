import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MaterialConsumption } from './material-consumption.entity';
import { MaterialBatch } from '../material-batches/material-batch.entity';
import { RawMaterialsService } from '../raw-materials/raw-materials.service';

export interface RecordConsumptionInput {
  rawMaterialId: number;
  quantity: number;
  note?: string;
}

@Injectable()
export class MaterialConsumptionsService {
  constructor(
    @InjectRepository(MaterialConsumption)
    private consumptionRepository: Repository<MaterialConsumption>,
    @InjectRepository(MaterialBatch)
    private batchRepository: Repository<MaterialBatch>,
    private rawMaterialsService: RawMaterialsService,
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
  async recordConsumption(data: RecordConsumptionInput) {
    if (data.quantity <= 0) {
      throw new BadRequestException('Quantity must be greater than zero');
    }

    const rawMaterial = await this.rawMaterialsService.getRawMaterialById(
      data.rawMaterialId,
    );

    const batches = await this.batchRepository.find({
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
      batch.quantityRemaining -= drawn;
      await this.batchRepository.save(batch);

      const consumption = this.consumptionRepository.create({
        rawMaterialId: rawMaterial.id,
        rawMaterialName: rawMaterial.name,
        materialBatchId: batch.id,
        quantity: drawn,
        unitCost: batch.unitPrice,
        totalCost: drawn * batch.unitPrice,
        note: data.note,
      });
      created.push(await this.consumptionRepository.save(consumption));

      remainingToConsume -= drawn;
    }

    return created;
  }

  // Reverses a consumption row: restores its quantity back to the batch it
  // was drawn from (if that batch still exists) before deleting the record.
  async deleteConsumption(id: number) {
    const consumption = await this.getConsumptionById(id);

    if (consumption.materialBatchId != null) {
      const batch = await this.batchRepository.findOneBy({
        id: consumption.materialBatchId,
      });
      if (batch) {
        batch.quantityRemaining += consumption.quantity;
        await this.batchRepository.save(batch);
      }
    }

    await this.consumptionRepository.remove(consumption);
    return { deleted: true };
  }
}
