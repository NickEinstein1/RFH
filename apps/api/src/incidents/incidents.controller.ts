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
import { IncidentStatus } from '@prisma/client';
import { IncidentsService } from './incidents.service';
import { CreateIncidentDto, UpdateIncidentDto } from './dto/incident.dto';
import { RequirePermissions } from '../common/decorators/auth.decorators';
import { Permissions } from '../common/enums/rbac';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';

@Controller('incidents')
export class IncidentsController {
  constructor(private readonly incidents: IncidentsService) {}

  @Post()
  @RequirePermissions(Permissions.INCIDENTS_WRITE)
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateIncidentDto,
    @Req() req: Request,
  ) {
    return this.incidents.create(user, dto, req);
  }

  @Get()
  @RequirePermissions(Permissions.INCIDENTS_READ)
  list(
    @CurrentUser() user: AuthUser,
    @Query('residentId') residentId?: string,
    @Query('status') status?: IncidentStatus,
    @Req() req?: Request,
  ) {
    return this.incidents.list(user, { residentId, status }, req);
  }

  @Get(':id')
  @RequirePermissions(Permissions.INCIDENTS_READ)
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.incidents.findOne(user, id, req);
  }

  @Patch(':id')
  @RequirePermissions(Permissions.INCIDENTS_WRITE)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateIncidentDto,
    @Req() req: Request,
  ) {
    return this.incidents.update(user, id, dto, req);
  }

  @Post(':id/close')
  @RequirePermissions(Permissions.INCIDENTS_CLOSE)
  close(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.incidents.close(user, id, req);
  }

  @Delete(':id')
  @RequirePermissions(Permissions.INCIDENTS_WRITE)
  softDelete(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.incidents.softDelete(user, id, req);
  }
}
