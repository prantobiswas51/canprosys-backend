import { Controller, Get, Query } from '@nestjs/common';
import { ProductsService } from './products.service';

@Controller('products')
export class ProductsController {
    constructor(private productService: ProductsService) {
    }

    @Get()
    getProducts() {
        return this.productService.getProducts();
    }

    // GET /products/search?q=canvas
    // Note: this has to stay declared before any future GET(':id') route on
    // this controller -- Nest matches routes in declaration order, so a
    // param route would otherwise swallow "search" as if it were an :id.
    @Get('search')
    search(@Query('q') query: string) {
        return this.productService.searchProducts(query);
    }
}
