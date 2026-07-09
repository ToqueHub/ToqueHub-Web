import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type PushPayload = {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  channelId?: string;
};

type ExpoPushTicket = {
  status?: string;
  message?: string;
  details?: { error?: string };
};

@Injectable()
export class MobilePushService {
  private readonly logger = new Logger(MobilePushService.name);
  private readonly expoPushUrl = 'https://exp.host/--/api/v2/push/send';

  constructor(private readonly prisma: PrismaService) {}

  async registerToken(params: { organizationId: string; userId: string; token: string; platform?: string; deviceId?: string }) {
    const token = params.token.trim();
    if (!this.isExpoPushToken(token)) {
      throw new BadRequestException('Token Expo push invalide');
    }

    return this.prisma.mobilePushToken.upsert({
      where: { token },
      create: {
        organizationId: params.organizationId,
        userId: params.userId,
        token,
        platform: params.platform ?? null,
        deviceId: params.deviceId ?? null,
        isActive: true,
        disabledAt: null,
        lastRegisteredAt: new Date(),
      },
      update: {
        organizationId: params.organizationId,
        userId: params.userId,
        platform: params.platform ?? null,
        deviceId: params.deviceId ?? null,
        isActive: true,
        disabledAt: null,
        lastRegisteredAt: new Date(),
      },
    });
  }

  async disableToken(organizationId: string, token: string) {
    await this.prisma.mobilePushToken.updateMany({
      where: { organizationId, token },
      data: { isActive: false, disabledAt: new Date() },
    });
    return { ok: true };
  }

  async status(organizationId: string, userId: string) {
    const [organizationActiveTokens, userActiveTokens] = await Promise.all([
      this.prisma.mobilePushToken.count({
        where: {
          organizationId,
          isActive: true,
          user: { isActive: true, organizationId },
        },
      }),
      this.prisma.mobilePushToken.count({
        where: {
          organizationId,
          userId,
          isActive: true,
        },
      }),
    ]);
    return { organizationActiveTokens, userActiveTokens };
  }

  async sendToOrganization(organizationId: string, payload: PushPayload) {
    const tokens = await this.prisma.mobilePushToken.findMany({
      where: {
        organizationId,
        isActive: true,
        user: { isActive: true, organizationId },
      },
      select: { token: true },
    });
    const uniqueTokens = [...new Set(tokens.map((item) => item.token).filter((token) => this.isExpoPushToken(token)))];
    if (!uniqueTokens.length) {
      this.logger.warn(`No active Expo push tokens for organization ${organizationId}`);
      return { sent: 0, activeTokens: 0 };
    }

    let sent = 0;
    for (let index = 0; index < uniqueTokens.length; index += 100) {
      const chunk = uniqueTokens.slice(index, index + 100);
      sent += await this.sendChunk(organizationId, chunk, payload);
    }
    return { sent, activeTokens: uniqueTokens.length };
  }

  private async sendChunk(organizationId: string, tokens: string[], payload: PushPayload) {
    try {
      const response = await fetch(this.expoPushUrl, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(tokens.map((token) => ({
          to: token,
          title: payload.title,
          body: payload.body,
          data: payload.data ?? {},
          sound: 'default',
          priority: 'high',
          channelId: payload.channelId,
        }))),
      });
      const json = await response.json().catch(() => null) as { data?: ExpoPushTicket[] } | null;
      const tickets = Array.isArray(json?.data) ? json.data : [];
      const invalidTokens = tickets
        .map((ticket, index) => ({ ticket, token: tokens[index] }))
        .filter(({ ticket }) => ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered')
        .map(({ token }) => token);
      if (invalidTokens.length) {
        await this.prisma.mobilePushToken.updateMany({
          where: { organizationId, token: { in: invalidTokens } },
          data: { isActive: false, disabledAt: new Date() },
        });
      }
      if (!response.ok) {
        this.logger.warn(`Expo push failed with HTTP ${response.status}`);
        return 0;
      }
      return tokens.length - invalidTokens.length;
    } catch (error: any) {
      this.logger.warn(`Expo push skipped: ${error?.message ?? 'unknown error'}`);
      return 0;
    }
  }

  private isExpoPushToken(token: string) {
    return /^Expo(nent)?PushToken\[[^\]]+\]$/.test(token);
  }
}
