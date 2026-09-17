import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { MedOutcome } from '@prisma/client';

export class CreateMedOrderDto {
  @IsString()
  residentId!: string;

  @IsString()
  @MinLength(1)
  drugName!: string;

  @IsString()
  dose!: string;

  @IsString()
  route!: string;

  @IsString()
  frequency!: string;

  @IsArray()
  @ArrayMinSize(0)
  @IsString({ each: true })
  scheduleTimes!: string[];

  @IsDateString()
  startDate!: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsBoolean()
  isPrn?: boolean;

  @IsOptional()
  @IsString()
  instructions?: string;
}

export class RecordMedAdminDto {
  @IsString()
  orderId!: string;

  @IsDateString()
  scheduledAt!: string;

  @IsEnum(MedOutcome)
  outcome!: MedOutcome;

  @IsOptional()
  @IsDateString()
  administeredAt?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  /** Client-generated UUID for offline idempotent sync */
  @IsOptional()
  @IsString()
  clientEventId?: string;
}

export class SyncBatchDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RecordMedAdminDto)
  events!: RecordMedAdminDto[];
}
