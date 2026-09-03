import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WoodType } from './wood-type.entity';
import { isForeignKeyViolation } from '../common/is-foreign-key-violation';
import { isUniqueViolation } from '../common/is-unique-violation';

export interface CreateWoodTypeInput {
  name: string;
  unit: string;
}

@Injectable()
export class WoodTypesService {
  constructor(
    @InjectRepository(WoodType) private woodTypeRepository: Repository<WoodType>,
  ) {}

  getWoodTypes() {
    return this.woodTypeRepository.find({ order: { id: 'ASC' } });
  }

  async getWoodTypeById(id: number) {
    const woodType = await this.woodTypeRepository.findOneBy({ id });
    if (!woodType) {
      throw new NotFoundException(`Wood type #${id} not found`);
    }
    return woodType;
  }

  async createWoodType(data: CreateWoodTypeInput) {
    const woodType = this.woodTypeRepository.create(data);
    try {
      return await this.woodTypeRepository.save(woodType);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(`A wood type named "${data.name}" already exists`);
      }
      throw err;
    }
  }

  async deleteWoodType(id: number) {
    const woodType = await this.getWoodTypeById(id);
    try {
      await this.woodTypeRepository.remove(woodType);
    } catch (err) {
      if (isForeignKeyViolation(err)) {
        throw new ConflictException(
          `Cannot delete "${woodType.name}" -- it's used by a wood stage or has stock batches. Remove those first.`,
        );
      }
      throw err;
    }
    return { deleted: true };
  }


}
