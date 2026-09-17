import { Module } from '@nestjs/common';
import { EmarService } from './emar.service';
import { EmarController } from './emar.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  providers: [EmarService],
  controllers: [EmarController],
  exports: [EmarService],
})
export class EmarModule {}
