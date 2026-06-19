import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AdminGuard } from '../common/guards/admin.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { CoreRoleName, CreateManagedUserDto, DevSwitchUserDto, UpdateManagedUserDto, UpdateRolePermissionsDto } from './dto/user-management.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('users')
  @ApiOkResponse({ description: 'Lists organization users.' })
  listUsers(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.listUsers(user);
  }

  @Post('users')
  @ApiOkResponse({ description: 'Creates an invited ToqueHub user with a temporary password.' })
  createUser(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateManagedUserDto) {
    return this.usersService.createUser(user, dto);
  }

  @Patch('users/:id')
  @ApiOkResponse({ description: 'Updates a ToqueHub user without deleting history.' })
  updateUser(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateManagedUserDto) {
    return this.usersService.updateUser(user, id, dto);
  }

  @Post('users/:id/disable')
  @ApiOkResponse({ description: 'Disables a user while preserving history.' })
  disableUser(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.usersService.disableUser(user, id);
  }

  @Get('roles')
  @ApiOkResponse({ description: 'Lists editable core roles and their fine-grained permissions.' })
  listRoles(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.listRoles(user);
  }

  @Patch('roles/:roleName/permissions')
  @ApiOkResponse({ description: 'Replaces permissions for an editable core role.' })
  updateRolePermissions(@CurrentUser() user: AuthenticatedUser, @Param('roleName') roleName: CoreRoleName, @Body() dto: UpdateRolePermissionsDto) {
    return this.usersService.updateRolePermissions(user, roleName, dto.permissionKeys);
  }

  @Get('dev-switch/config')
  @ApiOkResponse({ description: 'Returns whether the development user switch is available.' })
  devSwitchConfig(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.getDevSwitchConfig(user);
  }

  @Post('dev-switch')
  @ApiOkResponse({ description: 'Switches session to another organization user when enabled for development.' })
  devSwitch(@CurrentUser() user: AuthenticatedUser, @Body() dto: DevSwitchUserDto) {
    return this.usersService.devSwitch(user, dto.userId);
  }
}
