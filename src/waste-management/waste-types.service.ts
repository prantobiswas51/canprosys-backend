import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WasteType } from './waste-type.entity';
import { isForeignKeyViolation } from '../common/is-foreign-key-violation';
import { isUniqueViolation } from '../common/is-unique-violation';

export interface CreateWasteTypeInput {
  name: string;
}

@Injectable()
export class WasteTypesService {
  constructor(
    @InjectRepository(WasteType) private wasteTypeRepository: Repository<WasteType>,
  ) {}

  getWasteTypes() {
    return this.wasteTypeRepository.find({ order: { name: 'ASC' } });
  }

  async getWasteTypeById(id: number) {
    const wasteType = await this.wasteTypeRepository.findOneBy({ id });
    if (!wasteType) {
      throw new NotFoundException(`Waste type #${id} not found`);
    }
    return wasteType;
  }

  async createWasteType(data: CreateWasteTypeInput) {
    const wasteType = this.wasteTypeRepository.create(data);
    try {
      return await this.wasteTypeRepository.save(wasteType);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(`A waste type named "${data.name}" already exists`);
      }
      throw err;
    }
  }

  async deleteWasteType(id: number) {
    const wasteType = await this.getWasteTypeById(id);
    try {
      await this.wasteTypeRepository.remove(wasteType);
    } catch (err) {
      if (isForeignKeyViolation(err)) {
        throw new ConflictException(
          `Cannot delete "${wasteType.name}" -- it has waste batches or sales recorded against it.`,
        );
      }
      throw err;
    }
    return { deleted: true };
  }


}
