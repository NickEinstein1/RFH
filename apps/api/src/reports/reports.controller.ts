import { Controller, Get, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { ReportsService } from './reports.service';
import { RequirePermissions } from '../common/decorators/auth.decorators';
import { Permissions } from '../common/enums/rbac';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('inspection-pack')
  @RequirePermissions(Permissions.REPORTS_READ)
  inspectionPack(
    @CurrentUser() user: AuthUser,
    @Query('from') from: string,
    @Query('to') to: string,
    @Req() req: Request,
  ) {
    const end = to || new Date().toISOString();
    const start =
      from ||
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    return this.reports.inspectionPack(user, start, end, req);
  }
}
