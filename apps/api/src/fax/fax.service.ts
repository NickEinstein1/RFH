import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FaxJobStatus, Prisma, TransmitStatus } from '@prisma/client';
import type { Request } from 'express';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';

export type SendFaxInput = {
  toFaxNumber: string;
  subject: string;
  documentType: string;
  documentId?: string;
  medicationOrderId?: string;
  coverNote?: string;
  /** PDF bytes when available; otherwise a cover-only fax is queued */
  pdfBuffer?: Buffer;
  pageCount?: number;
};

@Injectable()
export class FaxService {
  private readonly log = new Logger(FaxService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  providerName(): string {
    const telnyx = this.config.get<string>('TELNYX_API_KEY');
    if (telnyx) return 'telnyx';
    const twilio = this.config.get<string>('TWILIO_ACCOUNT_SID');
    if (twilio) return 'twilio';
    return 'noop';
  }

  isLiveConfigured(): boolean {
    return this.providerName() !== 'noop';
  }

  async listJobs(user: AuthUser, take = 50) {
    return this.prisma.db.faxJob.findMany({
      where: { tenantId: user.tenantId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take,
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async send(user: AuthUser, input: SendFaxInput, req?: Request) {
    const tenant = await this.prisma.db.tenant.findFirst({
      where: { id: user.tenantId },
    });
    if (!tenant) throw new Error('Tenant not found');

    const provider = this.providerName();
    const fromFax = tenant.facilityFax || this.config.get<string>('FAX_FROM_NUMBER') || null;

    const job = await this.prisma.db.faxJob.create({
      data: {
        tenantId: user.tenantId,
        createdById: user.id,
        toFaxNumber: normalizeFax(input.toFaxNumber),
        fromFaxNumber: fromFax,
        subject: input.subject,
        documentType: input.documentType,
        documentId: input.documentId,
        medicationOrderId: input.medicationOrderId,
        status: FaxJobStatus.QUEUED,
        provider,
        coverNote: input.coverNote,
        pageCount: input.pageCount ?? (input.pdfBuffer ? undefined : 1),
      },
    });

    await this.audit.logForUser(
      user,
      'fax.queued',
      'FaxJob',
      job.id,
      {
        to: job.toFaxNumber,
        documentType: job.documentType,
        provider,
        live: this.isLiveConfigured(),
      },
      req,
    );

    try {
      const result = await this.dispatch(job.id, input.pdfBuffer);
      const updated = await this.prisma.db.faxJob.update({
        where: { id: job.id },
        data: {
          status: result.ok ? FaxJobStatus.SENT : FaxJobStatus.FAILED,
          providerJobId: result.providerJobId,
          errorMessage: result.error,
          sentAt: result.ok ? new Date() : null,
          pageCount: result.pageCount ?? job.pageCount,
        },
      });

      if (input.medicationOrderId) {
        await this.prisma.db.medicationOrder.updateMany({
          where: { id: input.medicationOrderId, tenantId: user.tenantId },
          data: {
            transmitStatus: result.ok ? TransmitStatus.FAX_SENT : TransmitStatus.FAILED,
            lastTransmittedAt: result.ok ? new Date() : undefined,
            pharmacyFax: job.toFaxNumber,
          },
        });
      }

      await this.audit.logForUser(
        user,
        result.ok ? 'fax.sent' : 'fax.failed',
        'FaxJob',
        job.id,
        { provider, providerJobId: result.providerJobId, error: result.error },
        req,
      );

      return updated;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Fax dispatch failed';
      this.log.error(message);
      return this.prisma.db.faxJob.update({
        where: { id: job.id },
        data: { status: FaxJobStatus.FAILED, errorMessage: message },
      });
    }
  }

  private async dispatch(
    jobId: string,
    pdfBuffer?: Buffer,
  ): Promise<{ ok: boolean; providerJobId?: string; error?: string; pageCount?: number }> {
    const provider = this.providerName();

    if (provider === 'noop') {
      this.log.warn(
        `Fax noop (configure TELNYX_API_KEY or TWILIO_ACCOUNT_SID): job ${jobId}, bytes=${pdfBuffer?.length ?? 0}`,
      );
      return {
        ok: true,
        providerJobId: `noop_${jobId}`,
        pageCount: pdfBuffer ? undefined : 1,
      };
    }

    if (provider === 'telnyx') {
      return this.sendTelnyx(jobId, pdfBuffer);
    }

    if (provider === 'twilio') {
      return this.sendTwilio(jobId, pdfBuffer);
    }

    return { ok: false, error: `Unknown fax provider: ${provider}` };
  }

  private async sendTelnyx(jobId: string, _pdfBuffer?: Buffer) {
    // Live Telnyx Programmable Fax requires a media URL — store PDF then POST.
    // Scaffolded for credentials; full media hosting lands with object storage.
    const apiKey = this.config.get<string>('TELNYX_API_KEY');
    const connectionId = this.config.get<string>('TELNYX_FAX_CONNECTION_ID');
    if (!apiKey || !connectionId) {
      return { ok: false, error: 'TELNYX_API_KEY / TELNYX_FAX_CONNECTION_ID required' };
    }
    this.log.warn(`Telnyx fax ready for credentials — media URL pending for job ${jobId}`);
    return {
      ok: false,
      error:
        'Telnyx credentials present; upload PDF to a public media URL then retry (scaffold active).',
    };
  }

  private async sendTwilio(jobId: string, _pdfBuffer?: Buffer) {
    const sid = this.config.get<string>('TWILIO_ACCOUNT_SID');
    const token = this.config.get<string>('TWILIO_AUTH_TOKEN');
    const from = this.config.get<string>('TWILIO_FAX_FROM');
    if (!sid || !token || !from) {
      return { ok: false, error: 'TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FAX_FROM required' };
    }
    this.log.warn(`Twilio fax ready for credentials — media URL pending for job ${jobId}`);
    return {
      ok: false,
      error:
        'Twilio credentials present; host PDF media URL then retry (scaffold active).',
    };
  }

  async getFacilityFaxSettings(tenantId: string) {
    return this.prisma.db.tenant.findFirst({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
        pharmacyName: true,
        pharmacyPhone: true,
        pharmacyFax: true,
        pharmacyNpi: true,
        facilityFax: true,
        faxEnabled: true,
      },
    });
  }

  async updateFacilityFaxSettings(
    user: AuthUser,
    data: {
      pharmacyName?: string | null;
      pharmacyPhone?: string | null;
      pharmacyFax?: string | null;
      pharmacyNpi?: string | null;
      facilityFax?: string | null;
      faxEnabled?: boolean;
    },
    req?: Request,
  ) {
    const updated = await this.prisma.db.tenant.update({
      where: { id: user.tenantId },
      data: data as Prisma.TenantUpdateInput,
      select: {
        id: true,
        name: true,
        pharmacyName: true,
        pharmacyPhone: true,
        pharmacyFax: true,
        pharmacyNpi: true,
        facilityFax: true,
        faxEnabled: true,
      },
    });
    await this.audit.logForUser(
      user,
      'integrations.facility_settings.update',
      'Tenant',
      user.tenantId,
      { faxEnabled: updated.faxEnabled, pharmacyName: updated.pharmacyName },
      req,
    );
    return updated;
  }
}

function normalizeFax(value: string): string {
  const digits = value.replace(/[^\d+]/g, '');
  return digits || value.trim();
}
