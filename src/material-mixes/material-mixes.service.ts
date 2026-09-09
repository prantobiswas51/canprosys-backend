import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { MaterialMix } from './material-mix.entity';
import { MaterialBatch } from '../material-batches/material-batch.entity';
import { RawMaterial } from '../raw-materials/raw-material.entity';
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

// Ratio-driven variant of CreateMaterialMixInput -- instead of the caller
// working out exact quantities, this uses however much of A and B is
// CURRENTLY in stock and figures out the largest batch it can make at that
// ratio, consuming as much as possible without either material going
// negative (see createAutoMix). E.g. a 9:1 ratio with 900kg of A and 150kg
// of B in stock consumes all 900kg of A + 100kg of B, leaving 50kg of B.
export interface CreateAutoMaterialMixInput {
  materialAId: number;
  materialBId: number;
  outputMaterialId: number;
  ratioA: number;
  ratioB: number;
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
    this.assertDistinctMaterials(data.materialAId, data.materialBId, data.outputMaterialId);

    const [materialA, materialB, outputMaterial] = await this.loadMaterials(
      data.materialAId,
      data.materialBId,
      data.outputMaterialId,
    );

    return this.mixRepository.manager.transaction((manager) =>
      this.applyMix(manager, materialA, materialB, data.quantityA, data.quantityB, outputMaterial, data.mixDate),
    );
  }

  // Same idea, but the quantities aren't given -- they're derived from
  // whatever's currently in stock for A and B, at the given ratio, so the
  // whole (or as much as possible of the) existing stock gets used up in
  // one go instead of the person doing the arithmetic themselves.
  async createAutoMix(data: CreateAutoMaterialMixInput) {
    if (data.ratioA <= 0 || data.ratioB <= 0) {
      throw new BadRequestException('Both ratio parts must be greater than zero');
    }
    this.assertDistinctMaterials(data.materialAId, data.materialBId, data.outputMaterialId);

    const [materialA, materialB, outputMaterial] = await this.loadMaterials(
      data.materialAId,
      data.materialBId,
      data.outputMaterialId,
    );

    return this.mixRepository.manager.transaction(async (manager) => {
      const batchRepository = manager.getRepository(MaterialBatch);
      // Computed inside the same transaction that consumes it, so a
      // concurrent mix/consumption can't sneak in between "check stock" and
      // "draw it down" and produce a batch bigger than what's really there.
      const availableA = await this.sumAvailable(batchRepository, materialA.id);
      const availableB = await this.sumAvailable(batchRepository, materialB.id);

      const unitsFromA = availableA / data.ratioA;
      const unitsFromB = availableB / data.ratioB;
      const limitingUnits = Math.min(unitsFromA, unitsFromB);

      if (!(limitingUnits > 0)) {
        throw new BadRequestException(
          `Not enough stock to mix at a ${data.ratioA}:${data.ratioB} ratio -- ${materialA.name} has ${round(availableA)} ${materialA.unit}, ${materialB.name} has ${round(availableB)} ${materialB.unit} available.`,
        );
      }

      const quantityA = round(limitingUnits * data.ratioA);
      const quantityB = round(limitingUnits * data.ratioB);

      return this.applyMix(manager, materialA, materialB, quantityA, quantityB, outputMaterial, data.mixDate);
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

  private assertDistinctMaterials(materialAId: number, materialBId: number, outputMaterialId: number) {
    if (materialAId === materialBId) {
      throw new BadRequestException('Pick two different materials to mix');
    }
    if (outputMaterialId === materialAId || outputMaterialId === materialBId) {
      throw new BadRequestException('The output material must be different from the two inputs');
    }
  }

  private loadMaterials(materialAId: number, materialBId: number, outputMaterialId: number) {
    return Promise.all([
      this.rawMaterialsService.getRawMaterialById(materialAId),
      this.rawMaterialsService.getRawMaterialById(materialBId),
      this.rawMaterialsService.getRawMaterialById(outputMaterialId),
    ]);
  }

  private async sumAvailable(batchRepository: Repository<MaterialBatch>, rawMaterialId: number) {
    const batches = await batchRepository.find({ where: { rawMaterialId } });
    return batches.reduce((sum, b) => sum + b.quantityRemaining, 0);
  }

  // Shared by createMix and createAutoMix once each has worked out exactly
  // how much of A and B to use -- does the actual consuming/crediting/
  // logging, all inside the caller's transaction.
  private async applyMix(
    manager: EntityManager,
    materialA: RawMaterial,
    materialB: RawMaterial,
    quantityA: number,
    quantityB: number,
    outputMaterial: RawMaterial,
    mixDate: string | undefined,
  ) {
    if (quantityA <= 0 || quantityB <= 0) {
      throw new BadRequestException('Both quantities must be greater than zero');
    }

    // Saved first so its id exists to tag the consumption rows it causes
    // (see deleteMix for how that's used to reverse everything together).
    const mix = manager.create(MaterialMix, {
      materialAId: materialA.id,
      materialAName: materialA.name,
      materialAUnit: materialA.unit,
      quantityA,
      materialBId: materialB.id,
      materialBName: materialB.name,
      materialBUnit: materialB.unit,
      quantityB,
      outputMaterialId: outputMaterial.id,
      outputMaterialName: outputMaterial.name,
      outputUnit: outputMaterial.unit,
      outputQuantity: round(quantityA + quantityB),
      mixDate,
    });
    const savedMix = await manager.save(mix);

    const consumedA = await this.materialConsumptionsService.recordConsumption(
      {
        rawMaterialId: materialA.id,
        quantity: quantityA,
        note: `Mixed into ${outputMaterial.name}`,
        materialMixId: savedMix.id,
      },
      manager,
    );
    const consumedB = await this.materialConsumptionsService.recordConsumption(
      {
        rawMaterialId: materialB.id,
        quantity: quantityB,
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
      purchaseDate: mixDate,
    });
    const savedBatch = await batchRepository.save(batch);

    savedMix.outputBatchId = savedBatch.id;
    return manager.save(savedMix);
  }
}
