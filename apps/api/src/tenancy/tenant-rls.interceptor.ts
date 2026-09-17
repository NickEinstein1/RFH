import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, from, lastValueFrom } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Wraps authenticated HTTP handlers in a tenant-scoped DB transaction
 * so PostgreSQL RLS policies see app.tenant_id.
 */
@Injectable()
export class TenantRlsInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<{ user?: { tenantId?: string } }>();
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return next.handle();
    }

    return from(
      this.prisma.runWithTenant(tenantId, () => lastValueFrom(next.handle())),
    );
  }
}
