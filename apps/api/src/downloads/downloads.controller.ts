import { Controller, Get, Param, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { DownloadsService } from './downloads.service';
import { RequirePermissions } from '../common/decorators/auth.decorators';
import { Permissions } from '../common/enums/rbac';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';

@Controller('downloads')
export class DownloadsController {
  constructor(private readonly downloads: DownloadsService) {}

  @Get('mar')
  @RequirePermissions(Permissions.MED_PASS)
  mar(
    @CurrentUser() user: AuthUser,
    @Query('residentId') residentId: string,
    @Query('month') month: string,
    @Res() res: Response,
    @Req() req: Request,
  ) {
    const ym = month || new Date().toISOString().slice(0, 7);
    return this.downloads.marPdf(user, residentId, ym, res, req);
  }

  @Get('care-plan/:id')
  @RequirePermissions(Permissions.CARE_PLANS_READ)
  carePlan(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Res() res: Response,
    @Req() req: Request,
  ) {
    return this.downloads.carePlanPdf(user, id, res, req);
  }

  @Get('incident/:id')
  @RequirePermissions(Permissions.INCIDENTS_READ)
  incident(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Res() res: Response,
    @Req() req: Request,
  ) {
    return this.downloads.incidentPdf(user, id, res, req);
  }

  @Get('inspection-pack')
  @RequirePermissions(Permissions.REPORTS_READ)
  inspectionPack(
    @CurrentUser() user: AuthUser,
    @Query('from') from: string,
    @Query('to') to: string,
    @Res() res: Response,
    @Req() req: Request,
  ) {
    const toIso = to || new Date().toISOString();
    const fromIso =
      from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    return this.downloads.inspectionPackPdf(user, fromIso, toIso, res, req);
  }

  @Get('audit.csv')
  @RequirePermissions(Permissions.AUDIT_READ)
  auditCsv(
    @CurrentUser() user: AuthUser,
    @Query('from') from: string,
    @Query('to') to: string,
    @Res() res: Response,
    @Req() req: Request,
  ) {
    const toIso = to || new Date().toISOString();
    const fromIso =
      from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    return this.downloads.auditCsv(user, fromIso, toIso, res, req);
  }
}
