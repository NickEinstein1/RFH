import { Module } from '@nestjs/common';
import { IncidentsService } from './incidents.service';
import { IncidentsController } from './incidents.controller';
import { AuditModule } from '../audit/audit.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [AuditModule, MailModule],
  providers: [IncidentsService],
  controllers: [IncidentsController],
  exports: [IncidentsService],
})
export class IncidentsModule {}
