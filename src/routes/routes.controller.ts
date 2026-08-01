import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { RoutesService } from './routes.service';
import type { CreateRouteInput, UpdateRouteInput } from './routes.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('routes')
export class RoutesController {
  constructor(private routesService: RoutesService) {}

  @Get()
  getRoutes() {
    return this.routesService.getRoutes();
  }

  @Get(':id')
  getRouteById(@Param('id', ParseIntPipe) id: number) {
    return this.routesService.getRouteById(id);
  }

  @Post()
  createRoute(@Body() body: CreateRouteInput) {
    return this.routesService.createRoute(body);
  }

  @Patch(':id')
  updateRoute(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateRouteInput) {
    return this.routesService.updateRoute(id, body);
  }

  @Delete(':id')
  deleteRoute(@Param('id', ParseIntPipe) id: number) {
    return this.routesService.deleteRoute(id);
  }
}
