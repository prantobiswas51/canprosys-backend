import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { MaterialBatchesService } from './material-batches.service';
import type {
  CreateMaterialBatchInput,
  UpdateMaterialBatchInput,
} from './material-batches.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('material-batches')
export class MaterialBatchesController {
  constructor(private batchesService: MaterialBatchesService) {}

  // GET /material-batches?rawMaterialId=3
  @Get()
  getBatches(@Query('rawMaterialId') rawMaterialId?: string) {
    return this.batchesService.getBatches(
      rawMaterialId ? Number(rawMaterialId) : undefined,
    );
  }

  @Get(':id')
  getBatchById(@Param('id', ParseIntPipe) id: number) {
    return this.batchesService.getBatchById(id);
  }

  @Post()
  createBatch(@Body() body: CreateMaterialBatchInput) {
    return this.batchesService.createBatch(body);
  }

  @Patch(':id')
  updateBatch(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateMaterialBatchInput,
  ) {
    return this.batchesService.updateBatch(id, body);
  }

  @Delete(':id')
  deleteBatch(@Param('id', ParseIntPipe) id: number) {
    return this.batchesService.deleteBatch(id);
  }
}
