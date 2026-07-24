import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Permission } from './permission.entity';
import { Role } from '../roles/role.entity';

@Injectable()
export class PermissionsService {
  constructor(
    @InjectRepository(Permission) private permissionRepo: Repository<Permission>,
    @InjectRepository(Role) private roleRepo: Repository<Role>,
  ) {}

  getAllPermissions() {
    return this.permissionRepo.find();
  }

  createPermission(key: string, description?: string) {
    const permission = this.permissionRepo.create({ key, description });
    return this.permissionRepo.save(permission);
  }

  async getRoleWithPermissions(roleId: number) {
    const role = await this.roleRepo.findOne({ where: { id: roleId }, relations: ['permissions'] });
    if (!role) throw new NotFoundException('Role not found');
    return role;
  }

  // Replaces the role's full permission set with the given keys (add + remove in one call).
  async setRolePermissions(roleId: number, permissionKeys: string[]) {
    const role = await this.roleRepo.findOneBy({ id: roleId });
    if (!role) throw new NotFoundException('Role not found');
    const permissions = await this.permissionRepo.find({ where: { key: In(permissionKeys) } });
    role.permissions = permissions;
    return this.roleRepo.save(role);
  }
}
