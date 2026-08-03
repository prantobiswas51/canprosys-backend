import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ShipmentsService } from './shipments.service';
import type { CreateShipmentInput } from './shipments.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('shipments')
export class ShipmentsController {
  constructor(private shipmentsService: ShipmentsService) {}

  @Get()
  getShipments(@Query('invoiceNumber') invoiceNumber?: string, @Query('date') date?: string) {
    return this.shipmentsService.getShipments(invoiceNumber, date);
  }

  @Get(':id')
  getShipmentById(@Param('id', ParseIntPipe) id: number) {
    return this.shipmentsService.getShipmentById(id);
  }

  @Post()
  createShipment(@Body() body: CreateShipmentInput) {
    return this.shipmentsService.createShipment(body);
  }
}
