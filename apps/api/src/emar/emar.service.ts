import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MedAlertType, MedOrderStatus, MedOutcome } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { CreateMedOrderDto, RecordMedAdminDto } from './dto/emar.dto';
import type { Request } from 'express';
import {
  addDaysYmd,
  facilityLocalToUtc,
  facilityTodayYmd,
} from '../common/time/facility-time';

const LATE_GRACE_MINUTES = 60;

@Injectable()
export class EmarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async createOrder(user: AuthUser, dto: CreateMedOrderDto, req?: Request) {
    const resident = await this.prisma.db.resident.findFirst({
      where: { id: dto.residentId, tenantId: user.tenantId, deletedAt: null },
    });
    if (!resident) throw new NotFoundException('Resident not found');

    const order = await this.prisma.db.medicationOrder.create({
      data: {
        tenantId: user.tenantId,
        residentId: dto.residentId,
        drugName: dto.drugName,
        dose: dto.dose,
        route: dto.route,
        frequency: dto.frequency,
        scheduleTimes: dto.scheduleTimes,
        startDate: new Date(dto.startDate),
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        isPrn: dto.isPrn ?? false,
        instructions: dto.instructions,
      },
    });

    await this.audit.logForUser(user, 'med_order.create', 'MedicationOrder', order.id, {
      drugName: order.drugName,
      residentId: order.residentId,
    }, req);
    return order;
  }

  async listOrders(user: AuthUser, residentId: string, req?: Request) {
    await this.assertResident(user.tenantId, residentId);
    const orders = await this.prisma.db.medicationOrder.findMany({
      where: {
        tenantId: user.tenantId,
        residentId,
        deletedAt: null,
        status: MedOrderStatus.ACTIVE,
      },
      orderBy: { drugName: 'asc' },
    });
    await this.audit.logForUser(user, 'med_order.list', 'MedicationOrder', null, {
      residentId,
      count: orders.length,
    }, req);
    return orders;
  }

  /**
   * Today's med pass board for a resident (facility timezone handled by caller display).
   * Returns due slots with existing administration if any.
   */
  async medPassBoard(user: AuthUser, residentId: string, dateIso: string, req?: Request) {
    await this.assertResident(user.tenantId, residentId);
    const tenant = await this.prisma.db.tenant.findUniqueOrThrow({
      where: { id: user.tenantId },
    });
    const dateYmd = dateIso.slice(0, 10);
    const dayStart = facilityLocalToUtc(dateYmd, '00:00', tenant.timezone);
    const dayEnd = facilityLocalToUtc(addDaysYmd(dateYmd, 1), '00:00', tenant.timezone);

    const orders = await this.prisma.db.medicationOrder.findMany({
      where: {
        tenantId: user.tenantId,
        residentId,
        deletedAt: null,
        status: MedOrderStatus.ACTIVE,
        startDate: { lte: dayEnd },
        OR: [{ endDate: null }, { endDate: { gte: dayStart } }],
      },
    });

    const administrations = await this.prisma.db.medAdministration.findMany({
      where: {
        tenantId: user.tenantId,
        residentId,
        scheduledAt: { gte: dayStart, lt: dayEnd },
      },
    });

    const slots = orders.flatMap((order) => {
      if (order.isPrn) {
        return [
          {
            order,
            scheduledAt: null as string | null,
            isPrn: true,
            administration: null as (typeof administrations)[0] | null,
          },
        ];
      }
      return order.scheduleTimes.map((time) => {
        const scheduledAt = facilityLocalToUtc(dateYmd, time, tenant.timezone);
        const administration =
          administrations.find(
            (a) =>
              a.orderId === order.id &&
              a.scheduledAt.getTime() === scheduledAt.getTime(),
          ) ?? null;
        return {
          order,
          scheduledAt: scheduledAt.toISOString(),
          isPrn: false,
          administration,
        };
      });
    });

    await this.audit.logForUser(user, 'med_pass.board_read', 'MedAdministration', null, {
      residentId,
      date: dateYmd,
      slotCount: slots.length,
    }, req);

    return { date: dateYmd, timezone: tenant.timezone, slots };
  }

  async recordAdministration(user: AuthUser, dto: RecordMedAdminDto, req?: Request) {
    if (dto.outcome === MedOutcome.GIVEN && !dto.administeredAt) {
      throw new BadRequestException('administeredAt required when outcome is GIVEN');
    }

    const order = await this.prisma.db.medicationOrder.findFirst({
      where: {
        id: dto.orderId,
        tenantId: user.tenantId,
        deletedAt: null,
        status: MedOrderStatus.ACTIVE,
      },
    });
    if (!order) throw new NotFoundException('Medication order not found');

    if (dto.clientEventId) {
      const existing = await this.prisma.db.medAdministration.findFirst({
        where: { tenantId: user.tenantId, clientEventId: dto.clientEventId },
      });
      if (existing) return existing;
    }

    const scheduledAt = new Date(dto.scheduledAt);
    const admin = await this.prisma.db.medAdministration.create({
      data: {
        tenantId: user.tenantId,
        orderId: order.id,
        residentId: order.residentId,
        scheduledAt,
        administeredAt: dto.administeredAt ? new Date(dto.administeredAt) : new Date(),
        administeredById: user.id,
        outcome: dto.outcome,
        notes: dto.notes,
        clientEventId: dto.clientEventId,
      },
    });

    if (dto.outcome === MedOutcome.REFUSED || dto.outcome === MedOutcome.MISSED) {
      await this.prisma.db.medAlert.create({
        data: {
          tenantId: user.tenantId,
          administrationId: admin.id,
          type:
            dto.outcome === MedOutcome.REFUSED
              ? MedAlertType.REFUSED
              : MedAlertType.MISSED,
        },
      });
      await this.audit.logForUser(user, 'med_alert.create', 'MedAlert', admin.id, {
        type: dto.outcome,
      }, req);
    }

    await this.audit.logForUser(user, 'med_admin.record', 'MedAdministration', admin.id, {
      orderId: order.id,
      residentId: order.residentId,
      outcome: dto.outcome,
      scheduledAt: scheduledAt.toISOString(),
      administeredById: user.id,
    }, req);

    return admin;
  }

  /**
   * Offline sync: apply a batch of dose events with conflict-safe semantics.
   * - matching clientEventId → duplicate (ok)
   * - same order+scheduledAt already recorded with different outcome → conflict (server wins)
   * - else create
   */
  async syncBatch(user: AuthUser, events: RecordMedAdminDto[], req?: Request) {
    const results: Array<{
      clientEventId: string | null;
      status: 'created' | 'duplicate' | 'conflict' | 'error';
      administrationId?: string;
      message?: string;
    }> = [];

    for (const event of events) {
      try {
        if (event.clientEventId) {
          const byClient = await this.prisma.db.medAdministration.findFirst({
            where: { tenantId: user.tenantId, clientEventId: event.clientEventId },
          });
          if (byClient) {
            results.push({
              clientEventId: event.clientEventId,
              status: 'duplicate',
              administrationId: byClient.id,
            });
            continue;
          }
        }

        const scheduledAt = new Date(event.scheduledAt);
        const slotExisting = await this.prisma.db.medAdministration.findFirst({
          where: {
            tenantId: user.tenantId,
            orderId: event.orderId,
            scheduledAt,
          },
        });
        if (slotExisting) {
          if (slotExisting.outcome === event.outcome) {
            results.push({
              clientEventId: event.clientEventId ?? null,
              status: 'duplicate',
              administrationId: slotExisting.id,
            });
          } else {
            results.push({
              clientEventId: event.clientEventId ?? null,
              status: 'conflict',
              administrationId: slotExisting.id,
              message: `Server has ${slotExisting.outcome}; keeping server record`,
            });
          }
          continue;
        }

        const created = await this.recordAdministration(user, event, req);
        results.push({
          clientEventId: event.clientEventId ?? null,
          status: 'created',
          administrationId: created.id,
        });
      } catch (e) {
        results.push({
          clientEventId: event.clientEventId ?? null,
          status: 'error',
          message: e instanceof Error ? e.message : 'Unknown error',
        });
      }
    }

    await this.audit.logForUser(user, 'med_sync.batch', 'MedAdministration', null, {
      total: events.length,
      created: results.filter((r) => r.status === 'created').length,
      duplicate: results.filter((r) => r.status === 'duplicate').length,
      conflict: results.filter((r) => r.status === 'conflict').length,
      error: results.filter((r) => r.status === 'error').length,
    }, req);

    return { results };
  }

  async syncSnapshot(user: AuthUser, residentId: string, dateIso: string, req?: Request) {
    const board = await this.medPassBoard(user, residentId, dateIso, req);
    const orders = await this.listOrders(user, residentId, req);
    await this.audit.logForUser(user, 'med_sync.snapshot', 'MedAdministration', null, {
      residentId,
      date: dateIso,
    }, req);
    return {
      generatedAt: new Date().toISOString(),
      residentId,
      ...board,
      orders,
    };
  }

  async listOpenAlerts(user: AuthUser, req?: Request) {
    const alerts = await this.prisma.db.medAlert.findMany({
      where: { tenantId: user.tenantId, status: 'OPEN' },
      orderBy: { triggeredAt: 'desc' },
      include: {
        administration: {
          include: {
            order: true,
            resident: true,
          },
        },
      },
    });
    await this.audit.logForUser(user, 'med_alert.list', 'MedAlert', null, {
      count: alerts.length,
    }, req);
    return alerts;
  }

  async acknowledgeAlert(user: AuthUser, alertId: string, req?: Request) {
    const alert = await this.prisma.db.medAlert.findFirst({
      where: { id: alertId, tenantId: user.tenantId },
    });
    if (!alert) throw new NotFoundException('Alert not found');

    const updated = await this.prisma.db.medAlert.update({
      where: { id: alertId },
      data: {
        status: 'ACKNOWLEDGED',
        acknowledgedAt: new Date(),
        acknowledgedById: user.id,
      },
    });
    await this.audit.logForUser(user, 'med_alert.ack', 'MedAlert', alertId, undefined, req);
    return updated;
  }

  /** Marks overdue scheduled doses as MISSED and opens alerts. */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async detectMissedMedications() {
    await this.prisma.runWithBypass(async () => {
      const cutoff = new Date(Date.now() - LATE_GRACE_MINUTES * 60 * 1000);
      const tenants = await this.prisma.db.tenant.findMany({
        select: { id: true, timezone: true },
      });

      for (const tenant of tenants) {
        const dateYmd = facilityTodayYmd(tenant.timezone);
        const orders = await this.prisma.db.medicationOrder.findMany({
          where: {
            tenantId: tenant.id,
            deletedAt: null,
            status: MedOrderStatus.ACTIVE,
            isPrn: false,
          },
        });

        for (const order of orders) {
          for (const time of order.scheduleTimes) {
            const scheduledAt = facilityLocalToUtc(dateYmd, time, tenant.timezone);
            if (scheduledAt > cutoff) continue;
            if (scheduledAt < order.startDate) continue;
            if (order.endDate && scheduledAt > order.endDate) continue;

            const existing = await this.prisma.db.medAdministration.findFirst({
              where: {
                tenantId: tenant.id,
                orderId: order.id,
                scheduledAt,
              },
            });
            if (existing) continue;

            const missed = await this.prisma.db.medAdministration.create({
              data: {
                tenantId: tenant.id,
                orderId: order.id,
                residentId: order.residentId,
                scheduledAt,
                outcome: MedOutcome.MISSED,
                notes: 'Auto-flagged missed dose',
              },
            });
            await this.prisma.db.medAlert.create({
              data: {
                tenantId: tenant.id,
                administrationId: missed.id,
                type: MedAlertType.MISSED,
              },
            });
            await this.audit.log({
              tenantId: tenant.id,
              actorId: null,
              action: 'med_admin.auto_missed',
              resourceType: 'MedAdministration',
              resourceId: missed.id,
              metadata: { orderId: order.id, scheduledAt: scheduledAt.toISOString() },
            });
          }
        }
      }
    });
  }

  private async assertResident(tenantId: string, residentId: string) {
    const r = await this.prisma.db.resident.findFirst({
      where: { id: residentId, tenantId, deletedAt: null },
    });
    if (!r) throw new NotFoundException('Resident not found');
    return r;
  }
}
