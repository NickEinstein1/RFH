import { Global, Module } from '@nestjs/common';
import { PhiCryptoService } from './phi-crypto.service';
import { SafetyChallengeService } from '../security/safety-challenge.service';

@Global()
@Module({
  providers: [PhiCryptoService, SafetyChallengeService],
  exports: [PhiCryptoService, SafetyChallengeService],
})
export class CryptoModule {}
