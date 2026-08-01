import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { DriversService } from './drivers.service';
import type { CreateDriverInput, UpdateDriverInput } from './drivers.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('drivers')
export class DriversController {
  constructor(private driversService: DriversService) {}

  @Get()
  getDrivers() {
    return this.driversService.getDrivers();
  }

  @Get(':id')
  getDriverById(@Param('id', ParseIntPipe) id: number) {
    return this.driversService.getDriverById(id);
  }

  @Post()
  createDriver(@Body() body: CreateDriverInput) {
    return this.driversService.createDriver(body);
  }

  @Patch(':id')
  updateDriver(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateDriverInput) {
    return this.driversService.updateDriver(id, body);
  }

  @Delete(':id')
  deleteDriver(@Param('id', ParseIntPipe) id: number) {
    return this.driversService.deleteDriver(id);
  }
}
