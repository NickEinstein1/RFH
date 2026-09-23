import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
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

  @IsOptional()
  @IsString()
  brand?: string;

  @IsOptional()
  @IsString()
  rxNumber?: string;

  @IsOptional()
  @IsString()
  imprint?: string;

  @IsOptional()
  @IsString()
  categoryLabel?: string;

  @IsOptional()
  @IsString()
  prescriber?: string;

  @IsOptional()
  @IsBoolean()
  highAlert?: boolean;
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

  /** Back-of-MAR PRN fields (required when recording a GIVEN PRN dose) */
  @IsOptional()
  @IsString()
  prnRouteSite?: string;

  @IsOptional()
  @IsString()
  prnReason?: string;

  @IsOptional()
  @IsString()
  prnBmi?: string;

  @IsOptional()
  @IsString()
  prnBmiOther?: string;

  @IsOptional()
  @IsString()
  prnResult?: string;

  @IsOptional()
  @IsString()
  prnMse?: string;

  @IsOptional()
  @IsString()
  prnMseOther?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  prnPainScore?: number;

  /** Set after reviewing soft safety warnings — must be the server-issued challenge token */
  @IsOptional()
  @IsString()
  safetyChallengeToken?: string;
}

export class SyncBatchDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => RecordMedAdminDto)
  events!: RecordMedAdminDto[];
}
