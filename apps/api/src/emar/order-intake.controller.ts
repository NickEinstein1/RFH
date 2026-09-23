import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { OrderIntakeService } from './order-intake.service';
import {
  RejectIntakeDto,
  UpdateIntakeDraftsDto,
  UploadOrderIntakeDto,
} from './dto/order-intake.dto';
import { RequirePermissions } from '../common/decorators/auth.decorators';
import { Permissions } from '../common/enums/rbac';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';

@Controller('emar/order-intake')
export class OrderIntakeController {
  constructor(private readonly intake: OrderIntakeService) {}

  @Get('status')
  @RequirePermissions(Permissions.MED_ORDERS_READ)
  status() {
    return this.intake.aiAvailable();
  }

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @RequirePermissions(Permissions.MED_ORDERS_WRITE)
  upload(
    @CurrentUser() user: AuthUser,
    @Body() dto: UploadOrderIntakeDto,
    @Req() req: Request,
  ) {
    return this.intake.upload(user, dto, req);
  }

  @Get()
  @RequirePermissions(Permissions.MED_ORDERS_READ)
  list(
    @CurrentUser() user: AuthUser,
    @Query('residentId') residentId: string,
    @Req() req: Request,
  ) {
    return this.intake.list(user, residentId, req);
  }

  @Get(':id')
  @RequirePermissions(Permissions.MED_ORDERS_READ)
  getOne(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.intake.getOne(user, id, req);
  }

  @Post(':id/extract')
  @RequirePermissions(Permissions.MED_ORDERS_WRITE)
  reextract(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.intake.reextract(user, id, req);
  }

  @Patch(':id/drafts')
  @RequirePermissions(Permissions.MED_ORDERS_WRITE)
  updateDrafts(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateIntakeDraftsDto,
    @Req() req: Request,
  ) {
    return this.intake.updateDrafts(user, id, dto.drafts, req);
  }

  @Post(':id/approve')
  @RequirePermissions(Permissions.MED_ORDERS_WRITE)
  approve(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.intake.approve(user, id, req);
  }

  @Post(':id/reject')
  @RequirePermissions(Permissions.MED_ORDERS_WRITE)
  reject(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: RejectIntakeDto,
    @Req() req: Request,
  ) {
    return this.intake.reject(user, id, dto, req);
  }
}
