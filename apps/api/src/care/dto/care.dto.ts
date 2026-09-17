import {
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { CarePlanStatus, CareTaskCategory, ShiftWindow, TaskOutcome } from '@prisma/client';

export class CreateCarePlanDto {
  @IsString()
  residentId!: string;

  @IsString()
  @MinLength(1)
  title!: string;

  @IsOptional()
  @IsString()
  goals?: string;

  @IsDateString()
  effectiveFrom!: string;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string;
}

export class CreateCareTaskDto {
  @IsString()
  carePlanId!: string;

  @IsEnum(CareTaskCategory)
  category!: CareTaskCategory;

  @IsString()
  @MinLength(1)
  title!: string;

  @IsOptional()
  @IsEnum(ShiftWindow)
  shift?: ShiftWindow;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scheduleTimes?: string[];

  @IsOptional()
  @IsString()
  instructions?: string;
}

export class RecordTaskCompletionDto {
  @IsString()
  careTaskId!: string;

  @IsDateString()
  scheduledAt!: string;

  @IsEnum(TaskOutcome)
  outcome!: TaskOutcome;

  @IsOptional()
  @IsDateString()
  completedAt?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  clientEventId?: string;
}

export class UpdateCarePlanDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  goals?: string;

  @IsOptional()
  @IsEnum(CarePlanStatus)
  status?: CarePlanStatus;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string;
}
