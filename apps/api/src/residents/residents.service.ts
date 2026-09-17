import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { FamilyAccessService } from '../tenancy/family-access.service';
import { PhiCryptoService } from '../common/crypto/phi-crypto.service';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { CreateResidentDto, UpdateResidentDto } from './dto/resident.dto';
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
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    await this.audit.logForUser(user, 'resident.list', 'Resident', null, {
      count: residents.length,
      familyScoped: Boolean(linkedIds),
    }, req);
    return residents.map((r) => this.reveal(r));
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
}
