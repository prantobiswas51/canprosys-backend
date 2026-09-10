import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CustomOrderFieldDefinition, CustomOrderProductType } from './custom-order-product-type.entity';
import { isForeignKeyViolation } from '../common/is-foreign-key-violation';
import { isUniqueViolation } from '../common/is-unique-violation';

export interface CreateCustomOrderProductTypeInput {
  name: string;
  fields: CustomOrderFieldDefinition[];
}

export type UpdateCustomOrderProductTypeInput = Partial<CreateCustomOrderProductTypeInput>;

@Injectable()
export class CustomOrderProductTypesService {
  constructor(
    @InjectRepository(CustomOrderProductType)
    private productTypeRepository: Repository<CustomOrderProductType>,
  ) {}

  getProductTypes() {
    return this.productTypeRepository.find({ order: { name: 'ASC' } });
  }

  async getProductTypeById(id: number) {
    const productType = await this.productTypeRepository.findOneBy({ id });
    if (!productType) {
      throw new NotFoundException(`Product type #${id} not found`);
    }
    return productType;
  }

  private normalizeFields(fields: CustomOrderFieldDefinition[] | undefined): CustomOrderFieldDefinition[] {
    if (!fields || fields.length === 0) {
      throw new BadRequestException('At least one field is required');
    }
    const keys = new Set<string>();
    for (const field of fields) {
      if (!field.key?.trim() || !field.label?.trim()) {
        throw new BadRequestException('Every field needs a key and a label');
      }
      if (keys.has(field.key)) {
        throw new BadRequestException(`Duplicate field key "${field.key}"`);
      }
      keys.add(field.key);
    }
    return fields.map((f) => ({
      key: f.key.trim(),
      label: f.label.trim(),
      type: f.type || 'text',
      required: !!f.required,
      options: f.type === 'select' ? (f.options ?? []).filter((o) => o.trim()) : undefined,
    }));
  }

  async createProductType(data: CreateCustomOrderProductTypeInput) {
    if (!data.name?.trim()) {
      throw new BadRequestException('Name is required');
    }
    const productType = this.productTypeRepository.create({
      name: data.name.trim(),
      fields: this.normalizeFields(data.fields),
    });
    try {
      return await this.productTypeRepository.save(productType);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(`Product type "${data.name}" already exists.`);
      }
      throw err;
    }
  }

  async updateProductType(id: number, data: UpdateCustomOrderProductTypeInput) {
    const productType = await this.getProductTypeById(id);
    if (data.name != null) {
      if (!data.name.trim()) {
        throw new BadRequestException('Name is required');
      }
      productType.name = data.name.trim();
    }
    if (data.fields != null) {
      productType.fields = this.normalizeFields(data.fields);
    }
    try {
      return await this.productTypeRepository.save(productType);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(`Product type "${data.name}" already exists.`);
      }
      throw err;
    }
  }

  async deleteProductType(id: number) {
    const productType = await this.getProductTypeById(id);
    try {
      await this.productTypeRepository.remove(productType);
    } catch (err) {
      if (isForeignKeyViolation(err)) {
        throw new ConflictException(
          `Cannot delete "${productType.name}" -- it has custom orders placed against it.`,
        );
      }
      throw err;
    }
    return { deleted: true };
  }
}
