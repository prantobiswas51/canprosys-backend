import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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

  createRawMaterial(data: CreateRawMaterialInput) {
    const rawMaterial = this.rawMaterialRepository.create(data);
    return this.rawMaterialRepository.save(rawMaterial);
  }

  async updateRawMaterial(id: number, data: UpdateRawMaterialInput) {
    const rawMaterial = await this.getRawMaterialById(id);
    Object.assign(rawMaterial, data);
    return this.rawMaterialRepository.save(rawMaterial);
  }

  async deleteRawMaterial(id: number) {
    const rawMaterial = await this.getRawMaterialById(id);
    await this.rawMaterialRepository.remove(rawMaterial);
    return { deleted: true };
  }
}
