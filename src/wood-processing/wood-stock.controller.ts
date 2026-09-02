import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { WoodStockService } from './wood-stock.service';
import type { PurchaseWoodInput, UpdateWoodPurchaseInput } from './wood-stock.service';
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

  // Purchased batches only -- a processing-entry-produced batch is edited
  // by editing that entry (see WoodProcessingController), not here.
  @Patch('batches/:id')
  updatePurchaseBatch(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateWoodPurchaseInput) {
    return this.woodStockService.updatePurchaseBatch(id, body);
  }

  @Delete('batches/:id')
  deletePurchaseBatch(@Param('id', ParseIntPipe) id: number) {
    return this.woodStockService.deletePurchaseBatch(id);
  }
}
