import { Module } from '@nestjs/common';
import { OrderExtractService } from './order-extract.service';

@Module({
  providers: [OrderExtractService],
  exports: [OrderExtractService],
})
export class AiModule {}
