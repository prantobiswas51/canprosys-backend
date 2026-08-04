import { DataSource } from 'typeorm';
import { Permission } from '../../permissions/permission.entity';

interface DemoPermission {
  key: string; // resource.action, e.g. 'tasks.create' -- matches @RequirePermission()
  description: string;
}

// Catalogue of permission keys across the app's main resources. Seeding
// these just creates the rows -- it does NOT grant them to any role.
// PermissionsGuard checks role_permission strictly (no super_admin bypass),
// so after seeding, go to Role Management and check the boxes each role
// should have -- including super_admin, or it'll be locked out of any
// @RequirePermission()-guarded route too.
const DEMO_PERMISSIONS: DemoPermission[] = [
  { key: 'tasks.view', description: 'View tasks' },
  { key: 'tasks.create', description: 'Create tasks' },
  { key: 'tasks.update', description: 'Edit tasks' },
  { key: 'tasks.delete', description: 'Delete tasks' },

  { key: 'recipes.view', description: 'View recipes' },
  { key: 'recipes.create', description: 'Create recipes' },
  { key: 'recipes.update', description: 'Edit recipes' },
  { key: 'recipes.delete', description: 'Delete recipes' },

  { key: 'employees.view', description: 'View employees' },
  { key: 'employees.create', description: 'Create employees' },
  { key: 'employees.update', description: 'Edit employees' },
  { key: 'employees.delete', description: 'Delete employees' },

  { key: 'dailyEntries.view', description: 'View daily entries' },
  { key: 'dailyEntries.create', description: 'Log a daily entry' },

  { key: 'inventory.view', description: 'View raw materials and stock batches' },
  { key: 'inventory.create', description: 'Add raw materials or record purchases' },
  { key: 'inventory.update', description: 'Edit raw materials or batches' },
  { key: 'inventory.delete', description: 'Delete raw materials or batches' },

  { key: 'products.view', description: 'View finished products' },
  { key: 'products.update', description: 'Edit finished product details' },

  { key: 'payouts.view', description: 'View payouts' },
  { key: 'payouts.generate', description: 'Generate payouts for a month' },

  { key: 'loans.view', description: 'View employee loans' },
  { key: 'loans.create', description: 'Record a new loan' },
  { key: 'loans.delete', description: 'Delete a loan record' },

  { key: 'shipments.view', description: 'View shipments' },
  { key: 'shipments.create', description: 'Create a new shipment' },

  { key: 'transport.view', description: 'View cars, drivers, and routes' },
  { key: 'transport.create', description: 'Add cars, drivers, or routes' },
  { key: 'transport.update', description: 'Edit cars, drivers, or routes' },
  { key: 'transport.delete', description: 'Delete cars, drivers, or routes' },

  { key: 'users.view', description: 'View user accounts' },
  { key: 'users.create', description: 'Create user accounts' },
  { key: 'users.update', description: 'Edit user accounts' },
  { key: 'users.delete', description: 'Delete user accounts' },

  { key: 'roles.view', description: 'View roles and their permissions' },
  { key: 'roles.manage', description: 'Change which permissions a role has' },
];

export async function seedPermissions(dataSource: DataSource) {
  const permissionRepository = dataSource.getRepository(Permission);

  for (const demo of DEMO_PERMISSIONS) {
    const existing = await permissionRepository.findOneBy({ key: demo.key });
    if (existing) {
      console.log(`Permission "${demo.key}" already exists, skipping.`);
      continue;
    }
    await permissionRepository.save(permissionRepository.create(demo));
    console.log(`Created permission "${demo.key}".`);
  }
}
