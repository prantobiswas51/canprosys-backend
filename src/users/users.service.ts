import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';

@Injectable()
export class UsersService {
    constructor(
        @InjectRepository(User)
        private userRepository: Repository<User>,
    ) { }

    async getUsers() {
        return this.userRepository.find();
    }

    async createUser(name: string) {
        const user = this.userRepository.create({
            name,
        });

        return this.userRepository.save(user);
    }

    async getUserById(id: number) {
        return this.userRepository.findOneBy({
            id,
        });
    }
}