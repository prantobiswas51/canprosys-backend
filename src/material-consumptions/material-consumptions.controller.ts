import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { MaterialConsumptionsService } from './material-consumptions.service';
import type { RecordConsumptionInput } from './material-consumptions.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('material-consumptions')
export class MaterialConsumptionsController {
  constructor(private consumptionsService: MaterialConsumptionsService) {}

  // GET /material-consumptions?rawMaterialId=3
  @Get()
  getConsumptions(@Query('rawMaterialId') rawMaterialId?: string) {
    return this.consumptionsService.getConsumptions(
      rawMaterialId ? Number(rawMaterialId) : undefined,
    );
  }

  @Get(':id')
  getConsumptionById(@Param('id', ParseIntPipe) id: number) {
    return this.consumptionsService.getConsumptionById(id);
  }

  @Post()
  recordConsumption(@Body() body: RecordConsumptionInput) {
    return this.consumptionsService.recordConsumption(body);
  }

  @Delete(':id')
  deleteConsumption(@Param('id', ParseIntPipe) id: number) {
    return this.consumptionsService.deleteConsumption(id);
  }
}
