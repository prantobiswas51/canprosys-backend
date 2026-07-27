import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Product } from './product.entity';
import { ILike, Repository } from 'typeorm';

@Injectable()
export class ProductsService {
    constructor(
        @InjectRepository(Product) private productRepository: Repository<Product>,
    ) { }

    getProducts() {
        return this.productRepository.find();
    }

    // Case-insensitive partial match on name, e.g. "canv" matches "Canvas".
    // Empty/missing query just falls back to the full list (200, possibly
    // empty -- that's a normal "no products yet" state, not an error).
    // An actual search term that matches nothing is a 404 instead.
    async searchProducts(query: string) {
        return this.productRepository
            .createQueryBuilder('product')
            .where('product.name ILIKE :query', {
                query: `%${query}%`,
            })
            .getMany();
    }
}
