import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { MedOutcome, NoteType, Role } from '@prisma/client';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { FamilyAccessService } from '../tenancy/family-access.service';
import { PhiCryptoService } from '../common/crypto/phi-crypto.service';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { facilityLocalToUtc, facilityTodayYmd } from '../common/time/facility-time';

@Injectable()
export class FamilyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly familyAccess: FamilyAccessService,
    private readonly phi: PhiCryptoService,
  ) {}

  private assertFamily(user: AuthUser) {
    if (user.role !== Role.FAMILY_VIEWER) {
      throw new ForbiddenException('Family portal is for family accounts only');
    }
  }

  async portal(user: AuthUser, req?: Request) {
    this.assertFamily(user);
    const linked = (await this.familyAccess.linkedResidentIds(user)) || [];
    const tenant = await this.prisma.db.tenant.findUniqueOrThrow({
      where: { id: user.tenantId },
    });
    const today = facilityTodayYmd(tenant.timezone);
    const dayStart = facilityLocalToUtc(today, '00:00', tenant.timezone);
    const dayEnd = facilityLocalToUtc(today, '23:59', tenant.timezone);

    const links = await this.prisma.db.familyResidentLink.findMany({
      where: {
        tenantId: user.tenantId,
        userId: user.id,
        deletedAt: null,
      },
      include: {
        resident: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            room: true,
            photoUrl: true,
            allergies: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const cards = await Promise.all(
      links.map(async (link) => {
        const [givenToday, notes, incidents] = await Promise.all([
          this.prisma.db.medAdministration.findMany({
            where: {
              tenantId: user.tenantId,
              residentId: link.residentId,
              outcome: MedOutcome.GIVEN,
              administeredAt: { gte: dayStart, lte: dayEnd },
            },
            include: {
              order: { select: { drugName: true, dose: true, route: true } },
            },
            orderBy: { administeredAt: 'asc' },
            take: 40,
          }),
          this.prisma.db.progressNote.findMany({
            where: {
              tenantId: user.tenantId,
              residentId: link.residentId,
              deletedAt: null,
              // Minimum necessary: family messaging / communications only.
              noteType: NoteType.COMMUNICATION,
            },
            orderBy: { occurredAt: 'desc' },
            take: 8,
            include: {
              author: {
                select: { firstName: true, lastName: true, role: true },
              },
            },
          }),
          this.prisma.db.incident.findMany({
            where: {
              tenantId: user.tenantId,
              residentId: link.residentId,
              deletedAt: null,
            },
            orderBy: { occurredAt: 'desc' },
            take: 5,
            select: {
              id: true,
              title: true,
              severity: true,
              status: true,
              category: true,
              occurredAt: true,
            },
          }),
        ]);

        return {
          relationship: link.relationship,
          resident: {
            ...link.resident,
            // Allergies are clinical; keep for safety awareness in family portal.
          },
          medsGivenToday: givenToday.map((a) => ({
            id: a.id,
            drugName: a.order.drugName,
            dose: a.order.dose,
            route: a.order.route,
            administeredAt: (a.administeredAt ?? a.scheduledAt).toISOString(),
          })),
          notes: notes.map((n) => {
            const body = this.phi.decrypt(n.body) ?? '';
            return {
              id: n.id,
              noteType: n.noteType,
              body: body.length > 500 ? `${body.slice(0, 500)}…` : body,
              occurredAt: n.occurredAt.toISOString(),
              author: n.author,
            };
          }),
          incidents,
        };
      }),
    );

    await this.audit.logForUser(user, 'family.portal_read', 'FamilyPortal', null, {
      residentCount: linked.length,
    }, req);

    return {
      facilityName: tenant.name,
      timezone: tenant.timezone,
      today,
      cards,
    };
  }

  async sendMessage(
    user: AuthUser,
    dto: { residentId: string; body: string },
    req?: Request,
  ) {
    this.assertFamily(user);
    await this.familyAccess.assertCanAccessResident(user, dto.residentId);
    const body = dto.body.trim();
    if (body.length < 2) throw new ForbiddenException('Message too short');

    const resident = await this.prisma.db.resident.findFirst({
      where: { id: dto.residentId, tenantId: user.tenantId, deletedAt: null },
    });
    if (!resident) throw new NotFoundException('Resident not found');

    const note = await this.prisma.db.progressNote.create({
      data: {
        tenantId: user.tenantId,
        residentId: dto.residentId,
        authorId: user.id,
        body: this.phi.encrypt(body)!,
        noteType: NoteType.COMMUNICATION,
        occurredAt: new Date(),
      },
      include: {
        author: { select: { id: true, firstName: true, lastName: true, role: true } },
      },
    });

    await this.audit.logForUser(user, 'family.message_send', 'ProgressNote', note.id, {
      residentId: dto.residentId,
    }, req);

    return {
      id: note.id,
      noteType: note.noteType,
      body: this.phi.decrypt(note.body) ?? '',
      occurredAt: note.occurredAt.toISOString(),
      author: note.author,
      residentId: note.residentId,
    };
  }
}
