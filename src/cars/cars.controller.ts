import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { CarsService } from './cars.service';
import type { CreateCarInput, UpdateCarInput } from './cars.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('cars')
export class CarsController {
  constructor(private carsService: CarsService) {}

  @Get()
  getCars() {
    return this.carsService.getCars();
  }

  @Get(':id')
  getCarById(@Param('id', ParseIntPipe) id: number) {
    return this.carsService.getCarById(id);
  }

  @Post()
  createCar(@Body() body: CreateCarInput) {
    return this.carsService.createCar(body);
  }

  @Patch(':id')
  updateCar(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateCarInput) {
    return this.carsService.updateCar(id, body);
  }

  @Delete(':id')
  deleteCar(@Param('id', ParseIntPipe) id: number) {
    return this.carsService.deleteCar(id);
  }
}
