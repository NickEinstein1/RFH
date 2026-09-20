import { Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
