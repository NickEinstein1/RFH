import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { IncidentCategory, IncidentSeverity, IncidentStatus } from '@prisma/client';

export class CreateIncidentDto {
  @IsString()
  residentId!: string;

  @IsDateString()
  occurredAt!: string;

  @IsEnum(IncidentCategory)
  category!: IncidentCategory;

  @IsOptional()
  @IsEnum(IncidentSeverity)
  severity?: IncidentSeverity;

  @IsString()
  @MinLength(1)
  title!: string;

  @IsString()
  @MinLength(1)
  narrative!: string;

  @IsOptional()
  @IsString()
  immediateActions?: string;
}

export class UpdateIncidentDto {
  @IsOptional()
  @IsEnum(IncidentSeverity)
  severity?: IncidentSeverity;

  @IsOptional()
  @IsEnum(IncidentStatus)
  status?: IncidentStatus;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  narrative?: string;

  @IsOptional()
  @IsString()
  immediateActions?: string;
}
