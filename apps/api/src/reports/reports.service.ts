import { Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { IncidentSeverity, IncidentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/decorators/current-user.decorator';

type ReadinessFinding = {
  id: string;
  label: string;
  severity: 'ok' | 'warn' | 'critical';
  detail: string;
  penalty: number;
};

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async surveyReadiness(user: AuthUser, req?: Request) {
    const now = new Date();
    const in30d = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [
      expiredCreds,
      expiringCreds,
      openCredAlerts,
      openMedAlerts,
      openHighIncidents,
      staleOpenIncidents,
      medOutcomes,
      openIncidentsTotal,
    ] = await Promise.all([
      this.prisma.db.staffCredential.count({
        where: {
          tenantId: user.tenantId,
          deletedAt: null,
          expiresAt: { lt: now },
        },
      }),
      this.prisma.db.staffCredential.count({
        where: {
          tenantId: user.tenantId,
          deletedAt: null,
          expiresAt: { gte: now, lte: in30d },
        },
      }),
      this.prisma.db.credentialAlert.count({
        where: { tenantId: user.tenantId, status: 'OPEN' },
      }),
      this.prisma.db.medAlert.count({
        where: { tenantId: user.tenantId, status: 'OPEN' },
      }),
      this.prisma.db.incident.count({
        where: {
          tenantId: user.tenantId,
          deletedAt: null,
          status: { not: IncidentStatus.CLOSED },
          severity: { in: [IncidentSeverity.HIGH, IncidentSeverity.CRITICAL] },
        },
      }),
      this.prisma.db.incident.count({
        where: {
          tenantId: user.tenantId,
          deletedAt: null,
          status: { not: IncidentStatus.CLOSED },
          occurredAt: { lt: weekAgo },
        },
      }),
      this.prisma.db.medAdministration.groupBy({
        by: ['outcome'],
        where: {
          tenantId: user.tenantId,
          scheduledAt: { gte: monthAgo, lte: now },
        },
        _count: { _all: true },
      }),
      this.prisma.db.incident.count({
        where: {
          tenantId: user.tenantId,
          deletedAt: null,
          status: { not: IncidentStatus.CLOSED },
        },
      }),
    ]);

    const outcomeMap = Object.fromEntries(
      medOutcomes.map((o) => [o.outcome, o._count._all]),
    ) as Record<string, number>;
    const medTotal = Object.values(outcomeMap).reduce((a, b) => a + b, 0);
    const missed = outcomeMap.MISSED || 0;
    const missedRate = medTotal > 0 ? missed / medTotal : 0;

    const findings: ReadinessFinding[] = [];

    if (expiredCreds > 0) {
      findings.push({
        id: 'credentials_expired',
        label: 'Expired staff credentials',
        severity: 'critical',
        detail: `${expiredCreds} credential(s) past expiration`,
        penalty: Math.min(25, 10 + expiredCreds * 5),
      });
    } else {
      findings.push({
        id: 'credentials_expired',
        label: 'Expired staff credentials',
        severity: 'ok',
        detail: 'None expired',
        penalty: 0,
      });
    }

    if (expiringCreds > 0 || openCredAlerts > 0) {
      findings.push({
        id: 'credentials_expiring',
        label: 'Credentials expiring / open alerts',
        severity: 'warn',
        detail: `${expiringCreds} expiring within 30 days · ${openCredAlerts} open credential alerts`,
        penalty: Math.min(12, 4 + expiringCreds * 2 + openCredAlerts * 2),
      });
    } else {
      findings.push({
        id: 'credentials_expiring',
        label: 'Credentials expiring / open alerts',
        severity: 'ok',
        detail: 'No near-term credential risk',
        penalty: 0,
      });
    }

    if (openMedAlerts > 0) {
      findings.push({
        id: 'open_med_alerts',
        label: 'Open med alerts',
        severity: openMedAlerts >= 5 ? 'critical' : 'warn',
        detail: `${openMedAlerts} unacknowledged med alert(s)`,
        penalty: Math.min(20, 5 + openMedAlerts * 3),
      });
    } else {
      findings.push({
        id: 'open_med_alerts',
        label: 'Open med alerts',
        severity: 'ok',
        detail: 'None open',
        penalty: 0,
      });
    }

    if (openHighIncidents > 0) {
      findings.push({
        id: 'open_high_incidents',
        label: 'Open high/critical incidents',
        severity: 'critical',
        detail: `${openHighIncidents} high/critical report(s) still open`,
        penalty: Math.min(25, 12 + openHighIncidents * 6),
      });
    } else {
      findings.push({
        id: 'open_high_incidents',
        label: 'Open high/critical incidents',
        severity: 'ok',
        detail: 'None open',
        penalty: 0,
      });
    }

    if (staleOpenIncidents > 0) {
      findings.push({
        id: 'stale_incidents',
        label: 'Incomplete incident follow-up',
        severity: 'warn',
        detail: `${staleOpenIncidents} open incident(s) older than 7 days`,
        penalty: Math.min(15, 5 + staleOpenIncidents * 3),
      });
    } else {
      findings.push({
        id: 'stale_incidents',
        label: 'Incomplete incident follow-up',
        severity: 'ok',
        detail: 'No stale open incidents',
        penalty: 0,
      });
    }

    if (medTotal >= 20 && missedRate > 0.05) {
      findings.push({
        id: 'missed_dose_rate',
        label: 'Missed-dose rate (30d)',
        severity: missedRate > 0.1 ? 'critical' : 'warn',
        detail: `${(missedRate * 100).toFixed(1)}% missed (${missed}/${medTotal})`,
        penalty: missedRate > 0.1 ? 15 : 8,
      });
    } else {
      findings.push({
        id: 'missed_dose_rate',
        label: 'Missed-dose rate (30d)',
        severity: 'ok',
        detail:
          medTotal === 0
            ? 'No administrations in range'
            : `${(missedRate * 100).toFixed(1)}% missed (${missed}/${medTotal})`,
        penalty: 0,
      });
    }

    const penalty = findings.reduce((sum, f) => sum + f.penalty, 0);
    const score = Math.max(0, Math.min(100, 100 - penalty));

    const result = {
      generatedAt: now.toISOString(),
      score,
      label:
        score >= 90
          ? 'State-survey ready'
          : score >= 75
            ? 'Mostly ready — close gaps'
            : score >= 50
              ? 'At risk for survey findings'
              : 'Not survey-ready',
      openIncidentsTotal,
      findings,
    };

    await this.audit.logForUser(
      user,
      'report.survey_readiness',
      'Report',
      null,
      { score: result.score },
      req,
    );

    return result;
  }

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
      readiness,
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
      this.surveyReadiness(user),
    ]);

    const pack = {
      generatedAt: new Date().toISOString(),
      facilityTimezone: (
        await this.prisma.db.tenant.findUniqueOrThrow({ where: { id: user.tenantId } })
      ).timezone,
      range: { from: from.toISOString(), to: to.toISOString() },
      surveyReadiness: readiness,
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
      surveyScore: readiness.score,
    }, req);

    return pack;
  }
}
