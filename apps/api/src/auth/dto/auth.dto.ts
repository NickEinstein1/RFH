import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { Role } from '@prisma/client';
import { IsStrongPassword } from '../../common/validators/password.policy';

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsOptional()
  @IsString()
  tenantName?: string;
}

export class RegisterTenantDto {
  @IsString()
  @MinLength(2)
  tenantName!: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsEmail()
  email!: string;

  @IsString()
  @IsStrongPassword()
  password!: string;

  @IsString()
  firstName!: string;

  @IsString()
  lastName!: string;
}

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsStrongPassword()
  password!: string;

  @IsString()
  firstName!: string;

  @IsString()
  lastName!: string;

  @IsEnum(Role)
  role!: Role;

  @IsOptional()
  @IsBoolean()
  sendInvite?: boolean;
}

export class RefreshDto {
  @IsString()
  refreshToken!: string;
}

export class PasswordResetRequestDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  tenantName?: string;
}

export class PasswordResetConfirmDto {
  @IsString()
  @MinLength(20)
  token!: string;

  @IsString()
  @IsStrongPassword()
  password!: string;
}

export class ChangePasswordDto {
  @IsString()
  @MinLength(8)
  currentPassword!: string;

  @IsString()
  @IsStrongPassword()
  newPassword!: string;
}

export class SwitchHomeDto {
  @IsString()
  tenantId!: string;
}
