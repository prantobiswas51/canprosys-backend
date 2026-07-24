import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { UsersService } from '../users/users.service';
import { ROLES_KEY } from './roles.decorator';

// Static role-name check, separate from PermissionsGuard on purpose --
// used to protect the endpoints that manage permissions themselves, so
// that access to those endpoints can never be revoked via the dynamic
// permission system (no lockout risk).
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.get<string[]>(ROLES_KEY, context.getHandler());
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const { userId } = req.user as { userId: number };
    const user = await this.usersService.getUserById(userId);

    if (!user?.role || !requiredRoles.includes(user.role.name)) {
      throw new ForbiddenException('Insufficient role');
    }
    return true;
  }
}
