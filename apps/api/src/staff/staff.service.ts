import { Injectable, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CredentialAlertType, Role } from '@prisma/client';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { CreateCredentialDto, CreateFamilyLinkDto } from './dto/staff.dto';

const EXPIRING_SOON_DAYS = 30;

@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listUsers(user: AuthUser, req?: Request) {
    const users = await this.prisma.db.user.findMany({
      where: { tenantId: user.tenantId, deletedAt: null },
      select: {
        id: true,
        email: true,
        role: true,
        firstName: true,
        lastName: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    await this.audit.logForUser(user, 'user.list', 'User', null, {
      count: users.length,
    }, req);
    return users;
  }

  async createCredential(user: AuthUser, dto: CreateCredentialDto, req?: Request) {
    const target = await this.prisma.db.user.findFirst({
      where: { id: dto.userId, tenantId: user.tenantId, deletedAt: null },
    });
    if (!target) throw new NotFoundException('Staff user not found');

    const credential = await this.prisma.db.staffCredential.create({
      data: {
        tenantId: user.tenantId,
        userId: dto.userId,
        type: dto.type,
        label: dto.label,
        licenseNumber: dto.licenseNumber,
        issuedAt: dto.issuedAt ? new Date(dto.issuedAt) : null,
        expiresAt: new Date(dto.expiresAt),
      },
    });
    await this.audit.logForUser(user, 'credential.create', 'StaffCredential', credential.id, {
      userId: dto.userId,
      type: dto.type,
      expiresAt: dto.expiresAt,
    }, req);
    return credential;
  }

  async listCredentials(user: AuthUser, userId: string | undefined, req?: Request) {
    const isManager = user.role === Role.OWNER || user.role === Role.ADMIN || user.role === Role.NURSE;
    const scopeUserId = isManager ? userId : user.id;

    const rows = await this.prisma.db.staffCredential.findMany({
      where: {
        tenantId: user.tenantId,
        deletedAt: null,
        ...(scopeUserId ? { userId: scopeUserId } : {}),
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, role: true } },
      },
      orderBy: { expiresAt: 'asc' },
    });
    await this.audit.logForUser(user, 'credential.list', 'StaffCredential', null, {
      count: rows.length,
      userId: scopeUserId ?? null,
    }, req);
    return rows;
  }

  async listCredentialAlerts(user: AuthUser, req?: Request) {
    const alerts = await this.prisma.db.credentialAlert.findMany({
      where: { tenantId: user.tenantId, status: 'OPEN' },
      orderBy: { triggeredAt: 'desc' },
      include: {
        credential: {
          include: {
            user: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
    });
    await this.audit.logForUser(user, 'credential_alert.list', 'CredentialAlert', null, {
      count: alerts.length,
    }, req);
    return alerts;
  }

  async acknowledgeCredentialAlert(user: AuthUser, id: string, req?: Request) {
    const alert = await this.prisma.db.credentialAlert.findFirst({
      where: { id, tenantId: user.tenantId },
    });
    if (!alert) throw new NotFoundException('Alert not found');
    const updated = await this.prisma.db.credentialAlert.update({
      where: { id },
      data: {
        status: 'ACKNOWLEDGED',
        acknowledgedAt: new Date(),
        acknowledgedById: user.id,
      },
    });
    await this.audit.logForUser(user, 'credential_alert.ack', 'CredentialAlert', id, undefined, req);
    return updated;
  }

  async createFamilyLink(user: AuthUser, dto: CreateFamilyLinkDto, req?: Request) {
    const familyUser = await this.prisma.db.user.findFirst({
      where: {
        id: dto.userId,
        tenantId: user.tenantId,
        role: Role.FAMILY_VIEWER,
        deletedAt: null,
      },
    });
    if (!familyUser) throw new NotFoundException('Family viewer not found');

    const resident = await this.prisma.db.resident.findFirst({
      where: { id: dto.residentId, tenantId: user.tenantId, deletedAt: null },
    });
    if (!resident) throw new NotFoundException('Resident not found');

    const link = await this.prisma.db.familyResidentLink.upsert({
      where: {
        tenantId_userId_residentId: {
          tenantId: user.tenantId,
          userId: dto.userId,
          residentId: dto.residentId,
        },
      },
      update: { deletedAt: null, relationship: dto.relationship },
      create: {
        tenantId: user.tenantId,
        userId: dto.userId,
        residentId: dto.residentId,
        relationship: dto.relationship,
      },
    });
    await this.audit.logForUser(user, 'family_link.create', 'FamilyResidentLink', link.id, {
      userId: dto.userId,
      residentId: dto.residentId,
      relationship: dto.relationship,
    }, req);
    return link;
  }

  async listFamilyLinks(user: AuthUser, req?: Request) {
    const links = await this.prisma.db.familyResidentLink.findMany({
      where: { tenantId: user.tenantId, deletedAt: null },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        resident: { select: { id: true, firstName: true, lastName: true, room: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    await this.audit.logForUser(user, 'family_link.list', 'FamilyResidentLink', null, {
      count: links.length,
    }, req);
    return links;
  }

  @Cron(CronExpression.EVERY_HOUR)
  async detectExpiringCredentials() {
    await this.prisma.runWithBypass(async () => {
      const now = new Date();
      const soon = new Date(now);
      soon.setUTCDate(soon.getUTCDate() + EXPIRING_SOON_DAYS);

      const credentials = await this.prisma.db.staffCredential.findMany({
        where: {
          deletedAt: null,
          expiresAt: { lte: soon },
        },
      });

      for (const cred of credentials) {
        const type =
          cred.expiresAt <= now
            ? CredentialAlertType.EXPIRED
            : CredentialAlertType.EXPIRING_SOON;

        const existing = await this.prisma.db.credentialAlert.findFirst({
          where: {
            tenantId: cred.tenantId,
            credentialId: cred.id,
            type,
            status: 'OPEN',
          },
        });
        if (existing) continue;

        const alert = await this.prisma.db.credentialAlert.create({
          data: {
            tenantId: cred.tenantId,
            credentialId: cred.id,
            type,
          },
        });
        await this.prisma.db.auditLog.create({
          data: {
            tenantId: cred.tenantId,
            actorId: null,
            action: 'credential_alert.create',
            resourceType: 'CredentialAlert',
            resourceId: alert.id,
            metadata: {
              credentialId: cred.id,
              type,
              expiresAt: cred.expiresAt.toISOString(),
            },
          },
        });
      }
    });
  }
}
