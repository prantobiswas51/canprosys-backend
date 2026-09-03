import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MaintenanceCategory } from './maintenance-category.entity';
import { isForeignKeyViolation } from '../common/is-foreign-key-violation';
import { isUniqueViolation } from '../common/is-unique-violation';

export interface CreateMaintenanceCategoryInput {
  name: string;
  icon?: string;
}

@Injectable()
export class MaintenanceCategoriesService {
  constructor(
    @InjectRepository(MaintenanceCategory)
    private categoryRepository: Repository<MaintenanceCategory>,
  ) {}

  getCategories() {
    return this.categoryRepository.find({ order: { name: 'ASC' } });
  }

  async getCategoryById(id: number) {
    const category = await this.categoryRepository.findOneBy({ id });
    if (!category) {
      throw new NotFoundException(`Maintenance category #${id} not found`);
    }
    return category;
  }

  async createCategory(data: CreateMaintenanceCategoryInput) {
    const category = this.categoryRepository.create({
      name: data.name.trim(),
      icon: data.icon?.trim() || undefined,
    });
    try {
      return await this.categoryRepository.save(category);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(`Category "${data.name}" already exists.`);
      }
      throw err;
    }
  }

  async deleteCategory(id: number) {
    const category = await this.getCategoryById(id);
    try {
      await this.categoryRepository.remove(category);
    } catch (err) {
      if (isForeignKeyViolation(err)) {
        throw new ConflictException(
          `Cannot delete "${category.name}" -- it has cost entries logged against it.`,
        );
      }
      throw err;
    }
    return { deleted: true };
  }


}
