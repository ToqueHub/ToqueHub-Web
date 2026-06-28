import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { HrEntitlementService } from './entitlements/hr-entitlement.service';
import { HrController } from './hr.controller';
import { HrService } from './hr.service';
import { HrTimeAccountService } from './time-accounts/hr-time-account.service';

@Module({
  imports: [PrismaModule],
  controllers: [HrController],
  providers: [HrService, HrEntitlementService, HrTimeAccountService],
  exports: [HrService, HrEntitlementService, HrTimeAccountService],
})
export class HrModule {}
