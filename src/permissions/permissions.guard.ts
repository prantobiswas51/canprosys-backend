import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { UsersService } from '../users/users.service';
import { PermissionsService } from './permissions.service';
import { PERMISSION_KEY } from './require-permission.decorator';

// Checks the caller's role against role_permission in the DB on every
// request -- unlike a role name baked into the JWT, this means revoking a
// permission takes effect immediately instead of waiting for the token to expire.
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private usersService: UsersService,
    private permissionsService: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.get<string>(PERMISSION_KEY, context.getHandler());
    if (!required) return true; // route has no @RequirePermission -- nothing to check

    const req = context.switchToHttp().getRequest<Request>();
    const { userId } = req.user as { userId: number };

    const user = await this.usersService.getUserById(userId);
    if (!user?.role) {
      throw new ForbiddenException(`Missing permission: ${required}`);
    }

    const role = await this.permissionsService.getRoleWithPermissions(user.role.id);
    const keys = role.permissions?.map((p) => p.key) ?? [];

    if (!keys.includes(required)) {
      throw new ForbiddenException(`Missing permission: ${required}`);
    }
    return true;
  }
}
