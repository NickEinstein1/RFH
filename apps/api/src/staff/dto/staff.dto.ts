import { IsDateString, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { CredentialType } from '@prisma/client';

export class CreateCredentialDto {
  @IsString()
  userId!: string;

  @IsEnum(CredentialType)
  type!: CredentialType;

  @IsString()
  @MinLength(1)
  label!: string;

  @IsOptional()
  @IsString()
  licenseNumber?: string;

  @IsOptional()
  @IsDateString()
  issuedAt?: string;

  @IsDateString()
  expiresAt!: string;
}

export class CreateFamilyLinkDto {
  @IsString()
  userId!: string;

  @IsString()
  residentId!: string;

  @IsString()
  @MinLength(1)
  relationship!: string;
}
