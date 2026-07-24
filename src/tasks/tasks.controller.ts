import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermission } from '../permissions/require-permission.decorator';

@Controller('tasks')
export class TasksController {
    constructor(private tasksService: TasksService) { }

    @Get()
    getTasks() {
        return this.tasksService.getTasks();
    }

    @Get(':id')
    getTaskById(@Param('id') id: string) {
        return this.tasksService.getTaskById(Number(id));
    }

    // Demo of the permission system in action -- creating a task now
    // requires the caller's role to have the 'tasks.create' key.
    @UseGuards(JwtAuthGuard, PermissionsGuard)
    @RequirePermission('tasks.create')
    @Post()
    createTask(@Body() body: { name: string; pricePerUnit: number }) {
        return this.tasksService.createTask(
            body.name,
            body.pricePerUnit
        );
    }

}
