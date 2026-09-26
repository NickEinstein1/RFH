import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MedAlertType, MedOrderStatus, MedOutcome, type MedicationOrder } from '@prisma/client';
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

import { SafetyChallengeService } from '../common/security/safety-challenge.service';

const LATE_GRACE_MINUTES = 60;

export type SafetyWarning = {
  code: string;
  severity: 'warn' | 'critical';
  message: string;
};

@Injectable()
export class EmarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly safetyChallenge: SafetyChallengeService,
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
        brand: dto.brand,
        rxNumber: dto.rxNumber,
        imprint: dto.imprint,
        categoryLabel: dto.categoryLabel,
        prescriber: dto.prescriber,
        highAlert: dto.highAlert ?? false,
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

    this.audit.logForUserDeferred(user, 'med_pass.board_read', 'MedAdministration', null, {
      residentId,
      date: dateYmd,
      slotCount: slots.length,
    }, req);

    return { date: dateYmd, timezone: tenant.timezone, slots };
  }

  /**
   * Facility-wide due meds for Today (one query set — avoids N+1 med-pass calls).
   */
  async dueTodayBoard(user: AuthUser, dateIso: string, limit = 12) {
    const tenant = await this.prisma.db.tenant.findUniqueOrThrow({
      where: { id: user.tenantId },
    });
    const dateYmd = dateIso.slice(0, 10);
    const dayStart = facilityLocalToUtc(dateYmd, '00:00', tenant.timezone);
    const dayEnd = facilityLocalToUtc(addDaysYmd(dateYmd, 1), '00:00', tenant.timezone);

    const [residents, orders, administrations] = await Promise.all([
      this.prisma.db.resident.findMany({
        where: { tenantId: user.tenantId, deletedAt: null, status: 'ACTIVE' },
        select: { id: true, firstName: true, lastName: true, room: true },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      }),
      this.prisma.db.medicationOrder.findMany({
        where: {
          tenantId: user.tenantId,
          deletedAt: null,
          status: MedOrderStatus.ACTIVE,
          isPrn: false,
          startDate: { lte: dayEnd },
          OR: [{ endDate: null }, { endDate: { gte: dayStart } }],
        },
        select: {
          id: true,
          residentId: true,
          drugName: true,
          scheduleTimes: true,
        },
      }),
      this.prisma.db.medAdministration.findMany({
        where: {
          tenantId: user.tenantId,
          scheduledAt: { gte: dayStart, lt: dayEnd },
        },
        select: { orderId: true, scheduledAt: true, outcome: true },
      }),
    ]);

    const residentById = new Map(residents.map((r) => [r.id, r]));
    const givenKeys = new Set(
      administrations
        .filter((a) => a.outcome)
        .map((a) => `${a.orderId}|${a.scheduledAt.getTime()}`),
    );

    const due: Array<{
      residentId: string;
      residentName: string;
      room: string | null;
      drugName: string;
      scheduledAt: string;
    }> = [];

    for (const order of orders) {
      const resident = residentById.get(order.residentId);
      if (!resident) continue;
      for (const time of order.scheduleTimes) {
        const scheduledAt = facilityLocalToUtc(dateYmd, time, tenant.timezone);
        const key = `${order.id}|${scheduledAt.getTime()}`;
        if (givenKeys.has(key)) continue;
        due.push({
          residentId: resident.id,
          residentName: `${resident.lastName}, ${resident.firstName}`,
          room: resident.room,
          drugName: order.drugName,
          scheduledAt: scheduledAt.toISOString(),
        });
      }
    }

    due.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
    return {
      date: dateYmd,
      timezone: tenant.timezone,
      slots: due.slice(0, Math.max(1, Math.min(limit, 40))),
    };
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

    if (dto.outcome === MedOutcome.GIVEN) {
      const warnings = await this.evaluateSafetyWarnings(user, order, dto);
      if (warnings.length) {
        const tokenOk = this.safetyChallenge.verify(
          dto.safetyChallengeToken,
          user,
          order.id,
          dto.scheduledAt,
          warnings,
        );
        if (!tokenOk) {
          throw new ConflictException({
            code: 'SAFETY_WARNINGS',
            message: 'Safety warnings require acknowledgment',
            warnings,
            safetyChallengeToken: this.safetyChallenge.issue(
              user,
              order.id,
              dto.scheduledAt,
              warnings,
            ),
          });
        }
        await this.audit.logForUser(
          user,
          'med_admin.safety_override',
          'MedicationOrder',
          order.id,
          {
            residentId: order.residentId,
            warnings,
            scheduledAt: dto.scheduledAt,
          },
          req,
        );
      }
    }

    const prnData = this.normalizePrnFields(order.isPrn, dto);

    if (dto.clientEventId) {
      const existing = await this.prisma.db.medAdministration.findFirst({
        where: { tenantId: user.tenantId, clientEventId: dto.clientEventId },
      });
      if (existing) return existing;
    }

    const scheduledAt = new Date(dto.scheduledAt);
    const slotExisting = await this.prisma.db.medAdministration.findFirst({
      where: {
        tenantId: user.tenantId,
        orderId: order.id,
        scheduledAt,
      },
    });

    let admin;
    if (slotExisting) {
      admin = await this.prisma.db.medAdministration.update({
        where: { id: slotExisting.id },
        data: {
          administeredAt: dto.administeredAt ? new Date(dto.administeredAt) : new Date(),
          administeredById: user.id,
          outcome: dto.outcome,
          notes: dto.notes ?? slotExisting.notes,
          ...prnData,
        },
      });
      await this.audit.logForUser(user, 'med_admin.update', 'MedAdministration', admin.id, {
        orderId: order.id,
        residentId: order.residentId,
        outcome: dto.outcome,
        previousOutcome: slotExisting.outcome,
        scheduledAt: scheduledAt.toISOString(),
        marMark: marMarkForOutcome(dto.outcome),
        prn: order.isPrn,
      }, req);
      return admin;
    }

    admin = await this.prisma.db.medAdministration.create({
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
        ...prnData,
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
      marMark: marMarkForOutcome(dto.outcome),
      prn: order.isPrn,
    }, req);

    return admin;
  }

  /**
   * Soft safety checks — never hard-block care; require explicit acknowledge.
   */
  async evaluateSafetyWarnings(
    user: AuthUser,
    order: MedicationOrder,
    dto: RecordMedAdminDto,
  ): Promise<SafetyWarning[]> {
    const warnings: SafetyWarning[] = [];
    const resident = await this.prisma.db.resident.findFirst({
      where: { id: order.residentId, tenantId: user.tenantId, deletedAt: null },
    });
    if (!resident) return warnings;

    const drugLower = order.drugName.toLowerCase();
    for (const allergy of resident.allergies || []) {
      const a = allergy.trim().toLowerCase();
      if (!a) continue;
      if (drugLower.includes(a) || a.includes(drugLower.split(/\s+/)[0] || '')) {
        warnings.push({
          code: 'ALLERGY',
          severity: 'critical',
          message: `Possible allergy match: resident listed “${allergy}” and order is ${order.drugName}.`,
        });
      }
    }

    const tenant = await this.prisma.db.tenant.findUniqueOrThrow({
      where: { id: user.tenantId },
    });
    const today = facilityTodayYmd(tenant.timezone);
    const dayStart = facilityLocalToUtc(today, '00:00', tenant.timezone);
    const dayEnd = facilityLocalToUtc(addDaysYmd(today, 1), '00:00', tenant.timezone);

    const givenToday = await this.prisma.db.medAdministration.findMany({
      where: {
        tenantId: user.tenantId,
        orderId: order.id,
        outcome: MedOutcome.GIVEN,
        scheduledAt: { gte: dayStart, lt: dayEnd },
      },
    });

    const scheduledAt = new Date(dto.scheduledAt);
    const alreadyThisSlot = givenToday.some(
      (a) => a.scheduledAt.getTime() === scheduledAt.getTime(),
    );
    if (alreadyThisSlot) {
      warnings.push({
        code: 'DUPLICATE_SLOT',
        severity: 'critical',
        message: `${order.drugName} already recorded as GIVEN for this scheduled time.`,
      });
    } else if (!order.isPrn && givenToday.length >= Math.max(1, order.scheduleTimes.length)) {
      warnings.push({
        code: 'DUPLICATE_DOSE',
        severity: 'warn',
        message: `${order.drugName} already given ${givenToday.length}× today (schedule has ${order.scheduleTimes.length} slot(s)).`,
      });
    } else if (order.isPrn && givenToday.length >= 3) {
      warnings.push({
        code: 'PRN_FREQUENCY',
        severity: 'warn',
        message: `${order.drugName} already given ${givenToday.length}× today as PRN.`,
      });
    }

    if (dto.administeredAt && !order.isPrn) {
      const adminAt = new Date(dto.administeredAt).getTime();
      const schedAt = scheduledAt.getTime();
      const deltaMin = Math.abs(adminAt - schedAt) / 60_000;
      if (deltaMin > 120) {
        warnings.push({
          code: 'UNUSUAL_TIME',
          severity: 'warn',
          message: `Administering ${Math.round(deltaMin)} min from scheduled time for ${order.drugName}.`,
        });
      }
    }

    if (order.highAlert) {
      warnings.push({
        code: 'HIGH_ALERT',
        severity: 'warn',
        message: `${order.drugName} is marked high-alert — verify drug, dose, and resident.`,
      });
    }

    const controlled =
      /controlled|c-?ii|c-?iii|c-?iv|c-?v|narcotic|opioid/i.test(
        order.categoryLabel || '',
      ) || /\b(morphine|oxycodone|fentanyl|hydrocodone|lorazepam|alprazolam)\b/i.test(order.drugName);
    if (controlled) {
      const expected = order.isPrn ? null : order.scheduleTimes.length;
      const given = givenToday.length + (alreadyThisSlot ? 0 : 1);
      if (expected != null && given > expected) {
        warnings.push({
          code: 'CONTROLLED_COUNT',
          severity: 'critical',
          message: `Controlled/high-risk ${order.drugName}: giving would exceed today’s scheduled count (${expected}).`,
        });
      } else {
        warnings.push({
          code: 'CONTROLLED_CHECK',
          severity: 'warn',
          message: `Verify controlled count for ${order.drugName} before giving.`,
        });
      }
    }

    return warnings;
  }

  /** Back-of-MAR PRN fields — required when giving a PRN medication */
  private normalizePrnFields(isPrn: boolean, dto: RecordMedAdminDto) {
    if (!isPrn || dto.outcome !== MedOutcome.GIVEN) {
      return {
        prnRouteSite: dto.prnRouteSite ?? null,
        prnReason: dto.prnReason ?? null,
        prnBmi: dto.prnBmi ?? null,
        prnBmiOther: dto.prnBmiOther ?? null,
        prnResult: dto.prnResult ?? null,
        prnMse: dto.prnMse ?? null,
        prnMseOther: dto.prnMseOther ?? null,
        prnPainScore: dto.prnPainScore ?? null,
      };
    }

    if (!dto.prnRouteSite?.trim()) {
      throw new BadRequestException('PRN ROUTE/SITE is required (back of MAR)');
    }
    if (!dto.prnReason?.trim()) {
      throw new BadRequestException('PRN REASON is required (back of MAR)');
    }
    if (!dto.prnResult?.trim()) {
      throw new BadRequestException('PRN RESULT/OUTCOMES is required (back of MAR)');
    }
    if ((dto.prnBmi === 'G' || dto.prnBmi === 'H') && !dto.prnBmiOther?.trim()) {
      throw new BadRequestException('BMI other text is required when BMI is G or H');
    }
    if (dto.prnMse === 'L' && !dto.prnMseOther?.trim()) {
      throw new BadRequestException('MSE other text is required when MSE is L');
    }

    return {
      prnRouteSite: dto.prnRouteSite.trim(),
      prnReason: dto.prnReason.trim(),
      prnBmi: dto.prnBmi?.trim() || null,
      prnBmiOther: dto.prnBmiOther?.trim() || null,
      prnResult: dto.prnResult.trim(),
      prnMse: dto.prnMse?.trim() || null,
      prnMseOther: dto.prnMseOther?.trim() || null,
      prnPainScore: dto.prnPainScore ?? null,
    };
  }

  /**
   * Monthly MAR sheet for one resident — PDF-style day grid with marks:
   * ✓ given · X refused/held · - blank/missed
   */
  async monthlyMarSheet(
    user: AuthUser,
    residentId: string,
    monthYm: string,
    req?: Request,
  ) {
    await this.assertResident(user.tenantId, residentId);
    const tenant = await this.prisma.db.tenant.findUniqueOrThrow({
      where: { id: user.tenantId },
    });
    const [year, month] = monthYm.split('-').map(Number);
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const monthStart = facilityLocalToUtc(
      `${monthYm}-01`,
      '00:00',
      tenant.timezone,
    );
    const nextMonth = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`;
    const monthEnd = facilityLocalToUtc(`${nextMonth}-01`, '00:00', tenant.timezone);

    const resident = await this.prisma.db.resident.findFirstOrThrow({
      where: { id: residentId, tenantId: user.tenantId },
    });

    const orders = await this.prisma.db.medicationOrder.findMany({
      where: {
        tenantId: user.tenantId,
        residentId,
        deletedAt: null,
        status: MedOrderStatus.ACTIVE,
        startDate: { lte: monthEnd },
        OR: [{ endDate: null }, { endDate: { gte: monthStart } }],
      },
      orderBy: [{ isPrn: 'asc' }, { drugName: 'asc' }],
    });

    const administrations = await this.prisma.db.medAdministration.findMany({
      where: {
        tenantId: user.tenantId,
        residentId,
        scheduledAt: { gte: monthStart, lt: monthEnd },
      },
      include: {
        administeredBy: {
          select: { id: true, firstName: true, lastName: true },
        },
        order: {
          select: {
            id: true,
            drugName: true,
            dose: true,
            route: true,
            isPrn: true,
          },
        },
      },
      orderBy: { scheduledAt: 'asc' },
    });

    const dayNumbers = Array.from({ length: daysInMonth }, (_, i) => i + 1);

    const rows = orders.map((order) => {
      const times = order.isPrn
        ? ['PRN']
        : order.scheduleTimes.length
          ? order.scheduleTimes
          : ['08:00'];

      return {
        order: {
          id: order.id,
          drugName: order.drugName,
          dose: order.dose,
          route: order.route,
          frequency: order.frequency,
          instructions: order.instructions,
          brand: order.brand,
          rxNumber: order.rxNumber,
          imprint: order.imprint,
          categoryLabel: order.categoryLabel,
          prescriber: order.prescriber,
          highAlert: order.highAlert,
          isPrn: order.isPrn,
          startDate: order.startDate.toISOString().slice(0, 10),
        },
        timeRows: times.map((time) => {
          const cells = dayNumbers.map((day) => {
            if (order.isPrn || time === 'PRN') {
              const dayStart = facilityLocalToUtc(
                `${monthYm}-${String(day).padStart(2, '0')}`,
                '00:00',
                tenant.timezone,
              );
              const dayEnd = facilityLocalToUtc(
                `${monthYm}-${String(day).padStart(2, '0')}`,
                '23:59',
                tenant.timezone,
              );
              const hits = administrations.filter(
                (a) =>
                  a.orderId === order.id &&
                  a.scheduledAt >= dayStart &&
                  a.scheduledAt <= dayEnd,
              );
              const admin = hits[hits.length - 1] ?? null;
              return {
                day,
                scheduledAt: dayStart.toISOString(),
                mark: admin ? marMarkForOutcome(admin.outcome) : '-',
                outcome: admin?.outcome ?? null,
                administrationId: admin?.id ?? null,
                initials: admin?.administeredBy
                  ? `${admin.administeredBy.firstName[0] ?? ''}${admin.administeredBy.lastName[0] ?? ''}`.toUpperCase()
                  : null,
              };
            }

            const scheduledAt = facilityLocalToUtc(
              `${monthYm}-${String(day).padStart(2, '0')}`,
              time,
              tenant.timezone,
            );
            const admin =
              administrations.find(
                (a) =>
                  a.orderId === order.id &&
                  a.scheduledAt.getTime() === scheduledAt.getTime(),
              ) ?? null;
            return {
              day,
              scheduledAt: scheduledAt.toISOString(),
              mark: admin ? marMarkForOutcome(admin.outcome) : '-',
              outcome: admin?.outcome ?? null,
              administrationId: admin?.id ?? null,
              initials: admin?.administeredBy
                ? `${admin.administeredBy.firstName[0] ?? ''}${admin.administeredBy.lastName[0] ?? ''}`.toUpperCase()
                : null,
            };
          });
          return { time, cells };
        }),
      };
    });

    await this.audit.logForUser(user, 'mar_sheet.read', 'MedAdministration', null, {
      residentId,
      month: monthYm,
      orderCount: orders.length,
    }, req);

    const prnEntries = administrations
      .filter((a) => a.order.isPrn && a.outcome === MedOutcome.GIVEN)
      .map((a) => {
        const when = a.administeredAt ?? a.scheduledAt;
        const initials = a.administeredBy
          ? `${a.administeredBy.firstName[0] ?? ''}${a.administeredBy.lastName[0] ?? ''}`.toUpperCase()
          : '';
        const signature = a.administeredBy
          ? `${a.administeredBy.firstName} ${a.administeredBy.lastName}`
          : '';
        return {
          id: a.id,
          date: when.toISOString().slice(0, 10),
          time: when.toISOString().slice(11, 16),
          medication: a.order.drugName,
          dose: a.order.dose,
          routeSite: a.prnRouteSite || a.order.route,
          reason: a.prnReason || '',
          bmi: a.prnBmi || '',
          bmiOther: a.prnBmiOther || '',
          result: a.prnResult || '',
          mse: a.prnMse || '',
          mseOther: a.prnMseOther || '',
          painScore: a.prnPainScore,
          initials,
          signature,
        };
      });

    const staffMap = new Map<string, string>();
    for (const a of administrations) {
      if (!a.administeredBy) continue;
      const initials =
        `${a.administeredBy.firstName[0] ?? ''}${a.administeredBy.lastName[0] ?? ''}`.toUpperCase();
      if (!initials) continue;
      staffMap.set(initials, `${a.administeredBy.firstName} ${a.administeredBy.lastName}`);
    }

    return {
      facilityName: tenant.name,
      timezone: tenant.timezone,
      pharmacyName: tenant.pharmacyName,
      pharmacyPhone: tenant.pharmacyPhone,
      pharmacyFax: tenant.pharmacyFax,
      month: monthYm,
      daysInMonth,
      dayNumbers,
      legend: {
        given: '✓',
        notGiven: 'X',
        blankOrMissed: '-',
        note: 'Record = ✓ given · Reject = X not given · blank/- = not given at all',
      },
      resident: {
        id: resident.id,
        firstName: resident.firstName,
        lastName: resident.lastName,
        dateOfBirth: resident.dateOfBirth.toISOString().slice(0, 10),
        mrn: resident.mrn,
        allergies: resident.allergies,
        room: resident.room,
      },
      rows,
      backPage: {
        title: 'PRN / As-Needed Medication Log (Back of MAR)',
        prnEntries,
        staffSignatureKey: [...staffMap.entries()].map(([initials, signature]) => ({
          initials,
          signature,
        })),
      },
    };
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
    this.audit.logForUserDeferred(user, 'med_alert.list', 'MedAlert', null, {
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

/** MAR sheet marks matching facility PDF recording convention requested:
 * ✓ given · X not given (refused/held) · - not given at all (blank/missed)
 */
function marMarkForOutcome(outcome: MedOutcome): '✓' | 'X' | '-' {
  if (outcome === MedOutcome.GIVEN) return '✓';
  if (outcome === MedOutcome.REFUSED || outcome === MedOutcome.HELD) return 'X';
  return '-';
}
