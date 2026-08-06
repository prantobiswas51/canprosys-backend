import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { WasteTypesService } from './waste-types.service';
import type { CreateWasteTypeInput } from './waste-types.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('waste-types')
export class WasteTypesController {
  constructor(private wasteTypesService: WasteTypesService) {}

  @Get()
  getWasteTypes() {
    return this.wasteTypesService.getWasteTypes();
  }

  @Post()
  createWasteType(@Body() body: CreateWasteTypeInput) {
    return this.wasteTypesService.createWasteType(body);
  }

  @Delete(':id')
  deleteWasteType(@Param('id', ParseIntPipe) id: number) {
    return this.wasteTypesService.deleteWasteType(id);
  }
}
