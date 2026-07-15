import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { HrController } from './hr.controller';
import { HrContractOcrService } from './hr-contract-ocr.service';
import { HrService } from './hr.service';
import { HrSensitiveDataCryptoService } from './hr-sensitive-data-crypto.service';
import { HrTimeAccountService } from './time-accounts/hr-time-account.service';

@Module({
  imports: [PrismaModule],
  controllers: [HrController],
  providers: [HrService, HrContractOcrService, HrSensitiveDataCryptoService, HrTimeAccountService],
  exports: [HrService, HrTimeAccountService],
})
export class HrModule {}
