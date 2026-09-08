import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RecipeCategory } from './recipe-category.entity';
import { isForeignKeyViolation } from '../common/is-foreign-key-violation';
import { isUniqueViolation } from '../common/is-unique-violation';

export interface CreateRecipeCategoryInput {
  name: string;
  // Optional at creation -- entity column defaults to true (multi-stage)
  // when omitted.
  hasSteps?: boolean;
}

export type UpdateRecipeCategoryInput = Partial<CreateRecipeCategoryInput>;

@Injectable()
export class RecipeCategoriesService {
  constructor(
    @InjectRepository(RecipeCategory) private categoryRepository: Repository<RecipeCategory>,
  ) {}

  getCategories() {
    return this.categoryRepository.find({ order: { name: 'ASC' } });
  }

  async getCategoryById(id: number) {
    const category = await this.categoryRepository.findOneBy({ id });
    if (!category) {
      throw new NotFoundException(`Category #${id} not found`);
    }
    return category;
  }

  async createCategory(data: CreateRecipeCategoryInput) {
    const category = this.categoryRepository.create(data);
    try {
      return await this.categoryRepository.save(category);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(`A category named "${data.name}" already exists`);
      }
      throw err;
    }
  }

  async updateCategory(id: number, data: UpdateRecipeCategoryInput) {
    const category = await this.getCategoryById(id);
    Object.assign(category, data);
    try {
      return await this.categoryRepository.save(category);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(`A category named "${data.name}" already exists`);
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
          `Cannot delete "${category.name}" -- it is still assigned to one or more recipes.`,
        );
      }
      throw err;
    }
    return { deleted: true };
  }
}
