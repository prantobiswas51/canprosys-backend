import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { EmployeesService } from './employees.service';
import type {
  CreateEmployeeInput,
  UpdateEmployeeInput,
} from './employees.service';
import { NidStatus } from './employee.entity';
import { nidMulterOptions } from './nid-upload.config';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

// Matches what diskStorage in nid-upload.config.ts actually writes back --
// just the bits this controller needs (filename), not the full multer File
// shape (no @types/multer installed, so there's nothing to import for that).
interface UploadedDiskFile {
  filename: string;
}

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

  // multipart/form-data with up to one file each under the "nidFront" and
  // "nidBack" field names -- either or both, whatever the frontend actually
  // has to send this time (e.g. only replacing the back image later).
  // Resets nidStatus to pending, see uploadNidImages().
  @Post(':id/nid')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'nidFront', maxCount: 1 },
        { name: 'nidBack', maxCount: 1 },
      ],
      nidMulterOptions,
    ),
  )
  uploadNid(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFiles()
    files: { nidFront?: UploadedDiskFile[]; nidBack?: UploadedDiskFile[] },
  ) {
    const nidFrontImage = files.nidFront?.[0] ? `/uploads/nid/${files.nidFront[0].filename}` : undefined;
    const nidBackImage = files.nidBack?.[0] ? `/uploads/nid/${files.nidBack[0].filename}` : undefined;

    if (!nidFrontImage && !nidBackImage) {
      throw new BadRequestException('Attach at least one image (front or back).');
    }

    return this.employeesService.uploadNidImages(id, { nidFrontImage, nidBackImage });
  }

  @Patch(':id/nid-status')
  setNidStatus(@Param('id', ParseIntPipe) id: number, @Body('status') status: NidStatus) {
    return this.employeesService.setNidStatus(id, status);
  }
}
