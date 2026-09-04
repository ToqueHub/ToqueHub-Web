import { ArrayUnique, IsArray, IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export enum CoreRoleName {
  ADMIN = 'Administrateur',
  MANAGER = 'Manager',
  USER = 'Utilisateur',
}

export enum CoreUserStatus {
  ACTIVE = 'ACTIVE',
  INVITED = 'INVITED',
  DISABLED = 'DISABLED',
}

export class CreateManagedUserDto {
  @IsString()
  @IsNotEmpty()
  firstName!: string;

  @IsString()
  @IsNotEmpty()
  lastName!: string;

  @IsEmail()
  email!: string;

  @IsEnum(CoreRoleName)
  role!: CoreRoleName;

  @IsString()
  @MinLength(8)
  temporaryPassword!: string;
}

export class UpdateManagedUserDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  firstName?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  lastName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsEnum(CoreRoleName)
  role?: CoreRoleName;

  @IsOptional()
  @IsEnum(CoreUserStatus)
  status?: CoreUserStatus;
}

export class UpdateRolePermissionsDto {
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  permissionKeys!: string[];
}

export class DevSwitchUserDto {
  @IsString()
  userId!: string;
}
