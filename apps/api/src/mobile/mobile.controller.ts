import { BadRequestException, Body, Controller, Delete, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RegisterMobilePushTokenDto } from './dto/mobile-push-token.dto';
import { MobilePushService } from './mobile-push.service';

@ApiTags('mobile')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('mobile')
export class MobileController {
  constructor(private readonly pushService: MobilePushService) {}

  @Post('push-tokens')
  @ApiOkResponse({ description: 'Registers or refreshes an Expo push token for the authenticated mobile user.' })
  registerPushToken(@CurrentUser() user: AuthenticatedUser, @Body() dto: RegisterMobilePushTokenDto) {
    const organizationId = this.org(user);
    return this.pushService.registerToken({
      organizationId,
      userId: user.id,
      token: dto.token,
      platform: dto.platform,
      deviceId: dto.deviceId,
    });
  }

  @Delete('push-tokens/:token')
  @ApiOkResponse({ description: 'Disables an Expo push token for the authenticated organization.' })
  disablePushToken(@CurrentUser() user: AuthenticatedUser, @Param('token') token: string) {
    return this.pushService.disableToken(this.org(user), decodeURIComponent(token));
  }

  private org(user: AuthenticatedUser) {
    if (!user.organizationId) throw new BadRequestException('Organization setup is required before registering mobile push tokens');
    return user.organizationId;
  }
}

