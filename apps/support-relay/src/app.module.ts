import { Module } from '@nestjs/common';
import { RelayController } from './relay.controller';
import { RelayPrismaService } from './prisma.service';
import { RelayService } from './relay.service';
@Module({ controllers: [RelayController], providers: [RelayPrismaService, RelayService] }) export class AppModule {}
