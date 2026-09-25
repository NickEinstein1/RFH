import {
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ResidentStatus, Sex } from '@prisma/client';

export class CreateResidentDto {
  @IsString()
  @MinLength(1)
  firstName!: string;

  @IsString()
  @MinLength(1)
  lastName!: string;

  @IsDateString()
  dateOfBirth!: string;

  @IsOptional()
  @IsEnum(Sex)
  sex?: Sex;

  @IsOptional()
  @IsString()
  mrn?: string;

  @IsOptional()
  @IsString()
  room?: string;

  @IsDateString()
  admitDate!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allergies?: string[];
}

export class UpdateResidentDto {
  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @IsEnum(Sex)
  sex?: Sex;

  @IsOptional()
  @IsString()
  mrn?: string;

  @IsOptional()
  @IsString()
  room?: string;

  @IsOptional()
  @IsEnum(ResidentStatus)
  status?: ResidentStatus;

  @IsOptional()
  @IsDateString()
  admitDate?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allergies?: string[];
}

export class UploadResidentPhotoDto {
  /** JPEG/PNG/WebP data URL from client, or a routed /api/media path for seeded photos */
  @IsString()
  @MaxLength(900_000)
  @Matches(/^(data:image\/(jpeg|jpg|png|webp);base64,|\/api\/media\/residents\/)/, {
    message: 'photoUrl must be a jpeg/png/webp data URL or /api/media/residents/… path',
  })
  photoUrl!: string;
}
