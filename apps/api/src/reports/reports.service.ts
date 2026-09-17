import { Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/decorators/current-user.decorator';

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async inspectionPack(user: AuthUser, fromIso: string, toIso: string, req?: Request) {
    const from = new Date(fromIso);
    const to = new Date(toIso);

    const [
      census,
      medOutcomes,
      openMedAlerts,
      incidents,
      credentialsExpiring,
      taskCompletions,
      auditCount,
      softDeletedResidents,
      softDeletedNotes,
    ] = await Promise.all([
      this.prisma.db.resident.findMany({
        where: { tenantId: user.tenantId, deletedAt: null, status: 'ACTIVE' },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          room: true,
          admitDate: true,
          allergies: true,
        },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      }),
      this.prisma.db.medAdministration.groupBy({
        by: ['outcome'],
        where: {
          tenantId: user.tenantId,
          scheduledAt: { gte: from, lte: to },
        },
        _count: { _all: true },
      }),
      this.prisma.db.medAlert.count({
        where: { tenantId: user.tenantId, status: 'OPEN' },
      }),
      this.prisma.db.incident.findMany({
        where: {
          tenantId: user.tenantId,
          deletedAt: null,
          occurredAt: { gte: from, lte: to },
        },
        select: {
          id: true,
          title: true,
          category: true,
          severity: true,
          status: true,
          occurredAt: true,
          resident: { select: { firstName: true, lastName: true, room: true } },
        },
        orderBy: { occurredAt: 'desc' },
      }),
      this.prisma.db.staffCredential.findMany({
        where: {
          tenantId: user.tenantId,
          deletedAt: null,
          expiresAt: { lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
        },
        select: {
          id: true,
          type: true,
          label: true,
          expiresAt: true,
          user: { select: { firstName: true, lastName: true, role: true } },
        },
        orderBy: { expiresAt: 'asc' },
      }),
      this.prisma.db.taskCompletion.groupBy({
        by: ['outcome'],
        where: {
          tenantId: user.tenantId,
          scheduledAt: { gte: from, lte: to },
        },
        _count: { _all: true },
      }),
      this.prisma.db.auditLog.count({
        where: {
          tenantId: user.tenantId,
          createdAt: { gte: from, lte: to },
        },
      }),
      this.prisma.db.resident.count({
        where: { tenantId: user.tenantId, deletedAt: { not: null } },
      }),
      this.prisma.db.progressNote.count({
        where: { tenantId: user.tenantId, deletedAt: { not: null } },
      }),
    ]);

    const pack = {
      generatedAt: new Date().toISOString(),
      facilityTimezone: (
        await this.prisma.db.tenant.findUniqueOrThrow({ where: { id: user.tenantId } })
      ).timezone,
      range: { from: from.toISOString(), to: to.toISOString() },
      census: {
        activeCount: census.length,
        residents: census,
      },
      emar: {
        outcomeCounts: Object.fromEntries(
          medOutcomes.map((o) => [o.outcome, o._count._all]),
        ),
        openAlertCount: openMedAlerts,
      },
      incidents: {
        count: incidents.length,
        items: incidents,
      },
      credentials: {
        expiringOrExpiredCount: credentialsExpiring.length,
        items: credentialsExpiring,
      },
      tasks: {
        outcomeCounts: Object.fromEntries(
          taskCompletions.map((o) => [o.outcome, o._count._all]),
        ),
      },
      audit: {
        eventCountInRange: auditCount,
      },
      retention: {
        softDeletedResidents,
        softDeletedNotes,
        hardDeletesOfClinicalRecords: 0,
        note: 'Clinical records use soft delete only; hard delete count is always 0 by policy.',
      },
    };

    await this.audit.logForUser(user, 'report.inspection_pack', 'Report', null, {
      from: fromIso,
      to: toIso,
      activeResidents: census.length,
      incidentCount: incidents.length,
    }, req);

    return pack;
  }
}
