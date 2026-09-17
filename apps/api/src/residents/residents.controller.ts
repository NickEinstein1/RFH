import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { ResidentsService } from './residents.service';
import { CreateResidentDto, UpdateResidentDto } from './dto/resident.dto';
import { RequirePermissions } from '../common/decorators/auth.decorators';
import { Permissions } from '../common/enums/rbac';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';

@Controller('residents')
export class ResidentsController {
  constructor(private readonly residents: ResidentsService) {}

  @Post()
  @RequirePermissions(Permissions.RESIDENTS_WRITE)
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateResidentDto,
    @Req() req: Request,
  ) {
    return this.residents.create(user, dto, req);
  }

  @Get()
  @RequirePermissions(Permissions.RESIDENTS_READ)
  findAll(@CurrentUser() user: AuthUser, @Req() req: Request) {
    return this.residents.findAll(user, req);
  }

  @Get(':id')
  @RequirePermissions(Permissions.RESIDENTS_READ)
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.residents.findOne(user, id, req);
  }

  @Patch(':id')
  @RequirePermissions(Permissions.RESIDENTS_WRITE)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateResidentDto,
    @Req() req: Request,
  ) {
    return this.residents.update(user, id, dto, req);
  }

  @Delete(':id')
  @RequirePermissions(Permissions.RESIDENTS_WRITE)
  softDelete(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.residents.softDelete(user, id, req);
  }
}
