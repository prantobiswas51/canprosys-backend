import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
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

    async createUser(name: string, email: string, username: string, password: string) {
        const user = this.userRepository.create({
            name,
            email,
            username,
        });

        if (password) {
            user.password = await bcrypt.hash(password, 10);
        }

        return this.userRepository.save(user);
    }

    async getUserById(id: number) {
        return this.userRepository.findOne({
            where: { id },
            relations: ['role', 'role.permissions'],
        });
    }

    async deleteUser(id: number) {
        return "user " + id + " deleted";
    }

    async myRole(id: number) {
        const user = await this.userRepository.findOne({
            where: {id}
        });


        return user;
    }

    // Auth-only lookup: password has select:false on the entity, so it has
    // to be pulled back in explicitly via addSelect for credential checks.
    async findByUsernameWithPassword(username: string) {
        return this.userRepository
            .createQueryBuilder('user')
            .addSelect('user.password')
            .where('user.username = :username', { username })
            .getOne();
    }
}
