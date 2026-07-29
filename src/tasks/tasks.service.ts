import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { Task } from './task.entity';

export interface UpdateTaskInput {
    name?: string;
    pricePerUnit?: number;
}

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
        const slug = await this.generateUniqueSlug(name);
        const task = this.taskRepository.create({
            name, pricePerUnit, slug,
        });

        return this.taskRepository.save(task);
    }

    async getTaskById(id: number) {
        const task = await this.taskRepository.findOneBy({ id });
        if (!task) {
            throw new NotFoundException(`Task #${id} not found`);
        }
        return task;
    }

    // Slug is intentionally left untouched on update -- daily-entry.service.ts
    // special-cases tasks by slug (wood_slicing, corner_cutting, packaging), so
    // renaming a task must not change the identifier that logic depends on.
    async updateTask(id: number, data: UpdateTaskInput) {
        const task = await this.getTaskById(id);
        if (data.name !== undefined) task.name = data.name;
        if (data.pricePerUnit !== undefined) task.pricePerUnit = data.pricePerUnit;
        return this.taskRepository.save(task);
    }

    async deleteTask(id: number) {
        const task = await this.getTaskById(id);
        try {
            await this.taskRepository.remove(task);
        } catch (err) {
            if (this.isForeignKeyViolation(err)) {
                throw new ConflictException(
                    `Cannot delete "${task.name}" -- it's referenced by existing daily entries or used in a recipe's Artisan Wages. Remove those references first.`,
                );
            }
            throw err;
        }
        return { deleted: true };
    }

    // Tasks were previously created with no slug at all (a NOT NULL column
    // with nothing setting it), which would have failed on insert -- this
    // derives one from the name ("Wood Slicing" -> "wood_slicing") and
    // de-dupes against existing slugs so two tasks never collide.
    private async generateUniqueSlug(name: string) {
        const base =
            name
                .trim()
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '_')
                .replace(/^_+|_+$/g, '') || 'task';

        let slug = base;
        let suffix = 2;
        while (await this.taskRepository.findOneBy({ slug })) {
            slug = `${base}_${suffix}`;
            suffix += 1;
        }
        return slug;
    }

    private isForeignKeyViolation(err: unknown): boolean {
        return (
            err instanceof QueryFailedError &&
            (err as QueryFailedError & { code?: string }).code === '23503'
        );
    }
}
