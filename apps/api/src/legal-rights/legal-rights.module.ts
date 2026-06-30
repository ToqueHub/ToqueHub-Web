import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { LegalRightsController, LegalRightsOnboardingController, PlanningComplianceController } from './legal-rights.controller';
import { LegalRightsService } from './legal-rights.service';

@Module({
  imports: [PrismaModule],
  controllers: [LegalRightsOnboardingController, LegalRightsController, PlanningComplianceController],
  providers: [LegalRightsService],
  exports: [LegalRightsService],
})
export class LegalRightsModule {}
