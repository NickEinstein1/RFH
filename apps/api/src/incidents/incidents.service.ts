import { Injectable, NotFoundException } from '@nestjs/common';
import { IncidentSeverity, IncidentStatus, Prisma, Role } from '@prisma/client';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PhiCryptoService } from '../common/crypto/phi-crypto.service';
import { MailService } from '../mail/mail.service';
import { FamilyAccessService } from '../tenancy/family-access.service';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { CreateIncidentDto, UpdateIncidentDto } from './dto/incident.dto';

@Injectable()
export class IncidentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly phi: PhiCryptoService,
    private readonly mail: MailService,
    private readonly familyAccess: FamilyAccessService,
  ) {}

  private reveal<T extends { narrative: string }>(row: T): T {
    return { ...row, narrative: this.phi.decrypt(row.narrative) ?? '' };
  }

  /** Family viewers get metadata only — no narrative / form PHI. */
  private familySafe<T extends { narrative: string }>(row: T): T {
    return {
      ...row,
      narrative: '' as T['narrative'],
      formData: null,
      immediateActions: null,
      familyRedacted: true,
    } as T & { familyRedacted: true };
  }

  private present<T extends { narrative: string }>(user: AuthUser, row: T): T {
    if (user.role === Role.FAMILY_VIEWER) return this.familySafe(row);
    return this.reveal(row);
  }

  async create(user: AuthUser, dto: CreateIncidentDto, req?: Request) {
    const resident = await this.prisma.db.resident.findFirst({
      where: { id: dto.residentId, tenantId: user.tenantId, deletedAt: null },
    });
    if (!resident) throw new NotFoundException('Resident not found');

    if (dto.clientEventId) {
      const existing = await this.prisma.db.incident.findFirst({
        where: { tenantId: user.tenantId, clientEventId: dto.clientEventId },
        include: {
          reportedBy: { select: { id: true, firstName: true, lastName: true, role: true } },
          resident: { select: { id: true, firstName: true, lastName: true, room: true } },
        },
      });
      if (existing) return this.present(user, existing);
    }

    const incident = await this.prisma.db.incident.create({
      data: {
        tenantId: user.tenantId,
        residentId: dto.residentId,
        reportedById: user.id,
        occurredAt: new Date(dto.occurredAt),
        category: dto.category,
        severity: dto.severity,
        title: dto.title,
        narrative: this.phi.encrypt(dto.narrative)!,
        immediateActions: dto.immediateActions,
        formData: dto.formData
          ? (dto.formData as Prisma.InputJsonValue)
          : undefined,
        clientEventId: dto.clientEventId,
      },
      include: {
        reportedBy: { select: { id: true, firstName: true, lastName: true, role: true } },
        resident: { select: { id: true, firstName: true, lastName: true, room: true } },
      },
    });

    await this.audit.logForUser(user, 'incident.create', 'Incident', incident.id, {
      residentId: dto.residentId,
      category: dto.category,
      severity: incident.severity,
    }, req);

    if (
      incident.severity === IncidentSeverity.HIGH ||
      incident.severity === IncidentSeverity.CRITICAL
    ) {
      const nurses = await this.prisma.db.user.findMany({
        where: {
          tenantId: user.tenantId,
          deletedAt: null,
          isActive: true,
          role: { in: [Role.OWNER, Role.ADMIN, Role.NURSE] },
        },
        select: { email: true },
      });
      const tenant = await this.prisma.db.tenant.findUniqueOrThrow({
        where: { id: user.tenantId },
      });
      await this.mail.sendHighSeverityAlert({
        to: nurses.map((n) => n.email),
        facilityName: tenant.name,
        summary: `${incident.severity} ${incident.category} report opened: ${incident.title}`,
        actor: user,
        tenantId: user.tenantId,
      });
    }

    return this.present(user, incident);
  }

  async list(
    user: AuthUser,
    opts: { residentId?: string; status?: IncidentStatus } = {},
    req?: Request,
  ) {
    const linked = await this.familyAccess.linkedResidentIds(user);
    if (linked !== null) {
      if (opts.residentId && !linked.includes(opts.residentId)) {
        return [];
      }
    }

    const rows = await this.prisma.db.incident.findMany({
      where: {
        tenantId: user.tenantId,
        deletedAt: null,
        ...(opts.residentId
          ? { residentId: opts.residentId }
          : linked
            ? { residentId: { in: linked } }
            : {}),
        ...(opts.status ? { status: opts.status } : {}),
      },
      orderBy: { occurredAt: 'desc' },
      ...(linked ? { take: 50 } : {}),
      include: {
        reportedBy: { select: { id: true, firstName: true, lastName: true, role: true } },
        resident: { select: { id: true, firstName: true, lastName: true, room: true } },
      },
    });
    this.audit.logForUserDeferred(user, 'incident.list', 'Incident', null, {
      count: rows.length,
      residentId: opts.residentId ?? null,
      familyScoped: linked !== null,
    }, req);
    return rows.map((r) => this.present(user, r));
  }

  async findOne(user: AuthUser, id: string, req?: Request) {
    const row = await this.prisma.db.incident.findFirst({
      where: { id, tenantId: user.tenantId, deletedAt: null },
      include: {
        reportedBy: { select: { id: true, firstName: true, lastName: true, role: true } },
        resident: { select: { id: true, firstName: true, lastName: true, room: true } },
      },
    });
    if (!row) throw new NotFoundException('Incident not found');
    await this.familyAccess.assertCanAccessResident(user, row.residentId);
    await this.audit.logForUser(user, 'incident.read', 'Incident', id, {
      familyRedacted: user.role === Role.FAMILY_VIEWER,
    }, req);
    return this.present(user, row);
  }

  async update(user: AuthUser, id: string, dto: UpdateIncidentDto, req?: Request) {
    await this.findOne(user, id);
    const row = await this.prisma.db.incident.update({
      where: { id },
      data: {
        category: dto.category,
        severity: dto.severity,
        status: dto.status,
        title: dto.title,
        immediateActions: dto.immediateActions,
        formData:
          dto.formData === undefined
            ? undefined
            : (dto.formData as Prisma.InputJsonValue),
        occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : undefined,
        narrative:
          dto.narrative !== undefined ? this.phi.encrypt(dto.narrative)! : undefined,
      },
      include: {
        reportedBy: { select: { id: true, firstName: true, lastName: true, role: true } },
        resident: { select: { id: true, firstName: true, lastName: true, room: true } },
      },
    });
    await this.audit.logForUser(user, 'incident.update', 'Incident', id, {
      fields: Object.keys(dto),
    }, req);
    return this.present(user, row);
  }

  async close(user: AuthUser, id: string, req?: Request) {
    await this.findOne(user, id);
    const row = await this.prisma.db.incident.update({
      where: { id },
      data: { status: IncidentStatus.CLOSED, closedAt: new Date() },
      include: {
        reportedBy: { select: { id: true, firstName: true, lastName: true, role: true } },
        resident: { select: { id: true, firstName: true, lastName: true, room: true } },
      },
    });
    await this.audit.logForUser(user, 'incident.close', 'Incident', id, undefined, req);
    return this.present(user, row);
  }

  async softDelete(user: AuthUser, id: string, req?: Request) {
    await this.findOne(user, id);
    const row = await this.prisma.db.incident.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await this.audit.logForUser(user, 'incident.soft_delete', 'Incident', id, undefined, req);
    return this.present(user, row);
  }
}
