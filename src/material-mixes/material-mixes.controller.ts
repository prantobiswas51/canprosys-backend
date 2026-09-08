import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { MaterialMixesService } from './material-mixes.service';
import type { CreateMaterialMixInput } from './material-mixes.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('material-mixes')
export class MaterialMixesController {
  constructor(private mixesService: MaterialMixesService) {}

  @Get()
  getMixes() {
    return this.mixesService.getMixes();
  }

  @Post()
  createMix(@Body() body: CreateMaterialMixInput) {
    return this.mixesService.createMix(body);
  }

  @Delete(':id')
  deleteMix(@Param('id', ParseIntPipe) id: number) {
    return this.mixesService.deleteMix(id);
  }
}
