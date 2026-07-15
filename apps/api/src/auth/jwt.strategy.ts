import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UserStatus } from '@prisma/client';
import type { AuthenticatedUser } from './authenticated-user';
import { PrismaService } from '../prisma/prisma.service';

interface JwtPayload {
  sub: string;
  email: string;
  organizationId: string | null;
  role: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET', 'change-me-in-development'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { role: { include: { permissions: { include: { permission: true } } } }, hrEmployee: { select: { id: true } } },
    });
    if (!user || !user.isActive || user.status === UserStatus.DISABLED) return null;
    return {
      id: user.id,
      email: user.email,
      organizationId: user.organizationId,
      role: user.role.name,
      permissions: user.role.permissions.map((entry) => entry.permission.key),
      employeeId: user.hrEmployee?.id ?? null,
    };
  }
}
