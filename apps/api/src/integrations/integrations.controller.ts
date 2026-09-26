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
import { PharmacyNetwork } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import type { Request } from 'express';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/auth.decorators';
import { Permissions } from '../common/enums/rbac';
import { FaxService } from '../fax/fax.service';
import { PharmacyService } from '../pharmacy/pharmacy.service';

class FacilitySettingsDto {
  @IsOptional() @IsString() pharmacyName?: string | null;
  @IsOptional() @IsString() pharmacyPhone?: string | null;
  @IsOptional() @IsString() pharmacyFax?: string | null;
  @IsOptional() @IsString() pharmacyNpi?: string | null;
  @IsOptional() @IsString() facilityFax?: string | null;
  @IsOptional() @IsBoolean() faxEnabled?: boolean;
}

class PharmacyConnectionDto {
  @IsOptional() @IsString() id?: string;
  @IsEnum(PharmacyNetwork) network!: PharmacyNetwork;
  @IsString() @MinLength(2) displayName!: string;
  @IsOptional() @IsString() npi?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() fax?: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

class SendFaxDto {
  @IsString() @MinLength(7) toFaxNumber!: string;
  @IsString() @MinLength(2) subject!: string;
  @IsString() documentType!: string;
  @IsOptional() @IsString() documentId?: string;
  @IsOptional() @IsString() medicationOrderId?: string;
  @IsOptional() @IsString() coverNote?: string;
}

class TransmitOrderDto {
  @IsOptional() @IsString() pharmacyConnectionId?: string;
  @IsOptional() @IsString() coverNote?: string;
}

@Controller('integrations')
export class IntegrationsController {
  constructor(
    private readonly fax: FaxService,
    private readonly pharmacy: PharmacyService,
  ) {}

  @Get('status')
  @RequirePermissions(Permissions.INTEGRATIONS_MANAGE)
  async status(@CurrentUser() user: AuthUser) {
    const facility = await this.fax.getFacilityFaxSettings(user.tenantId);
    return {
      faxProvider: this.fax.providerName(),
      faxLive: this.fax.isLiveConfigured(),
      facility,
      pharmacyCatalog: this.pharmacy.catalog(),
      connections: await this.pharmacy.listConnections(user),
      recentFaxes: await this.fax.listJobs(user, 20),
    };
  }

  @Patch('facility')
  @RequirePermissions(Permissions.INTEGRATIONS_MANAGE)
  updateFacility(
    @CurrentUser() user: AuthUser,
    @Body() dto: FacilitySettingsDto,
    @Req() req: Request,
  ) {
    return this.fax.updateFacilityFaxSettings(user, dto, req);
  }

  @Get('pharmacies/catalog')
  @RequirePermissions(Permissions.MED_ORDERS_READ)
  catalog() {
    return this.pharmacy.catalog();
  }

  @Get('pharmacies/connections')
  @RequirePermissions(Permissions.MED_ORDERS_READ)
  connections(@CurrentUser() user: AuthUser) {
    return this.pharmacy.listConnections(user);
  }

  @Post('pharmacies/connections')
  @RequirePermissions(Permissions.INTEGRATIONS_MANAGE)
  upsertConnection(
    @CurrentUser() user: AuthUser,
    @Body() dto: PharmacyConnectionDto,
    @Req() req: Request,
  ) {
    return this.pharmacy.upsertConnection(user, dto, req);
  }

  @Delete('pharmacies/connections/:id')
  @RequirePermissions(Permissions.INTEGRATIONS_MANAGE)
  removeConnection(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.pharmacy.removeConnection(user, id, req);
  }

  @Get('fax/jobs')
  @RequirePermissions(Permissions.FAX_SEND)
  faxJobs(@CurrentUser() user: AuthUser) {
    return this.fax.listJobs(user);
  }

  @Post('fax/send')
  @RequirePermissions(Permissions.FAX_SEND)
  sendFax(@CurrentUser() user: AuthUser, @Body() dto: SendFaxDto, @Req() req: Request) {
    return this.fax.send(user, dto, req);
  }

  @Post('pharmacies/orders/:orderId/transmit')
  @RequirePermissions(Permissions.MED_ORDERS_WRITE)
  transmit(
    @CurrentUser() user: AuthUser,
    @Param('orderId') orderId: string,
    @Body() dto: TransmitOrderDto,
    @Req() req: Request,
  ) {
    return this.pharmacy.transmitOrder(user, orderId, dto, req);
  }
}
