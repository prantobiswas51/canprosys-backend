import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { TasksService } from './tasks.service';

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

    @Post()
    createTask(@Body() body: { name: string; pricePerUnit: number }) {
        return this.tasksService.createTask(
            body.name,
            body.pricePerUnit
        );
    }

}
