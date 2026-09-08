import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MaterialMix } from './material-mix.entity';
import { MaterialBatch } from '../material-batches/material-batch.entity';
import { RawMaterialsService } from '../raw-materials/raw-materials.service';
import { MaterialConsumptionsService } from '../material-consumptions/material-consumptions.service';
import { round } from '../common/round';

export interface CreateMaterialMixInput {
  materialAId: number;
  quantityA: number;
  materialBId: number;
  quantityB: number;
  outputMaterialId: number;
  mixDate?: string;
}

@Injectable()
export class MaterialMixesService {
  constructor(
    @InjectRepository(MaterialMix) private mixRepository: Repository<MaterialMix>,
    private rawMaterialsService: RawMaterialsService,
    private materialConsumptionsService: MaterialConsumptionsService,
  ) {}

  getMixes() {
    return this.mixRepository.find({ order: { createdAt: 'DESC' } });
  }

  // Consumes quantityA of materialA + quantityB of materialB (FIFO, same
  // machinery every other raw-material draw uses) and credits the output
  // material with a new batch sized at quantityA + quantityB -- mixing
  // combines volume/weight, it doesn't create or destroy it. That new
  // batch's cost is exactly what the consumed A + B cost, spread evenly
  // across the combined output, so downstream costing (recipes, etc.) still
  // reflects real input prices.
  async createMix(data: CreateMaterialMixInput) {
    if (data.quantityA <= 0 || data.quantityB <= 0) {
      throw new BadRequestException('Both quantities must be greater than zero');
    }
    if (data.materialAId === data.materialBId) {
      throw new BadRequestException('Pick two different materials to mix');
    }
    if (data.outputMaterialId === data.materialAId || data.outputMaterialId === data.materialBId) {
      throw new BadRequestException('The output material must be different from the two inputs');
    }

    const [materialA, materialB, outputMaterial] = await Promise.all([
      this.rawMaterialsService.getRawMaterialById(data.materialAId),
      this.rawMaterialsService.getRawMaterialById(data.materialBId),
      this.rawMaterialsService.getRawMaterialById(data.outputMaterialId),
    ]);

    return this.mixRepository.manager.transaction(async (manager) => {
      // Saved first so its id exists to tag the consumption rows it causes
      // (see deleteMix for how that's used to reverse everything together).
      const mix = manager.create(MaterialMix, {
        materialAId: materialA.id,
        materialAName: materialA.name,
        materialAUnit: materialA.unit,
        quantityA: data.quantityA,
        materialBId: materialB.id,
        materialBName: materialB.name,
        materialBUnit: materialB.unit,
        quantityB: data.quantityB,
        outputMaterialId: outputMaterial.id,
        outputMaterialName: outputMaterial.name,
        outputUnit: outputMaterial.unit,
        outputQuantity: round(data.quantityA + data.quantityB),
        mixDate: data.mixDate,
      });
      const savedMix = await manager.save(mix);

      const consumedA = await this.materialConsumptionsService.recordConsumption(
        {
          rawMaterialId: materialA.id,
          quantity: data.quantityA,
          note: `Mixed into ${outputMaterial.name}`,
          materialMixId: savedMix.id,
        },
        manager,
      );
      const consumedB = await this.materialConsumptionsService.recordConsumption(
        {
          rawMaterialId: materialB.id,
          quantity: data.quantityB,
          note: `Mixed into ${outputMaterial.name}`,
          materialMixId: savedMix.id,
        },
        manager,
      );

      const totalCost = round([...consumedA, ...consumedB].reduce((sum, c) => sum + c.totalCost, 0));
      const outputQuantity = savedMix.outputQuantity;
      const unitPrice = outputQuantity > 0 ? round(totalCost / outputQuantity) : 0;

      const batchRepository = manager.getRepository(MaterialBatch);
      const batch = batchRepository.create({
        rawMaterialId: outputMaterial.id,
        rawMaterialName: outputMaterial.name,
        rawMaterialUnit: outputMaterial.unit,
        quantityPurchased: outputQuantity,
        unitPrice,
        totalCost,
        quantityRemaining: outputQuantity,
        purchaseDate: data.mixDate,
      });
      const savedBatch = await batchRepository.save(batch);

      savedMix.outputBatchId = savedBatch.id;
      return manager.save(savedMix);
    });
  }

  // Reverses a mix: removes the output batch it created (blocked if any of
  // it has already been consumed elsewhere, same rule as a normal purchase
  // batch), restores whatever it drew from materials A and B, then deletes
  // the log row -- all inside one transaction.
  async deleteMix(id: number) {
    const mix = await this.mixRepository.findOneBy({ id });
    if (!mix) {
      throw new NotFoundException(`Material mix #${id} not found`);
    }

    return this.mixRepository.manager.transaction(async (manager) => {
      const batchRepository = manager.getRepository(MaterialBatch);
      if (mix.outputBatchId != null) {
        const batch = await batchRepository.findOneBy({ id: mix.outputBatchId });
        if (batch) {
          if (batch.quantityRemaining !== batch.quantityPurchased) {
            throw new ConflictException(
              `Cannot delete this mix -- ${round(batch.quantityPurchased - batch.quantityRemaining)} ${batch.rawMaterialUnit ?? ''} of the ${mix.outputMaterialName} it produced has already been used elsewhere.`,
            );
          }
          await batchRepository.remove(batch);
        }
      }

      await this.materialConsumptionsService.deleteConsumptionsForMaterialMix(mix.id, manager);
      await manager.remove(mix);
      return { deleted: true };
    });
  }
}
