import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { EmployeesService } from './employees.service';
import type {
  CreateEmployeeInput,
  UpdateEmployeeInput,
} from './employees.service';

@Controller('employees')
export class EmployeesController {
  constructor(private employeesService: EmployeesService) {}

  @Get()
  getEmployees() {
    return this.employeesService.getEmployees();
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
