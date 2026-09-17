import { Global, Module } from '@nestjs/common';
import { FamilyAccessService } from './family-access.service';
import { TenantRlsInterceptor } from './tenant-rls.interceptor';

@Global()
@Module({
  providers: [FamilyAccessService, TenantRlsInterceptor],
  exports: [FamilyAccessService, TenantRlsInterceptor],
})
export class TenancyModule {}
