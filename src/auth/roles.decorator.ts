import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

// Attach to a route handler: @Roles('super_admin')
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
