import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{ headers?: Record<string, string | undefined> }>();
    const authorization = request.headers?.authorization;
    if (!authorization) return true;
    return super.canActivate(context);
  }

  handleRequest<TUser = any>(err: unknown, user: unknown): TUser {
    if (err) return null as TUser;
    return (user ?? null) as TUser;
  }
}
