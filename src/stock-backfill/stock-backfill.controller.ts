import { Body, Controller, Param, ParseIntPipe, Put, UseGuards } from '@nestjs/common';
import { StockBackfillService } from './stock-backfill.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

// TEMPORARY -- see StockBackfillService for why this exists.
@UseGuards(JwtAuthGuard)
@Controller('stock-backfill')
export class StockBackfillController {
  constructor(private stockBackfillService: StockBackfillService) {}

  @Put('recipes/:recipeId/stage-stock/:taskId')
  addStageStock(
    @Param('recipeId', ParseIntPipe) recipeId: number,
    @Param('taskId', ParseIntPipe) taskId: number,
    @Body('quantity') quantity: number,
  ) {
    return this.stockBackfillService.addStageStock(recipeId, taskId, Number(quantity));
  }

  @Put('recipes/:recipeId/finished-stock')
  addFinishedStock(@Param('recipeId', ParseIntPipe) recipeId: number, @Body('quantity') quantity: number) {
    return this.stockBackfillService.addFinishedStock(recipeId, Number(quantity));
  }
}
