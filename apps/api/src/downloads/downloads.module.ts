import { Module } from '@nestjs/common';
import { DownloadsController } from './downloads.controller';
import { DownloadsService } from './downloads.service';
import { EmarModule } from '../emar/emar.module';
import { CareModule } from '../care/care.module';
import { IncidentsModule } from '../incidents/incidents.module';
import { ReportsModule } from '../reports/reports.module';
import { AuditModule } from '../audit/audit.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    AuditModule,
    EmarModule,
    CareModule,
    IncidentsModule,
    ReportsModule,
  ],
  controllers: [DownloadsController],
  providers: [DownloadsService],
  exports: [DownloadsService],
})
export class DownloadsModule {}
