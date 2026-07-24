import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PermissionsService } from './permissions.service';
import { PermissionsController } from './permissions.controller';
import { PermissionsGuard } from './permissions.guard';
import { Permission } from './permission.entity';
import { Role } from '../roles/role.entity';
import { UsersModule } from '../users/users.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([Permission, Role]), UsersModule, AuthModule],
  controllers: [PermissionsController],
  providers: [PermissionsService, PermissionsGuard],
  // Re-export UsersModule too -- PermissionsGuard depends on UsersService,
  // and any module that imports PermissionsModule to use the guard needs
  // that dependency available in its own container as well (Nest builds a
  // guard instance scoped to the *consuming* module, not the defining one).
  exports: [PermissionsService, PermissionsGuard, UsersModule],
})
export class PermissionsModule {}
