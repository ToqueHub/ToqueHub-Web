import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OnGatewayConnection, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { UserStatus } from '@prisma/client';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../../prisma/prisma.service';

type SensorSocket = Socket & { organizationId?: string; userId?: string };

@WebSocketGateway({
  namespace: 'haccp-sensors',
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') ?? [
      'http://localhost:5173',
      'http://localhost:3000',
      'http://localhost:8081',
      'http://localhost:8082',
      'http://localhost:19006',
      'http://127.0.0.1:8081',
      'http://127.0.0.1:8082',
      'http://127.0.0.1:19006',
    ],
    credentials: true,
  },
})
export class HaccpSensorsGateway implements OnGatewayConnection {
  private readonly logger = new Logger(HaccpSensorsGateway.name);

  @WebSocketServer()
  private server?: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(client: SensorSocket) {
    try {
      const token = this.extractToken(client);
      if (!token) throw new Error('Missing token');
      const payload = await this.jwtService.verifyAsync<{ sub: string }>(token, {
        secret: this.configService.get<string>('JWT_SECRET', 'change-me-in-development'),
      });
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub }, include: { role: true } });
      if (!user || !user.organizationId || !user.isActive || user.status === UserStatus.DISABLED) throw new Error('Invalid user');
      client.organizationId = user.organizationId;
      client.userId = user.id;
      await client.join(this.room(user.organizationId));
    } catch (error: any) {
      this.logger.warn(`Rejected HACCP sensor socket: ${error?.message ?? 'unknown error'}`);
      client.disconnect(true);
    }
  }

  emitToOrganization(organizationId: string, event: string, payload: unknown) {
    this.server?.to(this.room(organizationId)).emit(event, payload);
  }

  private extractToken(client: Socket) {
    const authToken = client.handshake.auth?.token;
    if (typeof authToken === 'string' && authToken.trim()) return authToken.trim();
    const authorization = client.handshake.headers.authorization;
    if (typeof authorization === 'string' && authorization.startsWith('Bearer ')) return authorization.slice(7).trim();
    return undefined;
  }

  private room(organizationId: string) {
    return `organization:${organizationId}`;
  }
}
