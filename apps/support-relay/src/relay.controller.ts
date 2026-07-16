import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { RelayService } from './relay.service';

@Controller('v1')
export class RelayController {
  constructor(private readonly relay: RelayService) {}
  private headers(value: Record<string, string | string[] | undefined>) { return Object.fromEntries(Object.entries(value).map(([key, item]) => [key.toLowerCase(), Array.isArray(item) ? item[0] : item])); }
  @Get('health') health() { return { status: 'ok', service: 'toquehub-support-relay' }; }
  @Get('admin/installations') installations(@Headers('x-support-admin-token') token?: string) { return this.relay.installations(token); }
  @Post('admin/installations/:instanceId/block') block(@Param('instanceId') instanceId: string, @Headers('x-support-admin-token') token?: string) { return this.relay.setInstallationBlocked(instanceId, true, token); }
  @Post('admin/installations/:instanceId/unblock') unblock(@Param('instanceId') instanceId: string, @Headers('x-support-admin-token') token?: string) { return this.relay.setInstallationBlocked(instanceId, false, token); }
  @Post('installations/enroll') enroll(@Headers() headers: Record<string, string | string[] | undefined>, @Body() body: any) { return this.relay.enroll(this.headers(headers), body); }
  @Post('tickets') open(@Headers() headers: Record<string, string | string[] | undefined>, @Body() body: any) { return this.relay.open(this.headers(headers), body); }
  @Post('tickets/:id/messages') message(@Headers() headers: Record<string, string | string[] | undefined>, @Param('id') id: string, @Body() body: any) { return this.relay.message(this.headers(headers), id, body); }
  @Post('tickets/:id/close') close(@Headers() headers: Record<string, string | string[] | undefined>, @Param('id') id: string, @Body() body: any) { return this.relay.close(this.headers(headers), id, body); }
  @Post('events/pull') pull(@Headers() headers: Record<string, string | string[] | undefined>, @Body() body: any) { return this.relay.pull(this.headers(headers), body); }
  @Post('events/ack') acknowledge(@Headers() headers: Record<string, string | string[] | undefined>, @Body() body: any) { return this.relay.acknowledge(this.headers(headers), body); }
  @Post('telegram/webhook') webhook(@Headers('x-telegram-bot-api-secret-token') secret: string | undefined, @Body() body: any) { return this.relay.telegramUpdate(body, secret); }
}
