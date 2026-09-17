import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { EmarService } from './emar.service';
import { CreateMedOrderDto, RecordMedAdminDto, SyncBatchDto } from './dto/emar.dto';
import { RequirePermissions } from '../common/decorators/auth.decorators';
import { Permissions } from '../common/enums/rbac';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';

@Controller('emar')
export class EmarController {
  constructor(private readonly emar: EmarService) {}

  @Post('orders')
  @RequirePermissions(Permissions.MED_ORDERS_WRITE)
  createOrder(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateMedOrderDto,
    @Req() req: Request,
  ) {
    return this.emar.createOrder(user, dto, req);
  }

  @Get('orders')
  @RequirePermissions(Permissions.MED_ORDERS_READ)
  listOrders(
    @CurrentUser() user: AuthUser,
    @Query('residentId') residentId: string,
    @Req() req: Request,
  ) {
    return this.emar.listOrders(user, residentId, req);
  }

  @Get('med-pass')
  @RequirePermissions(Permissions.MED_PASS)
  medPassBoard(
    @CurrentUser() user: AuthUser,
    @Query('residentId') residentId: string,
    @Query('date') date: string,
    @Req() req: Request,
  ) {
    const day = date || new Date().toISOString().slice(0, 10);
    return this.emar.medPassBoard(user, residentId, day, req);
  }

  @Post('administrations')
  @RequirePermissions(Permissions.MED_PASS)
  record(
    @CurrentUser() user: AuthUser,
    @Body() dto: RecordMedAdminDto,
    @Req() req: Request,
  ) {
    return this.emar.recordAdministration(user, dto, req);
  }

  @Get('sync/snapshot')
  @RequirePermissions(Permissions.MED_PASS)
  syncSnapshot(
    @CurrentUser() user: AuthUser,
    @Query('residentId') residentId: string,
    @Query('date') date: string,
    @Req() req: Request,
  ) {
    return this.emar.syncSnapshot(
      user,
      residentId,
      date || new Date().toISOString().slice(0, 10),
      req,
    );
  }

  @Post('sync/batch')
  @RequirePermissions(Permissions.MED_PASS)
  syncBatch(
    @CurrentUser() user: AuthUser,
    @Body() dto: SyncBatchDto,
    @Req() req: Request,
  ) {
    return this.emar.syncBatch(user, dto.events, req);
  }

  @Get('alerts')
  @RequirePermissions(Permissions.MED_PASS)
  alerts(@CurrentUser() user: AuthUser, @Req() req: Request) {
    return this.emar.listOpenAlerts(user, req);
  }

  @Patch('alerts/:id/acknowledge')
  @RequirePermissions(Permissions.ALERTS_ACK)
  ack(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.emar.acknowledgeAlert(user, id, req);
  }
}
