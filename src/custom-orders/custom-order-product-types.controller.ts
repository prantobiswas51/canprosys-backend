import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CustomOrderProductTypesService } from './custom-order-product-types.service';
import type {
  CreateCustomOrderProductTypeInput,
  UpdateCustomOrderProductTypeInput,
} from './custom-order-product-types.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtOrApiKeyGuard } from '../auth/jwt-or-api-key.guard';

// No class-level guard here on purpose -- read routes accept either the
// app's own login OR a third party's API key (JwtOrApiKeyGuard), while
// anything that changes the schema stays JwtAuthGuard-only below.
@Controller('custom-order-product-types')
export class CustomOrderProductTypesController {
  constructor(private productTypesService: CustomOrderProductTypesService) {}

  // Third parties call this first to discover what fields the product type
  // currently expects, before placing an order against it.
  @UseGuards(JwtOrApiKeyGuard)
  @Get()
  getProductTypes() {
    return this.productTypesService.getProductTypes();
  }

  @UseGuards(JwtOrApiKeyGuard)
  @Get(':id')
  getProductType(@Param('id', ParseIntPipe) id: number) {
    return this.productTypesService.getProductTypeById(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  createProductType(@Body() body: CreateCustomOrderProductTypeInput) {
    return this.productTypesService.createProductType(body);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  updateProductType(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateCustomOrderProductTypeInput,
  ) {
    return this.productTypesService.updateProductType(id, body);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  deleteProductType(@Param('id', ParseIntPipe) id: number) {
    return this.productTypesService.deleteProductType(id);
  }
}
