import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { FaxService } from '../fax/fax.service';
import { PharmacyService } from '../pharmacy/pharmacy.service';
import { IntegrationsController } from './integrations.controller';

@Module({
  imports: [AuditModule],
  controllers: [IntegrationsController],
  providers: [FaxService, PharmacyService],
  exports: [FaxService, PharmacyService],
})
export class IntegrationsModule {}
