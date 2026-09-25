import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { FamilyAccessService } from '../tenancy/family-access.service';
import { PhiCryptoService } from '../common/crypto/phi-crypto.service';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { CreateResidentDto, UpdateResidentDto, UploadResidentPhotoDto } from './dto/resident.dto';
import type { Request } from 'express';
import type { Resident } from '@prisma/client';

@Injectable()
export class ResidentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly familyAccess: FamilyAccessService,
    private readonly phi: PhiCryptoService,
  ) {}

  private reveal(resident: Resident) {
    return {
      ...resident,
      mrn: this.phi.decrypt(resident.mrn),
    };
  }

  async create(user: AuthUser, dto: CreateResidentDto, req?: Request) {
    const resident = await this.prisma.db.resident.create({
      data: {
        tenantId: user.tenantId,
        firstName: dto.firstName,
        lastName: dto.lastName,
        dateOfBirth: new Date(dto.dateOfBirth),
        sex: dto.sex,
        mrn: this.phi.encrypt(dto.mrn ?? null),
        room: dto.room,
        admitDate: new Date(dto.admitDate),
        allergies: dto.allergies ?? [],
      },
    });
    await this.audit.logForUser(user, 'resident.create', 'Resident', resident.id, {
      name: `${resident.firstName} ${resident.lastName}`,
    }, req);
    return this.reveal(resident);
  }

  async findAll(user: AuthUser, req?: Request) {
    const linkedIds = await this.familyAccess.linkedResidentIds(user);
    const residents = await this.prisma.db.resident.findMany({
      where: {
        tenantId: user.tenantId,
        deletedAt: null,
        ...(linkedIds ? { id: { in: linkedIds } } : {}),
      },
      select: {
        id: true,
        tenantId: true,
        firstName: true,
        lastName: true,
        dateOfBirth: true,
        sex: true,
        mrn: true,
        room: true,
        status: true,
        admitDate: true,
        allergies: true,
        photoUrl: true,
        deletedAt: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    this.audit.logForUserDeferred(user, 'resident.list', 'Resident', null, {
      count: residents.length,
      familyScoped: Boolean(linkedIds),
    }, req);
    // Strip bulky inline data-URL photos from census; keep routed /api/media paths.
    return residents.map((r) =>
      this.reveal({
        ...r,
        photoUrl:
          r.photoUrl && r.photoUrl.startsWith('/api/media/')
            ? r.photoUrl
            : r.photoUrl && r.photoUrl.startsWith('data:')
              ? null
              : r.photoUrl,
      }),
    );
  }

  async findOne(user: AuthUser, id: string, req?: Request) {
    await this.familyAccess.assertCanAccessResident(user, id);
    const resident = await this.prisma.db.resident.findFirst({
      where: { id, tenantId: user.tenantId, deletedAt: null },
    });
    if (!resident) throw new NotFoundException('Resident not found');
    await this.audit.logForUser(user, 'resident.read', 'Resident', id, undefined, req);
    return this.reveal(resident);
  }

  async update(user: AuthUser, id: string, dto: UpdateResidentDto, req?: Request) {
    await this.findOne(user, id);
    const resident = await this.prisma.db.resident.update({
      where: { id },
      data: {
        ...dto,
        mrn: dto.mrn !== undefined ? this.phi.encrypt(dto.mrn) : undefined,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
        admitDate: dto.admitDate ? new Date(dto.admitDate) : undefined,
      },
    });
    await this.audit.logForUser(user, 'resident.update', 'Resident', id, {
      fields: Object.keys(dto),
    }, req);
    return this.reveal(resident);
  }

  async softDelete(user: AuthUser, id: string, req?: Request) {
    await this.findOne(user, id);
    const resident = await this.prisma.db.resident.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await this.audit.logForUser(user, 'resident.soft_delete', 'Resident', id, undefined, req);
    return this.reveal(resident);
  }

  async uploadPhoto(user: AuthUser, id: string, dto: UploadResidentPhotoDto, req?: Request) {
    await this.familyAccess.assertCanAccessResident(user, id);
    const existing = await this.prisma.db.resident.findFirst({
      where: { id, tenantId: user.tenantId, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Resident not found');

    const resident = await this.prisma.db.resident.update({
      where: { id },
      data: { photoUrl: dto.photoUrl },
    });
    await this.audit.logForUser(user, 'resident.photo_upload', 'Resident', id, {
      bytes: dto.photoUrl.length,
    }, req);
    return this.reveal(resident);
  }

  async clearPhoto(user: AuthUser, id: string, req?: Request) {
    await this.familyAccess.assertCanAccessResident(user, id);
    const existing = await this.prisma.db.resident.findFirst({
      where: { id, tenantId: user.tenantId, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Resident not found');

    const resident = await this.prisma.db.resident.update({
      where: { id },
      data: { photoUrl: null },
    });
    await this.audit.logForUser(user, 'resident.photo_clear', 'Resident', id, undefined, req);
    return this.reveal(resident);
  }
}
