import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { HaccpSensorsController } from './haccp-sensors.controller';
import { HaccpSensorsGateway } from './haccp-sensors.gateway';
import { HaccpSensorsService } from './haccp-sensors.service';
import { MqttService } from './mqtt.service';
import { Zigbee2MqttProvider } from './zigbee2mqtt.provider';

@Module({
  imports: [JwtModule.register({})],
  controllers: [HaccpSensorsController],
  providers: [MqttService, Zigbee2MqttProvider, HaccpSensorsGateway, HaccpSensorsService],
  exports: [HaccpSensorsService],
})
export class HaccpIotModule {}
