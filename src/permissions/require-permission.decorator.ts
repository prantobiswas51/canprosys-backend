import { SetMetadata } from '@nestjs/common';

export const PERMISSION_KEY = 'permission';

// Attach to a route handler: @RequirePermission('tasks.create')
export const RequirePermission = (key: string) => SetMetadata(PERMISSION_KEY, key);
