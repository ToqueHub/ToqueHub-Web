import { Prisma, PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();
const organizationName = process.env.DEMO_ORGANIZATION_NAME || 'The French Café';

type PersonDefinition = {
  key: string;
  firstName: string;
  lastName: string;
  department: string;
  position: string;
  managerKey?: string;
  managerAccount?: boolean;
  workDays: number[];
  shift: [number, number];
  taskTitle: string;
  taskCategory: Prisma.OperationalTaskCreateManyInput['category'];
};

const people: PersonDefinition[] = [
  { key: 'dg', firstName: 'Camille', lastName: 'Laurent', department: 'Direction', position: 'Directrice générale', managerAccount: true, workDays: [1, 2, 3, 4, 5], shift: [8, 17], taskTitle: 'Point quotidien de direction', taskCategory: 'MANAGEMENT' },
  { key: 'chef', firstName: 'Julien', lastName: 'Moreau', department: 'Cuisine', position: 'Chef de cuisine', managerKey: 'dg', managerAccount: true, workDays: [2, 3, 4, 5, 6], shift: [12, 20], taskTitle: 'Briefing et contrôle de la mise en place', taskCategory: 'KITCHEN' },
  { key: 'sous-chef', firstName: 'Sofia', lastName: 'Rossi', department: 'Cuisine', position: 'Sous-cheffe de cuisine', managerKey: 'chef', managerAccount: true, workDays: [0, 3, 4, 5, 6], shift: [12, 20], taskTitle: 'Contrôler la mise en place du dîner', taskCategory: 'KITCHEN' },
  { key: 'cuisinier-1', firstName: 'Lucas', lastName: 'Bernard', department: 'Cuisine', position: 'Cuisinier', managerKey: 'chef', workDays: [1, 2, 3, 4, 5], shift: [11, 19], taskTitle: 'Préparer le poste chaud', taskCategory: 'KITCHEN' },
  { key: 'cuisinier-2', firstName: 'Emma', lastName: 'Dubois', department: 'Cuisine', position: 'Cuisinière', managerKey: 'chef', workDays: [0, 3, 4, 5, 6], shift: [12, 20], taskTitle: 'Préparer le poste froid et dessert', taskCategory: 'KITCHEN' },
  { key: 'chef-salle', firstName: 'Thomas', lastName: 'Leroy', department: 'Restaurant & Bar', position: 'Chef de salle', managerKey: 'dg', managerAccount: true, workDays: [2, 3, 4, 5, 6], shift: [12, 21], taskTitle: 'Briefing de salle et plan de tables', taskCategory: 'SERVICE' },
  { key: 'serveuse', firstName: 'Lina', lastName: 'Martin', department: 'Restaurant & Bar', position: 'Serveuse', managerKey: 'chef-salle', workDays: [1, 2, 3, 4, 5], shift: [11, 19], taskTitle: 'Mise en place de la salle', taskCategory: 'SERVICE' },
  { key: 'serveur', firstName: 'Hugo', lastName: 'Petit', department: 'Restaurant & Bar', position: 'Serveur', managerKey: 'chef-salle', workDays: [0, 3, 4, 5, 6], shift: [13, 21], taskTitle: 'Préparer le service du dîner', taskCategory: 'SERVICE' },
  { key: 'gouvernante', firstName: 'Claire', lastName: 'Robert', department: 'Hébergement', position: 'Gouvernante générale', managerKey: 'dg', managerAccount: true, workDays: [1, 2, 3, 4, 5], shift: [7, 15], taskTitle: 'Répartir les chambres et contrôler les priorités', taskCategory: 'HOUSEKEEPING' },
  { key: 'chambre-1', firstName: 'Nora', lastName: 'Fontaine', department: 'Hébergement', position: 'Employée d’étage', managerKey: 'gouvernante', workDays: [1, 2, 3, 4, 5], shift: [8, 16], taskTitle: 'Remise en état des chambres départ', taskCategory: 'HOUSEKEEPING' },
  { key: 'chambre-2', firstName: 'Aya', lastName: 'Benali', department: 'Hébergement', position: 'Employée d’étage', managerKey: 'gouvernante', workDays: [0, 3, 4, 5, 6], shift: [8, 16], taskTitle: 'Entretien des chambres et espaces communs', taskCategory: 'HOUSEKEEPING' },
  { key: 'chef-reception', firstName: 'Marc', lastName: 'Lefèvre', department: 'Réception', position: 'Chef de réception', managerKey: 'dg', managerAccount: true, workDays: [1, 2, 3, 4, 5], shift: [7, 15], taskTitle: 'Briefing réception et contrôle des arrivées', taskCategory: 'RECEPTION' },
  { key: 'reception', firstName: 'Elena', lastName: 'Garcia', department: 'Réception', position: 'Réceptionniste', managerKey: 'chef-reception', workDays: [0, 3, 4, 5, 6], shift: [14, 22], taskTitle: 'Préparer les arrivées et demandes clients', taskCategory: 'RECEPTION' },
  { key: 'magasinier', firstName: 'Olivier', lastName: 'Simon', department: 'Achats & Logistique', position: 'Magasinier', managerKey: 'dg', workDays: [1, 2, 3, 4, 5], shift: [7, 15], taskTitle: 'Contrôler les livraisons et réserves', taskCategory: 'LOGISTICS' },
  { key: 'maintenance', firstName: 'Antoine', lastName: 'Roux', department: 'Maintenance', position: 'Technicien de maintenance', managerKey: 'dg', workDays: [1, 2, 3, 4, 5], shift: [8, 16], taskTitle: 'Ronde technique préventive', taskCategory: 'MAINTENANCE' },
];

const recipes = [
  {
    name: 'Velouté de potimarron, noisettes torréfiées',
    section: 'STARTER' as const,
    category: 'Entrées',
    preparation: 25,
    cooking: 35,
    ingredients: [
      ['Potimarron', 'kg', 6],
      ['Crème liquide', 'L', 1.5],
      ['Noisettes', 'kg', 0.45],
      ['Beurre doux', 'kg', 0.3],
      ['Sel fin', 'kg', 0.06],
    ] as const,
    steps: [
      ['Préparer', 'Éplucher et tailler le potimarron.'],
      ['Cuire', 'Cuire doucement, mixer avec la crème et rectifier l’assaisonnement.'],
      ['Dresser', 'Servir chaud et terminer avec les noisettes torréfiées.'],
    ],
  },
  {
    name: 'Saumon rôti, beurre blanc et légumes de saison',
    section: 'MAIN' as const,
    category: 'Plats',
    preparation: 40,
    cooking: 30,
    ingredients: [
      ['Filet de saumon', 'kg', 5.4],
      ['Légumes de saison', 'kg', 7.5],
      ['Beurre doux', 'kg', 1.2],
      ['Vin blanc sec', 'L', 0.75],
      ['Crème liquide', 'L', 0.6],
      ['Sel fin', 'kg', 0.08],
    ] as const,
    steps: [
      ['Tailler', 'Préparer les portions de saumon et les légumes.'],
      ['Cuire', 'Rôtir le saumon et cuire les légumes en conservant leur texture.'],
      ['Saucer', 'Monter le beurre blanc au dernier moment puis dresser.'],
    ],
  },
  {
    name: 'Tarte fine aux pommes, crème vanillée',
    section: 'DESSERT' as const,
    category: 'Desserts',
    preparation: 35,
    cooking: 25,
    ingredients: [
      ['Pâte feuilletée', 'kg', 2.4],
      ['Pommes', 'kg', 5.5],
      ['Sucre', 'kg', 0.8],
      ['Crème liquide', 'L', 1.5],
      ['Vanille', 'kg', 0.03],
      ['Beurre doux', 'kg', 0.3],
    ] as const,
    steps: [
      ['Foncer', 'Détailler la pâte et disposer finement les pommes.'],
      ['Cuire', 'Cuire jusqu’à caramélisation régulière.'],
      ['Finir', 'Monter la crème vanillée et dresser au moment du service.'],
    ],
  },
];

function startOfLocalDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function atHour(day: Date, hour: number, minutes = 0) {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minutes, 0, 0);
}

