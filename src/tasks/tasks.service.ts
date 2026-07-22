import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Task } from './task.entity';

@Injectable()
export class TasksService {
    constructor(
        @InjectRepository(Task)
        private taskRepository: Repository<Task>,
    ) { }

    async getTasks() {
        return this.taskRepository.find();
    }

    async createTask(name: string, pricePerUnit: number) {
        const task = this.taskRepository.create({
            name, pricePerUnit
        });

        return this.taskRepository.save(task);
    }

    async getTaskById(id: number) {
        return this.taskRepository.findOneBy({
            id,
        });
    }
}
