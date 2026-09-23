import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UploadOrderIntakeDto {
  @IsString()
  residentId!: string;

  @IsString()
  @MinLength(1)
  fileName!: string;

  @IsString()
  @MinLength(1)
  contentType!: string;

  @IsOptional()
  @IsString()
  @MaxLength(900_000)
  @Matches(/^data:(image\/(jpeg|jpg|png|webp)|application\/pdf);base64,/, {
    message: 'dataUrl must be a jpeg/png/webp/pdf data URL',
  })
  dataUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8_000)
  rawText?: string;

  /** Explicit opt-in to send image bytes to OpenAI (requires ORDER_INTAKE_AI_ENABLED + key). */
  @IsOptional()
  @IsBoolean()
  allowAiExtraction?: boolean;
}

export class MedDraftDto {
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
  @IsString({ each: true })
  scheduleTimes!: string[];

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

  @IsOptional()
  @IsString()
  startDate?: string;
}

export class UpdateIntakeDraftsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => MedDraftDto)
  drafts!: MedDraftDto[];
}

export class RejectIntakeDto {
  @IsOptional()
  @IsString()
  reviewNotes?: string;
}
