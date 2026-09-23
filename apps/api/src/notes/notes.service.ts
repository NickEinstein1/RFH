import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { FamilyAccessService } from '../tenancy/family-access.service';
import { PhiCryptoService } from '../common/crypto/phi-crypto.service';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { CreateProgressNoteDto, UpdateProgressNoteDto } from './dto/note.dto';
import type { Request } from 'express';

@Injectable()
export class NotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly familyAccess: FamilyAccessService,
    private readonly phi: PhiCryptoService,
  ) {}

  private reveal<T extends { body: string }>(note: T): T {
    return { ...note, body: this.phi.decrypt(note.body) ?? '' };
  }

  async create(user: AuthUser, dto: CreateProgressNoteDto, req?: Request) {
    await this.familyAccess.assertCanAccessResident(user, dto.residentId);
    const resident = await this.prisma.db.resident.findFirst({
      where: { id: dto.residentId, tenantId: user.tenantId, deletedAt: null },
    });
    if (!resident) throw new NotFoundException('Resident not found');

    const note = await this.prisma.db.progressNote.create({
      data: {
        tenantId: user.tenantId,
        residentId: dto.residentId,
        authorId: user.id,
        body: this.phi.encrypt(dto.body)!,
        noteType: dto.noteType,
        occurredAt: new Date(dto.occurredAt),
      },
      include: {
        author: { select: { id: true, firstName: true, lastName: true, role: true } },
      },
    });

    await this.audit.logForUser(user, 'note.create', 'ProgressNote', note.id, {
      residentId: dto.residentId,
      noteType: note.noteType,
    }, req);
    return this.reveal(note);
  }

  async listForResident(user: AuthUser, residentId: string, req?: Request) {
    await this.familyAccess.assertCanAccessResident(user, residentId);
    const isFamily = user.role === 'FAMILY_VIEWER';
    const notes = await this.prisma.db.progressNote.findMany({
      where: {
        tenantId: user.tenantId,
        residentId,
        deletedAt: null,
        ...(isFamily ? { noteType: 'COMMUNICATION' as const } : {}),
      },
      orderBy: { occurredAt: 'desc' },
      ...(isFamily ? { take: 40 } : {}),
      include: {
        author: { select: { id: true, firstName: true, lastName: true, role: true } },
      },
    });
    await this.audit.logForUser(user, 'note.list', 'ProgressNote', null, {
      residentId,
      count: notes.length,
      familyScoped: isFamily,
    }, req);
    return notes.map((n) => this.reveal(n));
  }

  async findOne(user: AuthUser, id: string, req?: Request) {
    const note = await this.prisma.db.progressNote.findFirst({
      where: { id, tenantId: user.tenantId, deletedAt: null },
      include: {
        author: { select: { id: true, firstName: true, lastName: true, role: true } },
      },
    });
    if (!note) throw new NotFoundException('Note not found');
    await this.familyAccess.assertCanAccessResident(user, note.residentId);
    if (user.role === 'FAMILY_VIEWER' && note.noteType !== 'COMMUNICATION') {
      throw new NotFoundException('Note not found');
    }
    await this.audit.logForUser(user, 'note.read', 'ProgressNote', id, undefined, req);
    return this.reveal(note);
  }

  async update(user: AuthUser, id: string, dto: UpdateProgressNoteDto, req?: Request) {
    await this.findOne(user, id);
    const note = await this.prisma.db.progressNote.update({
      where: { id },
      data: {
        ...dto,
        body: dto.body !== undefined ? this.phi.encrypt(dto.body)! : undefined,
        occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : undefined,
      },
    });
    await this.audit.logForUser(user, 'note.update', 'ProgressNote', id, {
      fields: Object.keys(dto),
    }, req);
    return this.reveal(note);
  }

  async softDelete(user: AuthUser, id: string, req?: Request) {
    await this.findOne(user, id);
    const note = await this.prisma.db.progressNote.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await this.audit.logForUser(user, 'note.soft_delete', 'ProgressNote', id, undefined, req);
    return this.reveal(note);
  }
}