function dateKey(day: Date) {
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
}

async function main() {
  const organization = await prisma.organization.findFirst({ where: { name: organizationName } });
  if (!organization) throw new Error(`Organisation « ${organizationName} » introuvable.`);
  const now = new Date();
  await prisma.organization.update({
    where: { id: organization.id },
    data: {
      hrInstalledAt: organization.hrInstalledAt ?? now,
      planningInstalledAt: organization.planningInstalledAt ?? now,
      technicalSheetsInstalledAt: organization.technicalSheetsInstalledAt ?? now,
      productionInstalledAt: organization.productionInstalledAt ?? now,
      menusInstalledAt: organization.menusInstalledAt ?? now,
    },
  });

  const site = organization.primarySiteId
    ? await prisma.site.findUnique({ where: { id: organization.primarySiteId } })
    : await prisma.site.findFirst({ where: { organizationId: organization.id, isArchived: false } });
  if (!site) throw new Error('Aucun site principal disponible pour la démonstration.');

  const roles = await prisma.role.findMany();
  const managerRole = roles.find((role) => /manager/i.test(role.name)) ?? roles[0];
  const userRole = roles.find((role) => /utilisateur|user/i.test(role.name)) ?? managerRole;
  if (!managerRole || !userRole) throw new Error('Les rôles Manager et Utilisateur sont requis.');
  const creator =
    (await prisma.user.findFirst({ where: { organizationId: organization.id, isPrimaryAdmin: true } })) ??
    (await prisma.user.findFirst({ where: { organizationId: organization.id } }));
  if (!creator) throw new Error('Aucun administrateur trouvé dans cette organisation.');

  const departmentNames = [...new Set(people.map((person) => person.department))];
  const departments = new Map<string, { id: string }>();
  for (const name of departmentNames) {
    const department = await prisma.hrDepartment.upsert({
      where: { organizationId_name: { organizationId: organization.id, name } },
      update: { isArchived: false, archivedAt: null },
      create: { organizationId: organization.id, name, description: 'Service utilisé par la démonstration hôtel.' },
    });
    departments.set(name, department);
  }

  const positions = new Map<string, { id: string }>();
  for (const person of people) {
    const departmentId = departments.get(person.department)!.id;
    const position = await prisma.hrPosition.upsert({
      where: { organizationId_name: { organizationId: organization.id, name: person.position } },
      update: { departmentId, isArchived: false, archivedAt: null },
      create: { organizationId: organization.id, departmentId, name: person.position },
    });
    positions.set(person.position, position);
  }

  const passwordHash = await hash('HotelDemo2026!', 12);
  const employees = new Map<string, { id: string; userId: string; departmentId: string; positionId: string }>();
  for (const [index, person] of people.entries()) {
    const email = `${person.key}@hotel-demo.toquehub.local`;
    const user = await prisma.user.upsert({
      where: { email },
      update: {
        organizationId: organization.id,
        roleId: person.managerAccount ? managerRole.id : userRole.id,
        firstName: person.firstName,
        lastName: person.lastName,
        isActive: true,
        status: 'ACTIVE',
        passwordHash,
      },
      create: {
        email,
        username: `hotel-demo-${person.key}`,
        passwordHash,
        firstName: person.firstName,
        lastName: person.lastName,
        organizationId: organization.id,
        roleId: person.managerAccount ? managerRole.id : userRole.id,
      },
    });
    const departmentId = departments.get(person.department)!.id;
    const positionId = positions.get(person.position)!.id;
    const employee = await prisma.hrEmployee.upsert({
      where: {
        organizationId_employeeNumber: {
          organizationId: organization.id,
          employeeNumber: `HOTEL-DEMO-${String(index + 1).padStart(2, '0')}`,
        },
      },
      update: {
        firstName: person.firstName,
        lastName: person.lastName,
        email,
        departmentId,
        positionId,
        mainSiteId: site.id,
        userId: user.id,
        status: 'ACTIVE',
        isArchived: false,
        archivedAt: null,
      },
      create: {
        organizationId: organization.id,
        firstName: person.firstName,
        lastName: person.lastName,
        email,
        hireDate: new Date(2024, 0, 8),
        departmentId,
        positionId,
        mainSiteId: site.id,
        userId: user.id,
        employeeNumber: `HOTEL-DEMO-${String(index + 1).padStart(2, '0')}`,
        status: 'ACTIVE',
        contractType: 'CDI',
        contractWeeklyMinutes: 2_100,
      },
    });
    employees.set(person.key, { id: employee.id, userId: user.id, departmentId, positionId });
  }
  for (const person of people) {
    await prisma.hrEmployee.update({
      where: { id: employees.get(person.key)!.id },
      data: { managerId: person.managerKey ? employees.get(person.managerKey)!.id : null },
    });
  }

  const gram = await prisma.unit.upsert({
    where: { organizationId_symbol: { organizationId: organization.id, symbol: 'kg' } },
    update: { name: 'Kilogramme', type: 'MASS', isArchived: false },
    create: { organizationId: organization.id, name: 'Kilogramme', symbol: 'kg', type: 'MASS' },
  });
  const litre = await prisma.unit.upsert({
    where: { organizationId_symbol: { organizationId: organization.id, symbol: 'L' } },
    update: { name: 'Litre', type: 'VOLUME', isArchived: false },
    create: { organizationId: organization.id, name: 'Litre', symbol: 'L', type: 'VOLUME' },
  });
  const productCategory = await prisma.category.upsert({
    where: { organizationId_name: { organizationId: organization.id, name: 'Matières premières — Démo hôtel' } },
    update: { isArchived: false },
    create: { organizationId: organization.id, name: 'Matières premières — Démo hôtel' },
  });
  const productNames = [...new Set(recipes.flatMap((recipe) => recipe.ingredients.map(([name]) => name)))];
  const products = new Map<string, { id: string; unitId: string }>();
  for (const name of productNames) {
    const unit = recipes.flatMap((recipe) => recipe.ingredients).find(([product]) => product === name)?.[1] === 'L' ? litre : gram;
    const product = await prisma.product.upsert({
      where: { organizationId_name: { organizationId: organization.id, name } },
      update: { categoryId: productCategory.id, unitId: unit.id, kind: 'RAW_MATERIAL', isArchived: false },
      create: { organizationId: organization.id, name, sku: `HOTEL-${name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '-').toUpperCase()}`, categoryId: productCategory.id, unitId: unit.id, kind: 'RAW_MATERIAL' },
    });
    products.set(name, { id: product.id, unitId: unit.id });
  }

  const sheetCategory = await prisma.technicalSheetCategory.upsert({
    where: { organizationId_name: { organizationId: organization.id, name: 'Menu Hôtel — Démonstration' } },
    update: { isArchived: false, color: '#10b981' },
    create: { organizationId: organization.id, name: 'Menu Hôtel — Démonstration', color: '#10b981' },
  });
  const sheets = new Map<string, { id: string; totalTimeMinutes: number }>();
  for (const recipe of recipes) {
    const sheet = await prisma.technicalSheet.upsert({
      where: { organizationId_name: { organizationId: organization.id, name: recipe.name } },
      update: {
        categoryId: sheetCategory.id,
        referencePortions: 30,
        preparationTimeMinutes: recipe.preparation,
        cookingTimeMinutes: recipe.cooking,
        totalTimeMinutes: recipe.preparation + recipe.cooking,
        status: 'ACTIVE',
        mode: 'ASSEMBLY',
        stockPolicy: 'MAKE_TO_ORDER',
        isArchived: false,
        archivedAt: null,
      },
      create: {
        organizationId: organization.id,
        categoryId: sheetCategory.id,
        name: recipe.name,
        description: 'Recette de démonstration pour le menu entrée, plat et dessert de l’hôtel.',
        referencePortions: 30,
        preparationTimeMinutes: recipe.preparation,
        cookingTimeMinutes: recipe.cooking,
        totalTimeMinutes: recipe.preparation + recipe.cooking,
        status: 'ACTIVE',
        mode: 'ASSEMBLY',
        stockPolicy: 'MAKE_TO_ORDER',
      },
    });
    await prisma.technicalSheetIngredient.deleteMany({ where: { technicalSheetId: sheet.id } });
    await prisma.technicalSheetStep.deleteMany({ where: { technicalSheetId: sheet.id } });
    await prisma.technicalSheetIngredient.createMany({
      data: recipe.ingredients.map(([name, , quantity], index) => ({
        organizationId: organization.id,
        technicalSheetId: sheet.id,
        productId: products.get(name)!.id,
        unitId: products.get(name)!.unitId,
        quantity,
        order: index + 1,
        productNameSnapshot: name,
        unitSymbolSnapshot: recipe.ingredients[index][1],
      })),
    });
    await prisma.technicalSheetStep.createMany({
      data: recipe.steps.map(([title, description], index) => ({
        organizationId: organization.id,
        technicalSheetId: sheet.id,
        order: index + 1,
        title,
        description,
        estimatedMinutes: Math.max(5, Math.round((recipe.preparation + recipe.cooking) / recipe.steps.length)),
      })),
    });
    sheets.set(recipe.name, { id: sheet.id, totalTimeMinutes: recipe.preparation + recipe.cooking });
  }

  await prisma.menuSettings.upsert({
    where: { organizationId: organization.id },
    update: { usageProfile: 'RESTAURANT_CAFE', catalogEnabled: true, scheduledMenusEnabled: true, onboardingCompletedAt: now },
    create: { organizationId: organization.id, usageProfile: 'RESTAURANT_CAFE', catalogEnabled: true, scheduledMenusEnabled: true, onboardingCompletedAt: now },
  });
  const menuCategories = new Map<string, { id: string }>();
  for (const [index, name] of ['Entrées', 'Plats', 'Desserts'].entries()) {
    const category = await prisma.menuCategory.upsert({
      where: { organizationId_name: { organizationId: organization.id, name } },
      update: { position: index + 1, catalogType: 'FOOD', isArchived: false },
      create: { organizationId: organization.id, name, position: index + 1, catalogType: 'FOOD' },
    });
    menuCategories.set(name, category);
  }
  let menu = await prisma.menu.findFirst({ where: { organizationId: organization.id, name: 'Menu Hôtel — Saveurs du Nord' } });
  if (menu) {
    menu = await prisma.menu.update({
      where: { id: menu.id },
      data: { service: 'DINNER', kind: 'CATALOG', catalogType: 'FOOD', siteId: site.id, expectedGuests: 30, status: 'PUBLISHED', isPrimary: true, description: 'Menu de démonstration complet : entrée, plat et dessert.' },
    });
  } else {
    menu = await prisma.menu.create({
      data: { organizationId: organization.id, name: 'Menu Hôtel — Saveurs du Nord', service: 'DINNER', kind: 'CATALOG', catalogType: 'FOOD', siteId: site.id, expectedGuests: 30, status: 'PUBLISHED', isPrimary: true, description: 'Menu de démonstration complet : entrée, plat et dessert.', createdById: creator.id, updatedById: creator.id },
    });
  }
  await prisma.menuItem.deleteMany({ where: { menuId: menu.id } });
  await prisma.menuItem.createMany({
    data: recipes.map((recipe, index) => ({
      organizationId: organization.id,
      menuId: menu!.id,
      section: recipe.section,
      menuCategoryId: menuCategories.get(recipe.category)!.id,
      technicalSheetId: sheets.get(recipe.name)!.id,
      position: index + 1,
      servingQuantity: 1,
      targetReadyQuantity: 30,
    })),
  });

  const periodStart = startOfLocalDay(now);
  const periodEnd = new Date(periodStart);
  periodEnd.setMonth(periodEnd.getMonth() + 3);
  const employeeIds = [...employees.values()].map((employee) => employee.id);
  await prisma.operationalTask.deleteMany({
    where: {
      organizationId: organization.id,
      OR: [
        {
          assignedEmployeeId: { in: employeeIds },
          description: { startsWith: 'Tâche quotidienne du service' },
        },
        { menuId: menu.id },
      ],
    },
  });
  await prisma.planningAssignment.deleteMany({
    where: {
      organizationId: organization.id,
      employeeId: { in: employeeIds },
      comment: 'Planning Hôtel — démonstration 3 mois',
    },
  });

  const planningRows: Prisma.PlanningAssignmentCreateManyInput[] = [];
  for (let day = new Date(periodStart); day < periodEnd; day.setDate(day.getDate() + 1)) {
    for (const person of people) {
      if (!person.workDays.includes(day.getDay())) continue;
      const employee = employees.get(person.key)!;
      planningRows.push({
        organizationId: organization.id,
        employeeId: employee.id,
        departmentId: employee.departmentId,
        positionId: employee.positionId,
        siteId: site.id,
        date: startOfLocalDay(day),
        startTime: atHour(day, person.shift[0]),
        endTime: atHour(day, person.shift[1]),
        breakMinutes: person.shift[1] - person.shift[0] >= 8 ? 30 : 0,
        status: 'CONFIRMED',
        origin: 'AUTO_GENERATION',
        comment: 'Planning Hôtel — démonstration 3 mois',
        createdById: creator.id,
        updatedById: creator.id,
      });
    }
  }
  await prisma.planningAssignment.createMany({ data: planningRows });
  const createdShifts = await prisma.planningAssignment.findMany({
    where: { organizationId: organization.id, employeeId: { in: employeeIds }, date: { gte: periodStart, lt: periodEnd } },
  });
  const shiftByEmployeeAndDay = new Map(createdShifts.map((shift) => [`${shift.employeeId}:${dateKey(shift.date)}`, shift]));
  const taskRows: Prisma.OperationalTaskCreateManyInput[] = [];
  for (let day = new Date(periodStart); day < periodEnd; day.setDate(day.getDate() + 1)) {
    const scheduledKitchen: Array<{ person: PersonDefinition; shift: (typeof createdShifts)[number] }> = [];
    for (const person of people) {
      const employee = employees.get(person.key)!;
      const shift = shiftByEmployeeAndDay.get(`${employee.id}:${dateKey(day)}`);
      if (!shift) continue;
      if (person.department === 'Cuisine') scheduledKitchen.push({ person, shift });
      const startsAt = new Date(shift.startTime.getTime() + 30 * 60_000);
      const endsAt = new Date(startsAt.getTime() + 45 * 60_000);
      taskRows.push({
        organizationId: organization.id,
        title: person.taskTitle,
        description: `Tâche quotidienne du service ${person.department}.`,
        category: person.taskCategory,
        status: 'TODO',
        source: 'MANUAL',
        departmentId: employee.departmentId,
        positionId: employee.positionId,
        siteId: site.id,
        assignedEmployeeId: employee.id,
        planningAssignmentId: shift.id,
        startsAt,
        endsAt,
        createdById: employees.get(person.managerKey ?? 'dg')?.userId ?? creator.id,
      });
    }
    const dinnerAt = atHour(day, 19);
    const kitchenAvailability = scheduledKitchen.map((candidate) => ({
      ...candidate,
      availableUntil: dinnerAt,
    }));
    for (const [index, recipe] of recipes.entries()) {
      const duration = sheets.get(recipe.name)!.totalTimeMinutes;
      const candidates = kitchenAvailability
        .filter(({ shift, availableUntil }) =>
          shift.startTime <= new Date(availableUntil.getTime() - duration * 60_000) &&
          shift.endTime >= availableUntil,
        )
        .sort((a, b) => b.availableUntil.getTime() - a.availableUntil.getTime());
      if (!candidates.length) continue;
      const selected = candidates[index % candidates.length];
      const employee = employees.get(selected.person.key)!;
      const endsAt = selected.availableUntil;
      const startsAt = new Date(endsAt.getTime() - duration * 60_000);
      selected.availableUntil = startsAt;
      taskRows.push({
        organizationId: organization.id,
        title: `Préparer · ${recipe.name}`,
        description: 'Menu Hôtel — Saveurs du Nord · dîner à 19:00.',
        category: 'KITCHEN',
        status: 'TODO',
        source: 'MENU',
        departmentId: employee.departmentId,
        positionId: employee.positionId,
        siteId: site.id,
        assignedEmployeeId: employee.id,
        planningAssignmentId: selected.shift.id,
        menuId: menu.id,
        technicalSheetId: sheets.get(recipe.name)!.id,
        startsAt,
        endsAt,
        quantity: 30,
        unitLabel: 'portions',
        createdById: employees.get('chef')!.userId,
      });
    }
  }
  await prisma.operationalTask.createMany({ data: taskRows });

  const summary = {
    organization: organization.name,
    site: site.name,
    collaborators: people.length,
    planningAssignments: planningRows.length,
    operationalTasks: taskRows.length,
    period: { start: dateKey(periodStart), endExclusive: dateKey(periodEnd) },
    menu: menu.name,
    recipes: recipes.map((recipe) => recipe.name),
    demoPassword: 'HotelDemo2026!',
  };
  console.log(JSON.stringify(summary, null, 2));
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
