import { Module } from '@nestjs/common';
import { EmarService } from './emar.service';
import { EmarController } from './emar.controller';
import { OrderIntakeService } from './order-intake.service';
import { OrderIntakeController } from './order-intake.controller';
import { AuditModule } from '../audit/audit.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [AuditModule, AiModule],
  providers: [EmarService, OrderIntakeService],
  controllers: [EmarController, OrderIntakeController],
  exports: [EmarService, OrderIntakeService],
})
export class EmarModule {}
