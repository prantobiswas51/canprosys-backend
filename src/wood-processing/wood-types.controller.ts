import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { WoodTypesService } from './wood-types.service';
import type { CreateWoodTypeInput } from './wood-types.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('wood-types')
export class WoodTypesController {
  constructor(private woodTypesService: WoodTypesService) {}

  @Get()
  getWoodTypes() {
    return this.woodTypesService.getWoodTypes();
  }

  @Post()
  createWoodType(@Body() body: CreateWoodTypeInput) {
    return this.woodTypesService.createWoodType(body);
  }

  @Delete(':id')
  deleteWoodType(@Param('id', ParseIntPipe) id: number) {
    return this.woodTypesService.deleteWoodType(id);
  }
}
