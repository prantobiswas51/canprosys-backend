import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Product } from './product.entity';
import { Repository } from 'typeorm';
import { RecipesService } from '../recipes/recipes.service';

@Injectable()
export class ProductsService {
    constructor(
        @InjectRepository(Product) private productRepository: Repository<Product>,
        private recipesService: RecipesService,
    ) { }

    async getProducts() {
        const products = await this.productRepository.find();
        return this.withComputedCost(products);
    }

    // Case-insensitive partial match on name, e.g. "canv" matches "Canvas".
    // Empty/missing query just falls back to the full list (200, possibly
    // empty -- that's a normal "no products yet" state, not an error).
    // An actual search term that matches nothing is a 404 instead.
    async searchProducts(query: string) {
        const products = await this.productRepository
            .createQueryBuilder('product')
            .where('product.name ILIKE :query', {
                query: `%${query}%`,
            })
            .getMany();
        return this.withComputedCost(products);
    }

    // Live cost-per-unit, straight from each product's matching recipe
    // (materials BOM x current stock price + artisan wage rates) -- not the
    // stored costPrice column, which is only a fallback for products that
    // don't have a recipe by that SKU (e.g. added manually). Computed fresh
    // on every read so a material price or wage change shows up immediately,
    // without needing another packaging entry first.
    private async withComputedCost(products: Product[]): Promise<Product[]> {
        return Promise.all(
            products.map(async (product) => {
                const recipe = await this.recipesService.getRecipeBySku(product.sku);
                if (!recipe) return product;
                const { unitCost } = await this.recipesService.computeUnitCost(recipe);
                return { ...product, costPrice: unitCost };
            }),
        );
    }
}
