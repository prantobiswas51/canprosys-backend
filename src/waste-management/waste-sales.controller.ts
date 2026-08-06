import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { WasteSalesService } from './waste-sales.service';
import type { CreateWasteSaleInput } from './waste-sales.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('waste-sales')
export class WasteSalesController {
  constructor(private wasteSalesService: WasteSalesService) {}

  @Post()
  create(@Body() body: CreateWasteSaleInput) {
    return this.wasteSalesService.createSale(body);
  }

  @Get()
  getAll(
    @Query('wasteTypeId') wasteTypeId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.wasteSalesService.getSales(wasteTypeId ? Number(wasteTypeId) : undefined, from, to);
  }
}
