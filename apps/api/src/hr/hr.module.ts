import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { HrController } from './hr.controller';
import { HrService } from './hr.service';
import { HrTimeAccountService } from './time-accounts/hr-time-account.service';

@Module({
  imports: [PrismaModule],
  controllers: [HrController],
  providers: [HrService, HrTimeAccountService],
  exports: [HrService, HrTimeAccountService],
})
export class HrModule {}
