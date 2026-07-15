import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const LEGACY_DEPARTMENTS = [
  'Administration',
  'Animation',
  'Cuisine',
  'Direction',
  'Entretien',
  'Magasin',
  'Pâtisserie',
  'Soins',
];

const LEGACY_POSITIONS = [
  'Agent polyvalent',
  'Animateur',
  'Chef de cuisine',
  'Commis',
  'Directeur',
  'Infirmier',
  'Magasinier',
  'Pâtissier',
];

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const orgId = args.find((a) => a.startsWith('--org='))?.replace('--org=', '');

  if (!orgId) {
    console.error('Usage: npx tsx prisma/cleanup-legacy-hr-defaults.ts --org=<organizationId> [--dry-run]');
    process.exit(1);
  }

  console.log(`\nAnalyse de l'organisation ${orgId} ${dryRun ? '(simulation)' : ''}\n`);

  // Récupérer tous les services et postes de l'organisation
  const departments = await prisma.hrDepartment.findMany({ where: { organizationId: orgId } });
  const positions = await prisma.hrPosition.findMany({ where: { organizationId: orgId } });

  const legacyDepts = departments.filter((d) => LEGACY_DEPARTMENTS.includes(d.name));
  const legacyPositions = positions.filter((p) => LEGACY_POSITIONS.includes(p.name));

  // Vérifier les usages pour chaque service
  const deptAnalysis = await Promise.all(
    legacyDepts.map(async (dept) => {
      const employeesCount = await prisma.hrEmployee.count({ where: { departmentId: dept.id } });
      const planningAssignmentsCount = await prisma.planningAssignment.count({ where: { departmentId: dept.id } });
      const planningNeedsCount = await prisma.planningOperationalNeed.count({ where: { departmentId: dept.id } });
      const planningRotationsCount = await prisma.planningTemplate.count({ where: { departmentId: dept.id, isArchived: false, OR: [{ periodType: 'WEEKLY_ROTATION' }, { content: { path: ['type'], equals: 'WEEKLY_ROTATION' } as any }] } });
      const productionOrdersCount = await prisma.productionOrder.count({where: { serviceId: dept.id },});
      const used = employeesCount + planningRotationsCount + planningAssignmentsCount + planningNeedsCount + productionOrdersCount > 0;
      return { ...dept, used, refs: { employees: employeesCount, rotations: planningRotationsCount, planningAssignments: planningAssignmentsCount, planningNeeds: planningNeedsCount, productionOrders: productionOrdersCount } };
    })
  );

  // Vérifier les usages pour chaque poste
  const posAnalysis = await Promise.all(
    legacyPositions.map(async (pos) => {
      const employeesCount = await prisma.hrEmployee.count({ where: { positionId: pos.id } });
      const secondaryCount = await prisma.hrEmployeeSecondaryPosition.count({ where: { positionId: pos.id } });
      const planningAssignmentsCount = await prisma.planningAssignment.count({ where: { positionId: pos.id } });
      const planningNeedsCount = await prisma.planningOperationalNeed.count({ where: { positionId: pos.id } });
      const used = employeesCount + secondaryCount + planningAssignmentsCount + planningNeedsCount > 0;
      return { ...pos, used, refs: { employees: employeesCount, secondaryPositions: secondaryCount, planningAssignments: planningAssignmentsCount, planningNeeds: planningNeedsCount } };
    })
  );

  const deptsToDelete = deptAnalysis.filter((d) => !d.used);
  const deptsToKeep = deptAnalysis.filter((d) => d.used);
  const posToDelete = posAnalysis.filter((p) => !p.used);
  const posToKeep = posAnalysis.filter((p) => p.used);

  console.log('Services analysés :', legacyDepts.length);
  console.log('  À supprimer    :', deptsToDelete.length);
  console.log('  À conserver    :', deptsToKeep.length);
  if (deptsToKeep.length) {
    deptsToKeep.forEach((d) => {
      console.log(`    - ${d.name} (employés: ${d.refs.employees}, roulements: ${d.refs.rotations}, planning: ${d.refs.planningAssignments + d.refs.planningNeeds}, production: ${d.refs.productionOrders})`);
    });
  }

  console.log('\nPostes analysés  :', legacyPositions.length);
  console.log('  À supprimer    :', posToDelete.length);
  console.log('  À conserver    :', posToKeep.length);
  if (posToKeep.length) {
    posToKeep.forEach((p) => {
      console.log(`    - ${p.name} (employés: ${p.refs.employees}, secondaires: ${p.refs.secondaryPositions}, planning: ${p.refs.planningAssignments + p.refs.planningNeeds})`);
    });
  }

  if (!dryRun) {
    if (deptsToDelete.length) {
      await prisma.hrDepartment.deleteMany({ where: { id: { in: deptsToDelete.map((d) => d.id) } } });
    }
    if (posToDelete.length) {
      await prisma.hrPosition.deleteMany({ where: { id: { in: posToDelete.map((p) => p.id) } } });
    }
    console.log('\nSuppression effectuée.');
  } else {
    console.log('\nSimulation — aucune suppression effectuée.');
  }

  console.log('');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
