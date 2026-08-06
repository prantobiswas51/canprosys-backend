import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { WasteBatchesService } from './waste-batches.service';
import type { CreateWasteBatchInput } from './waste-batches.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('waste-batches')
export class WasteBatchesController {
  constructor(private wasteBatchesService: WasteBatchesService) {}

  @Post()
  create(@Body() body: CreateWasteBatchInput) {
    return this.wasteBatchesService.createWasteBatch(body);
  }

  @Get()
  getAll(
    @Query('wasteTypeId') wasteTypeId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.wasteBatchesService.getWasteBatches(
      wasteTypeId ? Number(wasteTypeId) : undefined,
      from,
      to,
    );
  }

  @Get('stock')
  getStock() {
    return this.wasteBatchesService.getStock();
  }
}
