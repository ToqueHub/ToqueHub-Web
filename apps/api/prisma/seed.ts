import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();

const roleNames = ['SUPER_ADMIN', 'Administrateur', 'Manager', 'Utilisateur', 'Chef', 'Second', 'Magasinier', 'Lecture seule'];
const permissions = [
  'auth.login',
  'catalog.read',
  'catalog.write',
  'suppliers.read',
  'suppliers.write',
  'stocks.read',
  'stocks.write',
  'stocks.inventory.validate',
  'stocks.audit.read',
  'stocks.audit.export',
  'users.manage',
];

async function main() {
  const organization = await prisma.organization.upsert({
    where: { code: 'demo' },
    update: {},
    create: { name: 'ToqueHub Demo', code: 'demo' },
  });

  const createdPermissions = await Promise.all(
    permissions.map((key) =>
      prisma.permission.upsert({
        where: { key },
        update: {},
        create: { key, description: key },
      }),
    ),
  );

  const roles = await Promise.all(
    roleNames.map((name) =>
      prisma.role.upsert({
        where: { name },
        update: {},
        create: { name },
      }),
    ),
  );

  const adminRole = roles.find((role) => role.name === 'SUPER_ADMIN');
  if (!adminRole) throw new Error('Admin role not created');

  await Promise.all(
    createdPermissions.map((permission) =>
      prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: adminRole.id, permissionId: permission.id } },
        update: {},
        create: { roleId: adminRole.id, permissionId: permission.id },
      }),
    ),
  );

  const unit = await prisma.unit.upsert({
    where: { organizationId_symbol: { organizationId: organization.id, symbol: 'kg' } },
    update: { type: 'MASS' },
    create: { organizationId: organization.id, name: 'Kilogramme', symbol: 'kg', type: 'MASS' },
  });

  const gram = await prisma.unit.upsert({
    where: { organizationId_symbol: { organizationId: organization.id, symbol: 'g' } },
    update: { type: 'MASS' },
    create: { organizationId: organization.id, name: 'Gramme', symbol: 'g', type: 'MASS' },
  });

  const litre = await prisma.unit.upsert({
    where: { organizationId_symbol: { organizationId: organization.id, symbol: 'L' } },
    update: { type: 'VOLUME' },
    create: { organizationId: organization.id, name: 'Litre', symbol: 'L', type: 'VOLUME' },
  });

  const millilitre = await prisma.unit.upsert({
    where: { organizationId_symbol: { organizationId: organization.id, symbol: 'mL' } },
    update: { type: 'VOLUME' },
    create: { organizationId: organization.id, name: 'Millilitre', symbol: 'mL', type: 'VOLUME' },
  });

  await prisma.unitConversion.createMany({
    data: [
      { organizationId: organization.id, fromUnitId: unit.id, toUnitId: gram.id, factor: 1000 },
      { organizationId: organization.id, fromUnitId: gram.id, toUnitId: unit.id, factor: 0.001 },
      { organizationId: organization.id, fromUnitId: litre.id, toUnitId: millilitre.id, factor: 1000 },
      { organizationId: organization.id, fromUnitId: millilitre.id, toUnitId: litre.id, factor: 0.001 },
    ],
    skipDuplicates: true,
  });

  const category = await prisma.category.upsert({
    where: { organizationId_name: { organizationId: organization.id, name: 'Épicerie' } },
    update: {},
    create: { organizationId: organization.id, name: 'Épicerie' },
  });

  await prisma.product.upsert({
    where: { organizationId_name: { organizationId: organization.id, name: 'Farine' } },
    update: {},
    create: {
      organizationId: organization.id,
      name: 'Farine',
      sku: 'FARINE',
      unitId: unit.id,
      minimumStock: 5,
      categoryId: category.id,
    },
  });

  await prisma.supplier.upsert({
    where: { organizationId_name: { organizationId: organization.id, name: 'Metro' } },
    update: {},
    create: { organizationId: organization.id, name: 'Metro', contactName: 'Service Pro', email: 'contact@metro.local' },
  });

  await prisma.user.upsert({
    where: { email: 'admin@toquehub.local' },
    update: {},
    create: {
      username: 'admin',
      email: 'admin@toquehub.local',
      passwordHash: await hash('toquehub', 12),
      firstName: 'Admin',
      lastName: 'ToqueHub',
      organizationId: organization.id,
      roleId: adminRole.id,
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
