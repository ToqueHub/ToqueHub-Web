import { Module } from '@nestjs/common';
import { MobileController } from './mobile.controller';
import { MobilePushService } from './mobile-push.service';

@Module({
  controllers: [MobileController],
  providers: [MobilePushService],
  exports: [MobilePushService],
})
export class MobileModule {}

