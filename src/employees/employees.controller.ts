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
import { EmployeesService } from './employees.service';
import type {
  CreateEmployeeInput,
  UpdateEmployeeInput,
} from './employees.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

// Was fully unauthenticated before -- anyone who knew the URL could read,
// create, edit, or delete employee records. Guarded now like every other
// mutable resource in the app.
@UseGuards(JwtAuthGuard)
@Controller('employees')
export class EmployeesController {
  constructor(private employeesService: EmployeesService) {}

  @Get()
  getEmployees(@Query('search') search?: string) {
    return this.employeesService.getEmployees(search);
  }

  @Get(':id')
  getEmployeeById(@Param('id', ParseIntPipe) id: number) {
    return this.employeesService.getEmployeeById(id);
  }

  @Post()
  createEmployee(@Body() body: CreateEmployeeInput) {
    return this.employeesService.createEmployee(body);
  }

  @Patch(':id')
  updateEmployee(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateEmployeeInput,
  ) {
    return this.employeesService.updateEmployee(id, body);
  }

  @Delete(':id')
  deleteEmployee(@Param('id', ParseIntPipe) id: number) {
    return this.employeesService.deleteEmployee(id);
  }
}
