import { IsDateString, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { NoteType } from '@prisma/client';

export class CreateProgressNoteDto {
  @IsString()
  residentId!: string;

  @IsString()
  @MinLength(1)
  body!: string;

  @IsOptional()
  @IsEnum(NoteType)
  noteType?: NoteType;

  @IsDateString()
  occurredAt!: string;
}

export class UpdateProgressNoteDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  body?: string;

  @IsOptional()
  @IsEnum(NoteType)
  noteType?: NoteType;

  @IsOptional()
  @IsDateString()
  occurredAt?: string;
}
