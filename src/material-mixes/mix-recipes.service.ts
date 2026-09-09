import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MixRecipe } from './mix-recipe.entity';
import { RawMaterialsService } from '../raw-materials/raw-materials.service';

export interface CreateMixRecipeInput {
  materialAId: number;
  ratioA: number;
  materialBId: number;
  ratioB: number;
  outputMaterialId: number;
  active?: boolean;
}

export type UpdateMixRecipeInput = Partial<CreateMixRecipeInput>;

interface MixRecipeValidationFields {
  materialAId: number;
  materialBId: number;
  outputMaterialId: number;
  ratioA: number;
  ratioB: number;
}

@Injectable()
export class MixRecipesService {
  constructor(
    @InjectRepository(MixRecipe) private mixRecipeRepository: Repository<MixRecipe>,
    private rawMaterialsService: RawMaterialsService,
  ) {}

  // Enriched with current material names/units (resolved live, not
  // snapshotted -- this is a live config, not a historical log, so it
  // should always reflect whatever a material's called right now) since
  // that's what the frontend needs to display the list.
  async getMixRecipes() {
    const [recipes, materials] = await Promise.all([
      this.mixRecipeRepository.find({ order: { id: 'ASC' } }),
      this.rawMaterialsService.getRawMaterials(),
    ]);
    const byId = new Map(materials.map((m) => [m.id, m]));
    return recipes.map((r) => ({
      ...r,
      materialAName: byId.get(r.materialAId)?.name ?? 'Unknown',
      materialAUnit: byId.get(r.materialAId)?.unit,
      materialBName: byId.get(r.materialBId)?.name ?? 'Unknown',
      materialBUnit: byId.get(r.materialBId)?.unit,
      outputMaterialName: byId.get(r.outputMaterialId)?.name ?? 'Unknown',
      outputUnit: byId.get(r.outputMaterialId)?.unit,
    }));
  }

  async getMixRecipeById(id: number) {
    const recipe = await this.mixRecipeRepository.findOneBy({ id });
    if (!recipe) {
      throw new NotFoundException(`Mix recipe #${id} not found`);
    }
    return recipe;
  }

  // Which saved, active recipes use this material as one of their two
  // inputs -- called by MaterialBatchesService right after a purchase batch
  // is saved, to decide what (if anything) to auto-mix.
  findActiveRecipesForMaterial(rawMaterialId: number) {
    return this.mixRecipeRepository
      .createQueryBuilder('r')
      .where('r.active = true')
      .andWhere('(r.materialAId = :id OR r.materialBId = :id)', { id: rawMaterialId })
      .getMany();
  }

  async createMixRecipe(data: CreateMixRecipeInput) {
    this.assertValid(data);
    await this.assertMaterialsExist(data);
    const recipe = this.mixRecipeRepository.create({ ...data, active: data.active ?? true });
    return this.mixRecipeRepository.save(recipe);
  }

  async updateMixRecipe(id: number, data: UpdateMixRecipeInput) {
    const recipe = await this.getMixRecipeById(id);
    const merged: MixRecipeValidationFields = { ...recipe, ...data };
    this.assertValid(merged);
    await this.assertMaterialsExist(merged);
    Object.assign(recipe, data);
    return this.mixRecipeRepository.save(recipe);
  }

  async deleteMixRecipe(id: number) {
    const recipe = await this.getMixRecipeById(id);
    await this.mixRecipeRepository.remove(recipe);
    return { deleted: true };
  }

  private assertValid(data: MixRecipeValidationFields) {
    if (data.ratioA <= 0 || data.ratioB <= 0) {
      throw new BadRequestException('Both ratio parts must be greater than zero');
    }
    if (data.materialAId === data.materialBId) {
      throw new BadRequestException('Pick two different materials to mix');
    }
    if (data.outputMaterialId === data.materialAId || data.outputMaterialId === data.materialBId) {
      throw new BadRequestException('The output material must be different from the two inputs');
    }
  }

  private async assertMaterialsExist(data: MixRecipeValidationFields) {
    await Promise.all([
      this.rawMaterialsService.getRawMaterialById(data.materialAId),
      this.rawMaterialsService.getRawMaterialById(data.materialBId),
      this.rawMaterialsService.getRawMaterialById(data.outputMaterialId),
    ]);
  }
}
