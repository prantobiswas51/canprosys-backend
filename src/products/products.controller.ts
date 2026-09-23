import { Body, Controller, Get, Param, ParseIntPipe, Patch, Query, UseGuards } from '@nestjs/common';
import { ProductsService } from './products.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

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

    @UseGuards(JwtAuthGuard)
    @Patch(':id/sell-price')
    setSellPrice(@Param('id', ParseIntPipe) id: number, @Body() body: { sellPrice: number | null }) {
        return this.productService.setSellPrice(id, body.sellPrice);
    }
}
