/**
 * Backfill idempotent : migre les données plates HrEmployee vers les modèles dédiés.
 *
 * Règles :
 * - Un contrat est créé uniquement si aucun contrat n'existe déjà pour l'employé.
 * - Une compensation est créée uniquement si aucune compensation n'existe.
 * - Une review est créée uniquement si aucune review équivalente n'existe.
 *
 * Commande :
 *   cd apps/api && npx tsx prisma/backfill-hr-models.ts
 */
import { PrismaClient, HrContractStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting HR backfill...');

  const employees = await prisma.hrEmployee.findMany({
    where: {
      OR: [
        { contractType: { not: null } },
        { hourlyRate: { not: null } },
        { nextReviewDate: { not: null } },
      ],
    },
  });

  let contractsCreated = 0;
  let compensationsCreated = 0;
  let reviewsCreated = 0;

  for (const emp of employees) {
    // Contrat
    if (emp.contractType) {
      const existingContracts = await prisma.hrEmploymentContract.count({ where: { employeeId: emp.id } });
      if (existingContracts === 0) {
        await prisma.hrEmploymentContract.create({
          data: {
            organizationId: emp.organizationId,
            employeeId: emp.id,
            contractType: emp.contractType,
            startDate: emp.hireDate,
            endDate: emp.contractEndDate,
            weeklyHours: emp.contractWeeklyMinutes,
            trialEndDate: emp.trialEndDate,
            status: HrContractStatus.ACTIVE,
          },
        });
        contractsCreated++;
      }
    }

    // Compensation
    if (emp.hourlyRate != null) {
      const existingCompensations = await prisma.hrEmployeeCompensation.count({ where: { employeeId: emp.id } });
      if (existingCompensations === 0) {
        await prisma.hrEmployeeCompensation.create({
          data: {
            employeeId: emp.id,
            hourlyRate: emp.hourlyRate,
            currency: emp.currency || 'EUR',
            effectiveFrom: emp.rateEffectiveDate || emp.hireDate,
            reason: 'Migration depuis les champs plats HrEmployee',
          },
        });
        compensationsCreated++;
      }
    }

    // Review
    if (emp.nextReviewDate) {
      const existingReviews = await prisma.hrSalaryReview.count({
        where: { employeeId: emp.id, dueDate: emp.nextReviewDate },
      });
      if (existingReviews === 0) {
        let freqMonths: number | null = null;
        switch (emp.reviewFrequency) {
          case 'MONTHLY': freqMonths = 1; break;
          case 'QUARTERLY': freqMonths = 3; break;
          case 'YEARLY': freqMonths = 12; break;
        }
        await prisma.hrSalaryReview.create({
          data: {
            employeeId: emp.id,
            dueDate: emp.nextReviewDate,
            frequencyMonths: freqMonths,
            notes: emp.reviewFrequency ? `Fréquence migrée : ${emp.reviewFrequency}` : undefined,
          },
        });
        reviewsCreated++;
      }
    }
  }

  console.log(`Backfill complete:`);
  console.log(`  - Contracts created: ${contractsCreated}`);
  console.log(`  - Compensations created: ${compensationsCreated}`);
  console.log(`  - Reviews created: ${reviewsCreated}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
