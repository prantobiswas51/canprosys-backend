import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { PermissionsService } from './permissions.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller()
export class PermissionsController {
  constructor(private permissionsService: PermissionsService) {}

  // Any logged-in user can see the catalogue of permission keys that exist.
  @UseGuards(JwtAuthGuard)
  @Get('permissions')
  getAllPermissions() {
    return this.permissionsService.getAllPermissions();
  }

  // Creating new permission keys is a super-admin-only, rare operation --
  // guarded by role name directly, NOT by the permission system itself
  // (so you can never lock yourself out of managing permissions).
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('super_admin')
  @Post('permissions')
  createPermission(@Body() body: { key: string; description?: string }) {
    return this.permissionsService.createPermission(body.key, body.description);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('super_admin')
  @Get('roles/:roleId/permissions')
  getRolePermissions(@Param('roleId') roleId: string) {
    return this.permissionsService.getRoleWithPermissions(Number(roleId));
  }

  // Replaces a role's entire permission set -- this is the endpoint the
  // "toggle manager permissions" admin screen calls.
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('super_admin')
  @Put('roles/:roleId/permissions')
  setRolePermissions(@Param('roleId') roleId: string, @Body() body: { keys: string[] }) {
    return this.permissionsService.setRolePermissions(Number(roleId), body.keys);
  }
}
