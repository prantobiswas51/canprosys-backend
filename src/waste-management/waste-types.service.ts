import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { WasteType } from './waste-type.entity';

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
      if (this.isUniqueViolation(err)) {
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
      if (this.isForeignKeyViolation(err)) {
        throw new ConflictException(
          `Cannot delete "${wasteType.name}" -- it has waste batches or sales recorded against it.`,
        );
      }
      throw err;
    }
    return { deleted: true };
  }

  private isUniqueViolation(err: unknown): boolean {
    return (
      err instanceof QueryFailedError &&
      (err as QueryFailedError & { code?: string }).code === '23505'
    );
  }

  private isForeignKeyViolation(err: unknown): boolean {
    return (
      err instanceof QueryFailedError &&
      (err as QueryFailedError & { code?: string }).code === '23503'
    );
  }
}
