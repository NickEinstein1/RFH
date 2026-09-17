import { Controller, Get, Query, Req } from '@nestjs/common';
import { AuditService } from './audit.service';
import { RequirePermissions } from '../common/decorators/auth.decorators';
import { Permissions } from '../common/enums/rbac';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import type { Request } from 'express';

@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequirePermissions(Permissions.AUDIT_READ)
  async list(
    @CurrentUser() user: AuthUser,
    @Query('take') take?: string,
    @Query('cursor') cursor?: string,
    @Query('resourceType') resourceType?: string,
    @Req() req?: Request,
  ) {
    const rows = await this.audit.findForTenant(user.tenantId, {
      take: take ? Number(take) : 50,
      cursor,
      resourceType,
    });
    await this.audit.logForUser(
      user,
      'audit.read',
      'AuditLog',
      null,
      { count: rows.length, resourceType: resourceType ?? null },
      req,
    );
    return rows;
  }
}
