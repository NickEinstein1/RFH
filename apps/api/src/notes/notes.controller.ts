import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { NotesService } from './notes.service';
import { CreateProgressNoteDto, UpdateProgressNoteDto } from './dto/note.dto';
import { RequirePermissions } from '../common/decorators/auth.decorators';
import { Permissions } from '../common/enums/rbac';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';

@Controller('notes')
export class NotesController {
  constructor(private readonly notes: NotesService) {}

  @Post()
  @RequirePermissions(Permissions.NOTES_WRITE)
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateProgressNoteDto,
    @Req() req: Request,
  ) {
    return this.notes.create(user, dto, req);
  }

  @Get()
  @RequirePermissions(Permissions.NOTES_READ)
  list(
    @CurrentUser() user: AuthUser,
    @Query('residentId') residentId: string,
    @Req() req: Request,
  ) {
    return this.notes.listForResident(user, residentId, req);
  }

  @Get(':id')
  @RequirePermissions(Permissions.NOTES_READ)
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.notes.findOne(user, id, req);
  }

  @Patch(':id')
  @RequirePermissions(Permissions.NOTES_WRITE)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateProgressNoteDto,
    @Req() req: Request,
  ) {
    return this.notes.update(user, id, dto, req);
  }

  @Delete(':id')
  @RequirePermissions(Permissions.NOTES_WRITE)
  softDelete(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.notes.softDelete(user, id, req);
  }
}
