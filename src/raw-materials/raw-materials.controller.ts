import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { RawMaterialsService } from './raw-materials.service';
import type {
  CreateRawMaterialInput,
  UpdateRawMaterialInput,
} from './raw-materials.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('raw-materials')
export class RawMaterialsController {
  constructor(private rawMaterialsService: RawMaterialsService) {}

  @Get()
  getRawMaterials() {
    return this.rawMaterialsService.getRawMaterials();
  }

  @Get(':id')
  getRawMaterialById(@Param('id', ParseIntPipe) id: number) {
    return this.rawMaterialsService.getRawMaterialById(id);
  }

  @Post()
  createRawMaterial(@Body() body: CreateRawMaterialInput) {
    return this.rawMaterialsService.createRawMaterial(body);
  }

  @Patch(':id')
  updateRawMaterial(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateRawMaterialInput,
  ) {
    return this.rawMaterialsService.updateRawMaterial(id, body);
  }

  @Delete(':id')
  deleteRawMaterial(@Param('id', ParseIntPipe) id: number) {
    return this.rawMaterialsService.deleteRawMaterial(id);
  }
}
