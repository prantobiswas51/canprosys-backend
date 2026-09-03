import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WoodStage } from './wood-stage.entity';
import { WoodTypesService } from './wood-types.service';
import { RawMaterialsService } from '../raw-materials/raw-materials.service';
import { WasteTypesService } from '../waste-management/waste-types.service';
import { isForeignKeyViolation } from '../common/is-foreign-key-violation';

export interface CreateWoodStageInput {
  name: string;
  inputTypeId: number;
  outputTypeId: number;
  wageRatePerUnit: number;
  sequence?: number;
  mirrorToRawMaterialId?: number;
  defaultWasteTypeId?: number;
}

// mirrorToRawMaterialId/defaultWasteTypeId can be explicitly set to null on
// update (to clear a previously-set value) -- undefined still means "leave
// this field alone", null means "unset it".
export type UpdateWoodStageInput = Partial<Omit<CreateWoodStageInput, 'mirrorToRawMaterialId' | 'defaultWasteTypeId'>> & {
  active?: boolean;
  mirrorToRawMaterialId?: number | null;
  defaultWasteTypeId?: number | null;
};

@Injectable()
export class WoodStagesService {
  constructor(
    @InjectRepository(WoodStage) private woodStageRepository: Repository<WoodStage>,
    private woodTypesService: WoodTypesService,
    private rawMaterialsService: RawMaterialsService,
    private wasteTypesService: WasteTypesService,
  ) {}

  getWoodStages() {
    return this.woodStageRepository.find({
      relations: ['inputType', 'outputType', 'mirrorToRawMaterial', 'defaultWasteType'],
      order: { sequence: 'ASC', id: 'ASC' },
    });
  }

  async getWoodStageById(id: number) {
    const stage = await this.woodStageRepository.findOne({
      where: { id },
      relations: ['inputType', 'outputType', 'mirrorToRawMaterial', 'defaultWasteType'],
    });
    if (!stage) {
      throw new NotFoundException(`Wood stage #${id} not found`);
    }
    return stage;
  }

  async createWoodStage(data: CreateWoodStageInput) {
    if (data.wageRatePerUnit < 0) {
      throw new BadRequestException('Wage rate cannot be negative');
    }
    // Both sides need to actually exist -- fail fast with a clear message
    // instead of a raw FK-violation later.
    await this.woodTypesService.getWoodTypeById(data.inputTypeId);
    await this.woodTypesService.getWoodTypeById(data.outputTypeId);
    if (data.mirrorToRawMaterialId != null) {
      await this.rawMaterialsService.getRawMaterialById(data.mirrorToRawMaterialId);
    }
    if (data.defaultWasteTypeId != null) {
      await this.wasteTypesService.getWasteTypeById(data.defaultWasteTypeId);
    }

    const stage = this.woodStageRepository.create({
      name: data.name,
      inputTypeId: data.inputTypeId,
      outputTypeId: data.outputTypeId,
      wageRatePerUnit: data.wageRatePerUnit,
      sequence: data.sequence ?? 0,
      mirrorToRawMaterialId: data.mirrorToRawMaterialId,
      defaultWasteTypeId: data.defaultWasteTypeId,
    });
    return this.woodStageRepository.save(stage);
  }

  async updateWoodStage(id: number, data: UpdateWoodStageInput) {
    const stage = await this.getWoodStageById(id);

    if (data.wageRatePerUnit != null) {
      if (data.wageRatePerUnit < 0) {
        throw new BadRequestException('Wage rate cannot be negative');
      }
      stage.wageRatePerUnit = data.wageRatePerUnit;
    }
    if (data.name != null) stage.name = data.name;
    if (data.sequence != null) stage.sequence = data.sequence;
    if (data.active != null) stage.active = data.active;
    if (data.inputTypeId != null) {
      await this.woodTypesService.getWoodTypeById(data.inputTypeId);
      stage.inputTypeId = data.inputTypeId;
    }
    if (data.outputTypeId != null) {
      await this.woodTypesService.getWoodTypeById(data.outputTypeId);
      stage.outputTypeId = data.outputTypeId;
    }
    if (data.mirrorToRawMaterialId !== undefined) {
      if (data.mirrorToRawMaterialId != null) {
        await this.rawMaterialsService.getRawMaterialById(data.mirrorToRawMaterialId);
      }
      stage.mirrorToRawMaterialId = data.mirrorToRawMaterialId ?? undefined;
    }
    if (data.defaultWasteTypeId !== undefined) {
      if (data.defaultWasteTypeId != null) {
        await this.wasteTypesService.getWasteTypeById(data.defaultWasteTypeId);
      }
      stage.defaultWasteTypeId = data.defaultWasteTypeId ?? undefined;
    }

    return this.woodStageRepository.save(stage);
  }

  async deleteWoodStage(id: number) {
    const stage = await this.getWoodStageById(id);
    try {
      await this.woodStageRepository.remove(stage);
    } catch (err) {
      if (isForeignKeyViolation(err)) {
        throw new ConflictException(
          `Cannot delete "${stage.name}" -- it has processing entries logged against it. Those records need to stay traceable to their stage.`,
        );
      }
      throw err;
    }
    return { deleted: true };
  }

}
