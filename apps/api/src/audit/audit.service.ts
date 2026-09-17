import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/decorators/current-user.decorator';

export type AuditWriteInput = {
  tenantId: string;
  actorId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  metadata?: Prisma.InputJsonValue;
  ip?: string | null;
  userAgent?: string | null;
};

/**
 * Append-only audit writer. Never updates or deletes audit rows.
 * All PHI access/mutation paths must call this.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(input: AuditWriteInput) {
    return this.prisma.db.auditLog.create({
      data: {
        tenantId: input.tenantId,
        actorId: input.actorId ?? null,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId ?? null,
        metadata: input.metadata ?? undefined,
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
      },
    });
  }

  async logForUser(
    user: AuthUser,
    action: string,
    resourceType: string,
    resourceId: string | null,
    metadata?: Prisma.InputJsonValue,
    req?: { ip?: string; headers?: Record<string, string | string[] | undefined> },
  ) {
    const ua = req?.headers?.['user-agent'];
    return this.log({
      tenantId: user.tenantId,
      actorId: user.id,
      action,
      resourceType,
      resourceId,
      metadata,
      ip: req?.ip,
      userAgent: Array.isArray(ua) ? ua[0] : ua,
    });
  }

  async findForTenant(
    tenantId: string,
    opts: { take?: number; cursor?: string; resourceType?: string } = {},
  ) {
    return this.prisma.db.auditLog.findMany({
      where: {
        tenantId,
        ...(opts.resourceType ? { resourceType: opts.resourceType } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: opts.take ?? 50,
      ...(opts.cursor
        ? { skip: 1, cursor: { id: opts.cursor } }
        : {}),
      include: {
        actor: {
          select: { id: true, firstName: true, lastName: true, email: true, role: true },
        },
      },
    });
  }
}
