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
import { CustomOrdersService } from './custom-orders.service';
import type {
  CompleteOrderInput,
  CreateCustomOrderInput,
  UpdateCustomOrderInput,
} from './custom-orders.service';
import type { CustomOrderStatus } from './custom-order.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtOrApiKeyGuard } from '../auth/jwt-or-api-key.guard';

// No class-level guard -- placing an order accepts a third party's API key
// (JwtOrApiKeyGuard), everything else (viewing/editing/deleting orders)
// stays JwtAuthGuard-only, i.e. your own logged-in staff.
@Controller('custom-orders')
export class CustomOrdersController {
  constructor(private ordersService: CustomOrdersService) {}

  // GET /custom-orders?status=pending
  @UseGuards(JwtAuthGuard)
  @Get()
  getOrders(@Query('status') status?: CustomOrderStatus) {
    return this.ordersService.getOrders(status);
  }

  @UseGuards(JwtOrApiKeyGuard)
  @Post()
  createOrder(@Body() body: CreateCustomOrderInput) {
    return this.ordersService.createOrder(body);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  updateOrder(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateCustomOrderInput) {
    return this.ordersService.updateOrder(id, body);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  deleteOrder(@Param('id', ParseIntPipe) id: number) {
    return this.ordersService.deleteOrder(id);
  }

  // Staff-only -- cuts raw material stock and pays employees, so this stays
  // off the third-party API key entirely (JwtAuthGuard only).
  @UseGuards(JwtAuthGuard)
  @Post(':id/complete')
  completeOrder(@Param('id', ParseIntPipe) id: number, @Body() body: CompleteOrderInput) {
    return this.ordersService.completeOrder(id, body);
  }
}
