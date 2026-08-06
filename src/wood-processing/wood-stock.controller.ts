import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { WoodStockService } from './wood-stock.service';
import type { PurchaseWoodInput } from './wood-stock.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('wood-stock')
export class WoodStockController {
  constructor(private woodStockService: WoodStockService) {}

  @Post('purchase')
  purchase(@Body() body: PurchaseWoodInput) {
    return this.woodStockService.purchase(body);
  }

  @Get('batches')
  getBatches(@Query('woodTypeId') woodTypeId?: string) {
    return this.woodStockService.getBatches(woodTypeId ? Number(woodTypeId) : undefined);
  }

  @Get('summary')
  getSummary() {
    return this.woodStockService.getStockSummary();
  }
}
