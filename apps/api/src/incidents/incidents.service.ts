import { Injectable, NotFoundException } from '@nestjs/common';
import { IncidentStatus } from '@prisma/client';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PhiCryptoService } from '../common/crypto/phi-crypto.service';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { CreateIncidentDto, UpdateIncidentDto } from './dto/incident.dto';

@Injectable()
export class IncidentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly phi: PhiCryptoService,
  ) {}

  private reveal<T extends { narrative: string }>(row: T): T {
    return { ...row, narrative: this.phi.decrypt(row.narrative) ?? '' };
  }

  async create(user: AuthUser, dto: CreateIncidentDto, req?: Request) {
    const resident = await this.prisma.db.resident.findFirst({
      where: { id: dto.residentId, tenantId: user.tenantId, deletedAt: null },
    });
    if (!resident) throw new NotFoundException('Resident not found');

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
    return this.reveal(incident);
  }

  async list(
    user: AuthUser,
    opts: { residentId?: string; status?: IncidentStatus } = {},
    req?: Request,
  ) {
    const rows = await this.prisma.db.incident.findMany({
      where: {
        tenantId: user.tenantId,
        deletedAt: null,
        ...(opts.residentId ? { residentId: opts.residentId } : {}),
        ...(opts.status ? { status: opts.status } : {}),
      },
      orderBy: { occurredAt: 'desc' },
      include: {
        reportedBy: { select: { id: true, firstName: true, lastName: true, role: true } },
        resident: { select: { id: true, firstName: true, lastName: true, room: true } },
      },
    });
    await this.audit.logForUser(user, 'incident.list', 'Incident', null, {
      count: rows.length,
      residentId: opts.residentId ?? null,
    }, req);
    return rows.map((r) => this.reveal(r));
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
    await this.audit.logForUser(user, 'incident.read', 'Incident', id, undefined, req);
    return this.reveal(row);
  }

  async update(user: AuthUser, id: string, dto: UpdateIncidentDto, req?: Request) {
    await this.findOne(user, id);
    const row = await this.prisma.db.incident.update({
      where: { id },
      data: {
        ...dto,
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
    return this.reveal(row);
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
    return this.reveal(row);
  }

  async softDelete(user: AuthUser, id: string, req?: Request) {
    await this.findOne(user, id);
    const row = await this.prisma.db.incident.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await this.audit.logForUser(user, 'incident.soft_delete', 'Incident', id, undefined, req);
    return this.reveal(row);
  }
}
