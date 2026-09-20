import { Injectable, NotFoundException } from '@nestjs/common';
import { CarePlanStatus, Prisma } from '@prisma/client';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { FamilyAccessService } from '../tenancy/family-access.service';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import {
  CreateCarePlanDto,
  CreateCareTaskDto,
  RecordTaskCompletionDto,
  UpdateCarePlanDto,
  UpdateCareTaskDto,
} from './dto/care.dto';
import {
  addDaysYmd,
  facilityLocalToUtc,
  facilityTodayYmd,
} from '../common/time/facility-time';

@Injectable()
export class CareService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly familyAccess: FamilyAccessService,
  ) {}

  async createPlan(user: AuthUser, dto: CreateCarePlanDto, req?: Request) {
    await this.familyAccess.assertCanAccessResident(user, dto.residentId);
    const resident = await this.prisma.db.resident.findFirst({
      where: { id: dto.residentId, tenantId: user.tenantId, deletedAt: null },
    });
    if (!resident) throw new NotFoundException('Resident not found');

    const plan = await this.prisma.db.carePlan.create({
      data: {
        tenantId: user.tenantId,
        residentId: dto.residentId,
        title: dto.title,
        goals: dto.goals,
        effectiveFrom: new Date(dto.effectiveFrom),
        effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
        formData: dto.formData
          ? (dto.formData as Prisma.InputJsonValue)
          : undefined,
      },
    });
    await this.audit.logForUser(user, 'care_plan.create', 'CarePlan', plan.id, {
      residentId: dto.residentId,
      title: plan.title,
    }, req);
    return plan;
  }

  async listPlans(user: AuthUser, residentId: string, req?: Request) {
    await this.familyAccess.assertCanAccessResident(user, residentId);
    const plans = await this.prisma.db.carePlan.findMany({
      where: {
        tenantId: user.tenantId,
        residentId,
        deletedAt: null,
      },
      orderBy: { effectiveFrom: 'desc' },
      include: {
        careTasks: {
          where: { deletedAt: null, isActive: true },
          orderBy: { title: 'asc' },
        },
      },
    });
    await this.audit.logForUser(user, 'care_plan.list', 'CarePlan', null, {
      residentId,
      count: plans.length,
    }, req);
    return plans;
  }

  async updatePlan(user: AuthUser, id: string, dto: UpdateCarePlanDto, req?: Request) {
    const existing = await this.prisma.db.carePlan.findFirst({
      where: { id, tenantId: user.tenantId, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Care plan not found');
    await this.familyAccess.assertCanAccessResident(user, existing.residentId);

    const plan = await this.prisma.db.carePlan.update({
      where: { id },
      data: {
        title: dto.title,
        goals: dto.goals,
        status: dto.status,
        formData:
          dto.formData === undefined
            ? undefined
            : (dto.formData as Prisma.InputJsonValue),
        effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : undefined,
        effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : undefined,
      },
      include: {
        careTasks: {
          where: { deletedAt: null },
          orderBy: { title: 'asc' },
        },
      },
    });
    await this.audit.logForUser(user, 'care_plan.update', 'CarePlan', id, {
      fields: Object.keys(dto),
    }, req);
    return plan;
  }

  async findPlan(user: AuthUser, id: string, req?: Request) {
    const plan = await this.prisma.db.carePlan.findFirst({
      where: { id, tenantId: user.tenantId, deletedAt: null },
      include: {
        careTasks: {
          where: { deletedAt: null },
          orderBy: { title: 'asc' },
        },
        resident: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            dateOfBirth: true,
            room: true,
            allergies: true,
            admitDate: true,
          },
        },
      },
    });
    if (!plan) throw new NotFoundException('Care plan not found');
    await this.familyAccess.assertCanAccessResident(user, plan.residentId);
    await this.audit.logForUser(user, 'care_plan.read', 'CarePlan', id, undefined, req);
    return plan;
  }

  async softDeletePlan(user: AuthUser, id: string, req?: Request) {
    const existing = await this.prisma.db.carePlan.findFirst({
      where: { id, tenantId: user.tenantId, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Care plan not found');
    await this.familyAccess.assertCanAccessResident(user, existing.residentId);
    const plan = await this.prisma.db.carePlan.update({
      where: { id },
      data: { deletedAt: new Date(), status: CarePlanStatus.ARCHIVED },
    });
    await this.audit.logForUser(user, 'care_plan.soft_delete', 'CarePlan', id, undefined, req);
    return plan;
  }

  async createTask(user: AuthUser, dto: CreateCareTaskDto, req?: Request) {
    const plan = await this.prisma.db.carePlan.findFirst({
      where: {
        id: dto.carePlanId,
        tenantId: user.tenantId,
        deletedAt: null,
        status: CarePlanStatus.ACTIVE,
      },
    });
    if (!plan) throw new NotFoundException('Care plan not found');

    const task = await this.prisma.db.careTask.create({
      data: {
        tenantId: user.tenantId,
        carePlanId: plan.id,
        residentId: plan.residentId,
        category: dto.category,
        title: dto.title,
        shift: dto.shift,
        scheduleTimes: dto.scheduleTimes ?? [],
        instructions: dto.instructions,
      },
    });
    await this.audit.logForUser(user, 'care_task.create', 'CareTask', task.id, {
      carePlanId: plan.id,
      title: task.title,
    }, req);
    return task;
  }

  async updateTask(user: AuthUser, id: string, dto: UpdateCareTaskDto, req?: Request) {
    const existing = await this.prisma.db.careTask.findFirst({
      where: { id, tenantId: user.tenantId, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Care task not found');
    await this.familyAccess.assertCanAccessResident(user, existing.residentId);
    const task = await this.prisma.db.careTask.update({
      where: { id },
      data: {
        category: dto.category,
        title: dto.title,
        shift: dto.shift,
        scheduleTimes: dto.scheduleTimes,
        instructions: dto.instructions,
        isActive: dto.isActive,
      },
    });
    await this.audit.logForUser(user, 'care_task.update', 'CareTask', id, {
      fields: Object.keys(dto),
    }, req);
    return task;
  }

  async softDeleteTask(user: AuthUser, id: string, req?: Request) {
    const existing = await this.prisma.db.careTask.findFirst({
      where: { id, tenantId: user.tenantId, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Care task not found');
    await this.familyAccess.assertCanAccessResident(user, existing.residentId);
    const task = await this.prisma.db.careTask.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
    await this.audit.logForUser(user, 'care_task.soft_delete', 'CareTask', id, undefined, req);
    return task;
  }

  async taskBoard(user: AuthUser, residentId: string, dateIso: string, req?: Request) {
    await this.familyAccess.assertCanAccessResident(user, residentId);
    const tenant = await this.prisma.db.tenant.findUniqueOrThrow({
      where: { id: user.tenantId },
    });
    const dateYmd = dateIso.slice(0, 10);
    const dayStart = facilityLocalToUtc(dateYmd, '00:00', tenant.timezone);
    const dayEnd = facilityLocalToUtc(addDaysYmd(dateYmd, 1), '00:00', tenant.timezone);

    const tasks = await this.prisma.db.careTask.findMany({
      where: {
        tenantId: user.tenantId,
        residentId,
        deletedAt: null,
        isActive: true,
        carePlan: { status: CarePlanStatus.ACTIVE, deletedAt: null },
      },
    });

    const completions = await this.prisma.db.taskCompletion.findMany({
      where: {
        tenantId: user.tenantId,
        residentId,
        scheduledAt: { gte: dayStart, lt: dayEnd },
      },
    });

    const slots = tasks.flatMap((task) => {
      const times = task.scheduleTimes.length ? task.scheduleTimes : ['08:00'];
      return times.map((time) => {
        const scheduledAt = facilityLocalToUtc(dateYmd, time, tenant.timezone);
        const completion =
          completions.find(
            (c) =>
              c.careTaskId === task.id &&
              c.scheduledAt.getTime() === scheduledAt.getTime(),
          ) ?? null;
        return { task, scheduledAt: scheduledAt.toISOString(), completion };
      });
    });

    await this.audit.logForUser(user, 'task_board.read', 'TaskCompletion', null, {
      residentId,
      date: dateYmd,
      slotCount: slots.length,
    }, req);

    return { date: dateYmd, timezone: tenant.timezone, slots };
  }

  async recordCompletion(user: AuthUser, dto: RecordTaskCompletionDto, req?: Request) {
    const task = await this.prisma.db.careTask.findFirst({
      where: {
        id: dto.careTaskId,
        tenantId: user.tenantId,
        deletedAt: null,
        isActive: true,
      },
    });
    if (!task) throw new NotFoundException('Care task not found');

    if (dto.clientEventId) {
      const existing = await this.prisma.db.taskCompletion.findFirst({
        where: { tenantId: user.tenantId, clientEventId: dto.clientEventId },
      });
      if (existing) return existing;
    }

    const row = await this.prisma.db.taskCompletion.create({
      data: {
        tenantId: user.tenantId,
        careTaskId: task.id,
        residentId: task.residentId,
        scheduledAt: new Date(dto.scheduledAt),
        completedAt: dto.completedAt ? new Date(dto.completedAt) : new Date(),
        completedById: user.id,
        outcome: dto.outcome,
        notes: dto.notes,
        clientEventId: dto.clientEventId,
      },
    });

    await this.audit.logForUser(user, 'task_completion.record', 'TaskCompletion', row.id, {
      careTaskId: task.id,
      residentId: task.residentId,
      outcome: dto.outcome,
    }, req);
    return row;
  }

  async todayFacilityDate(user: AuthUser) {
    const tenant = await this.prisma.db.tenant.findUniqueOrThrow({
      where: { id: user.tenantId },
    });
    return facilityTodayYmd(tenant.timezone);
  }
}
