import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { StaffService } from './staff.service';
import { CreateCredentialDto, CreateFamilyLinkDto } from './dto/staff.dto';
import { RequirePermissions } from '../common/decorators/auth.decorators';
import { Permissions } from '../common/enums/rbac';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';

@Controller('staff')
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @Get('users')
  @RequirePermissions(Permissions.USERS_MANAGE)
  listUsers(@CurrentUser() user: AuthUser, @Req() req: Request) {
    return this.staff.listUsers(user, req);
  }

  @Post('credentials')
  @RequirePermissions(Permissions.CREDENTIALS_WRITE)
  createCredential(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateCredentialDto,
    @Req() req: Request,
  ) {
    return this.staff.createCredential(user, dto, req);
  }

  @Get('credentials')
  @RequirePermissions(Permissions.CREDENTIALS_READ)
  listCredentials(
    @CurrentUser() user: AuthUser,
    @Query('userId') userId: string | undefined,
    @Req() req: Request,
  ) {
    return this.staff.listCredentials(user, userId, req);
  }

  @Get('credential-alerts')
  @RequirePermissions(Permissions.CREDENTIALS_READ)
  listAlerts(@CurrentUser() user: AuthUser, @Req() req: Request) {
    return this.staff.listCredentialAlerts(user, req);
  }

  @Patch('credential-alerts/:id/acknowledge')
  @RequirePermissions(Permissions.CREDENTIALS_WRITE)
  ackAlert(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.staff.acknowledgeCredentialAlert(user, id, req);
  }

  @Post('family-links')
  @RequirePermissions(Permissions.FAMILY_LINKS_MANAGE)
  createLink(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateFamilyLinkDto,
    @Req() req: Request,
  ) {
    return this.staff.createFamilyLink(user, dto, req);
  }

  @Get('family-links')
  @RequirePermissions(Permissions.FAMILY_LINKS_MANAGE)
  listLinks(@CurrentUser() user: AuthUser, @Req() req: Request) {
    return this.staff.listFamilyLinks(user, req);
  }
}
