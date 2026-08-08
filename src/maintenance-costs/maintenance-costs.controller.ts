import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { MaintenanceCostsService } from './maintenance-costs.service';
import type { CreateMaintenanceCostInput } from './maintenance-costs.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('maintenance-costs')
export class MaintenanceCostsController {
  constructor(private costsService: MaintenanceCostsService) {}

  // GET /maintenance-costs?month=2026-08
  @Get()
  getCosts(@Query('month') month?: string) {
    return this.costsService.getCosts(month);
  }

  @Post()
  createCost(@Body() body: CreateMaintenanceCostInput, @Req() req: Request) {
    const user = req.user as { name?: string } | undefined;
    return this.costsService.createCost(body, user?.name);
  }

  @Delete(':id')
  deleteCost(@Param('id', ParseIntPipe) id: number) {
    return this.costsService.deleteCost(id);
  }
}
