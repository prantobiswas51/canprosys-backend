import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { RawMaterial } from './raw-material.entity';

export interface CreateRawMaterialInput {
  name: string;
  unit: string;
}

export type UpdateRawMaterialInput = Partial<CreateRawMaterialInput>;

@Injectable()
export class RawMaterialsService {
  constructor(
    @InjectRepository(RawMaterial)
    private rawMaterialRepository: Repository<RawMaterial>,
  ) {}

  getRawMaterials() {
    return this.rawMaterialRepository.find();
  }

  async getRawMaterialById(id: number) {
    const rawMaterial = await this.rawMaterialRepository.findOneBy({ id });
    if (!rawMaterial) {
      throw new NotFoundException(`Raw material #${id} not found`);
    }
    return rawMaterial;
  }

  async createRawMaterial(data: CreateRawMaterialInput) {
    const slug = await this.generateUniqueSlug(data.name);
    const rawMaterial = this.rawMaterialRepository.create({ ...data, slug });
    return this.rawMaterialRepository.save(rawMaterial);
  }

  async updateRawMaterial(id: number, data: UpdateRawMaterialInput) {
    const rawMaterial = await this.getRawMaterialById(id);
    Object.assign(rawMaterial, data);
    return this.rawMaterialRepository.save(rawMaterial);
  }

  async deleteRawMaterial(id: number) {
    const rawMaterial = await this.getRawMaterialById(id);
    try {
      await this.rawMaterialRepository.remove(rawMaterial);
    } catch (err) {
      if (this.isForeignKeyViolation(err)) {
        throw new ConflictException(
          `Cannot delete "${rawMaterial.name}" -- it's used in a recipe's Materials (BOM). Remove it from those recipes first.`,
        );
      }
      throw err;
    }
    return { deleted: true };
  }

  private isForeignKeyViolation(err: unknown): boolean {
    return (
      err instanceof QueryFailedError &&
      (err as QueryFailedError & { code?: string }).code === '23503'
    );
  }

  // Derived from the name ("Poly Bag" -> "poly_bag"), same pattern as
  // Task's slug -- de-dupes against existing slugs so two materials never
  // collide. Left untouched on update/rename.
  private async generateUniqueSlug(name: string) {
    const base =
      name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '') || 'material';

    let slug = base;
    let suffix = 2;
    while (await this.rawMaterialRepository.findOneBy({ slug })) {
      slug = `${base}_${suffix}`;
      suffix += 1;
    }
    return slug;
  }
}
