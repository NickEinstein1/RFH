import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MedOrderIntakeStatus, MedOrderStatus, Prisma } from '@prisma/client';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PhiCryptoService } from '../common/crypto/phi-crypto.service';
import { OrderExtractService, type ExtractedMedDraft } from '../ai/order-extract.service';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import type {
  MedDraftDto,
  RejectIntakeDto,
  UploadOrderIntakeDto,
} from './dto/order-intake.dto';

@Injectable()
export class OrderIntakeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly extract: OrderExtractService,
    private readonly phi: PhiCryptoService,
  ) {}

  async upload(user: AuthUser, dto: UploadOrderIntakeDto, req?: Request) {
    if (!dto.dataUrl && !dto.rawText?.trim()) {
      throw new BadRequestException('Provide an image/PDF dataUrl and/or rawText');
    }
    const resident = await this.prisma.db.resident.findFirst({
      where: { id: dto.residentId, tenantId: user.tenantId, deletedAt: null },
    });
    if (!resident) throw new NotFoundException('Resident not found');

    const row = await this.prisma.db.medOrderIntake.create({
      data: {
        tenantId: user.tenantId,
        residentId: dto.residentId,
        uploadedById: user.id,
        fileName: dto.fileName.slice(0, 200),
        contentType: dto.contentType.slice(0, 120),
        dataUrl: dto.dataUrl ? this.phi.encrypt(dto.dataUrl) : null,
        rawText: dto.rawText?.trim() ? this.phi.encrypt(dto.rawText.trim()) : null,
        status: MedOrderIntakeStatus.UPLOADED,
      },
    });

    await this.audit.logForUser(user, 'order_intake.upload', 'MedOrderIntake', row.id, {
      residentId: dto.residentId,
      fileName: dto.fileName,
      hasImage: Boolean(dto.dataUrl),
      hasText: Boolean(dto.rawText?.trim()),
      allowAiExtraction: Boolean(dto.allowAiExtraction),
    }, req);

    return this.extractAndSave(user, row.id, Boolean(dto.allowAiExtraction), req);
  }

  async list(user: AuthUser, residentId: string, req?: Request) {
    await this.assertResident(user.tenantId, residentId);
    const rows = await this.prisma.db.medOrderIntake.findMany({
      where: { tenantId: user.tenantId, residentId },
      orderBy: { createdAt: 'desc' },
      take: 40,
      select: {
        id: true,
        fileName: true,
        contentType: true,
        status: true,
        extractNote: true,
        createdAt: true,
        reviewedAt: true,
        drafts: true,
        dataUrl: true,
        rawText: true,
      },
    });
    await this.audit.logForUser(user, 'order_intake.list', 'MedOrderIntake', null, {
      residentId,
      count: rows.length,
    }, req);
    // Never return ciphertext or plaintext PHI blobs in list responses.
    return rows.map((r) => ({
      id: r.id,
      fileName: r.fileName,
      contentType: r.contentType,
      status: r.status,
      extractNote: r.extractNote,
      createdAt: r.createdAt,
      reviewedAt: r.reviewedAt,
      drafts: r.drafts,
      hasImage: Boolean(r.dataUrl),
      hasText: Boolean(r.rawText),
    }));
  }

  async getOne(user: AuthUser, id: string, req?: Request) {
    const row = await this.findOwned(user.tenantId, id);
    await this.audit.logForUser(user, 'order_intake.read', 'MedOrderIntake', id, undefined, req);
    return this.serialize(row);
  }

  async reextract(user: AuthUser, id: string, req?: Request) {
    return this.extractAndSave(user, id, false, req);
  }

  async updateDrafts(user: AuthUser, id: string, drafts: MedDraftDto[], req?: Request) {
    const row = await this.findOwned(user.tenantId, id);
    if (
      row.status === MedOrderIntakeStatus.APPROVED ||
      row.status === MedOrderIntakeStatus.REJECTED
    ) {
      throw new BadRequestException('Cannot edit drafts after approve/reject');
    }
    if (drafts.length > 30) {
      throw new BadRequestException('Too many drafts (max 30)');
    }
    const normalized = drafts.map((d) => this.normalizeDraft(d));
    const updated = await this.prisma.db.medOrderIntake.update({
      where: { id: row.id },
      data: {
        drafts: normalized as unknown as Prisma.InputJsonValue,
        status: MedOrderIntakeStatus.PENDING_APPROVAL,
      },
    });
    await this.audit.logForUser(user, 'order_intake.drafts_update', 'MedOrderIntake', id, {
      draftCount: normalized.length,
    }, req);
    return this.serialize(updated);
  }

  async approve(user: AuthUser, id: string, req?: Request) {
    const row = await this.findOwned(user.tenantId, id);
    if (row.status === MedOrderIntakeStatus.APPROVED) {
      throw new BadRequestException('Already approved');
    }
    if (row.status === MedOrderIntakeStatus.REJECTED) {
      throw new BadRequestException('Intake was rejected');
    }
    const drafts = this.readDrafts(row.drafts);
    if (!drafts.length) throw new BadRequestException('No drafts to approve');
    for (const d of drafts) {
      if (!d.drugName?.trim() || !d.dose?.trim() || !d.route?.trim()) {
        throw new BadRequestException('Each draft needs drugName, dose, and route');
      }
      if (!d.isPrn && (!d.scheduleTimes || d.scheduleTimes.length === 0)) {
        throw new BadRequestException(`Schedule times required for ${d.drugName}`);
      }
    }

    const orders = [];
    for (const d of drafts) {
      const order = await this.prisma.db.medicationOrder.create({
        data: {
          tenantId: user.tenantId,
          residentId: row.residentId,
          intakeId: row.id,
          drugName: d.drugName.trim(),
          dose: d.dose.trim(),
          route: d.route.trim(),
          frequency: d.frequency.trim() || (d.isPrn ? 'PRN' : 'Daily'),
          scheduleTimes: d.isPrn ? [] : d.scheduleTimes,
          startDate: new Date(d.startDate || new Date().toISOString().slice(0, 10)),
          isPrn: Boolean(d.isPrn),
          instructions: d.instructions || null,
          brand: d.brand || null,
          rxNumber: d.rxNumber || null,
          imprint: d.imprint || null,
          categoryLabel: d.categoryLabel || null,
          prescriber: d.prescriber || null,
          highAlert: Boolean(d.highAlert),
          status: MedOrderStatus.ACTIVE,
        },
      });
      orders.push(order);
    }
    await this.prisma.db.medOrderIntake.update({
      where: { id: row.id },
      data: {
        status: MedOrderIntakeStatus.APPROVED,
        reviewedById: user.id,
        reviewedAt: new Date(),
        // Drop encrypted source blobs after approve to shrink PHI footprint.
        dataUrl: null,
        rawText: null,
      },
    });

    await this.audit.logForUser(user, 'order_intake.approve', 'MedOrderIntake', id, {
      orderIds: orders.map((o) => o.id),
      residentId: row.residentId,
    }, req);

    return { intakeId: id, orders };
  }

  async reject(user: AuthUser, id: string, dto: RejectIntakeDto, req?: Request) {
    const row = await this.findOwned(user.tenantId, id);
    if (row.status === MedOrderIntakeStatus.APPROVED) {
      throw new BadRequestException('Already approved');
    }
    const updated = await this.prisma.db.medOrderIntake.update({
      where: { id: row.id },
      data: {
        status: MedOrderIntakeStatus.REJECTED,
        reviewNotes: dto.reviewNotes || null,
        reviewedById: user.id,
        reviewedAt: new Date(),
        dataUrl: null,
        rawText: null,
      },
    });
    await this.audit.logForUser(user, 'order_intake.reject', 'MedOrderIntake', id, {
      reviewNotes: dto.reviewNotes || null,
    }, req);
    return this.serialize(updated);
  }

  aiAvailable() {
    return { aiEnabled: this.extract.hasAi() };
  }

  private async extractAndSave(
    user: AuthUser,
    id: string,
    allowAiExtraction: boolean,
    req?: Request,
  ) {
    const row = await this.findOwned(user.tenantId, id);
    if (
      row.status === MedOrderIntakeStatus.APPROVED ||
      row.status === MedOrderIntakeStatus.REJECTED
    ) {
      throw new BadRequestException('Cannot re-extract after approve/reject');
    }

    const { drafts, note } = await this.extract.extract({
      rawText: this.phi.decrypt(row.rawText),
      dataUrl: this.phi.decrypt(row.dataUrl),
      contentType: row.contentType,
      allowAiExtraction,
    });

    const updated = await this.prisma.db.medOrderIntake.update({
      where: { id: row.id },
      data: {
        drafts: drafts as unknown as Prisma.InputJsonValue,
        extractNote: note,
        status:
          drafts.length && drafts.some((d) => d.drugName)
            ? MedOrderIntakeStatus.PENDING_APPROVAL
            : MedOrderIntakeStatus.EXTRACTED,
      },
    });

    await this.audit.logForUser(user, 'order_intake.extract', 'MedOrderIntake', id, {
      draftCount: drafts.length,
      note,
      aiUsed: allowAiExtraction && this.extract.hasAi(),
    }, req);

    return this.serialize(updated);
  }

  private serialize(row: {
    id: string;
    tenantId: string;
    residentId: string;
    fileName: string;
    contentType: string;
    dataUrl: string | null;
    rawText: string | null;
    drafts: Prisma.JsonValue;
    status: MedOrderIntakeStatus;
    extractNote: string | null;
    reviewNotes: string | null;
    reviewedById: string | null;
    reviewedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      residentId: row.residentId,
      fileName: row.fileName,
      contentType: row.contentType,
      hasImage: Boolean(row.dataUrl),
      hasText: Boolean(row.rawText),
      // Never echo source PHI back to the client after storage.
      drafts: this.readDrafts(row.drafts),
      status: row.status,
      extractNote: row.extractNote,
      reviewNotes: row.reviewNotes,
      reviewedById: row.reviewedById,
      reviewedAt: row.reviewedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      aiEnabled: this.extract.hasAi(),
    };
  }

  private readDrafts(value: Prisma.JsonValue): ExtractedMedDraft[] {
    if (!value || !Array.isArray(value)) return [];
    return value as unknown as ExtractedMedDraft[];
  }

  private normalizeDraft(d: MedDraftDto): ExtractedMedDraft {
    return {
      drugName: d.drugName.trim(),
      dose: d.dose.trim(),
      route: d.route.trim(),
      frequency: d.frequency.trim(),
      scheduleTimes: d.isPrn ? [] : d.scheduleTimes.map(String),
      isPrn: Boolean(d.isPrn),
      instructions: d.instructions,
      brand: d.brand,
      rxNumber: d.rxNumber,
      imprint: d.imprint,
      categoryLabel: d.categoryLabel,
      prescriber: d.prescriber,
      highAlert: Boolean(d.highAlert),
      startDate: d.startDate || new Date().toISOString().slice(0, 10),
    };
  }

  private async findOwned(tenantId: string, id: string) {
    const row = await this.prisma.db.medOrderIntake.findFirst({
      where: { id, tenantId },
    });
    if (!row) throw new NotFoundException('Order intake not found');
    return row;
  }

  private async assertResident(tenantId: string, residentId: string) {
    const r = await this.prisma.db.resident.findFirst({
      where: { id: residentId, tenantId, deletedAt: null },
    });
    if (!r) throw new NotFoundException('Resident not found');
  }
}
