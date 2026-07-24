import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from './role.entity';

@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(Role) private roleRepository: Repository<Role>,
  ) {}

  getRoles() {
    return this.roleRepository.find();
  }

  getRoleById(id: number) {
    return this.roleRepository.findOneBy({ id });
  }
}
