import { Injectable, NotFoundException } from '@nestjs/common';
import { PharmacyNetwork, TransmitStatus } from '@prisma/client';
import type { Request } from 'express';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { FaxService } from '../fax/fax.service';
import { PrismaService } from '../prisma/prisma.service';

/** Market pharmacy templates AFHs commonly use — connect per tenant. */
export const MARKET_PHARMACIES: Array<{
  network: PharmacyNetwork;
  displayName: string;
  phone?: string;
  fax?: string;
  notes: string;
}> = [
  {
    network: PharmacyNetwork.LINCOLN,
    displayName: 'Lincoln Pharmacy (Tacoma)',
    phone: '253-473-1155',
    fax: '253-473-1158',
    notes: 'Common AFH partner pharmacy — fax refill / new Rx cover sheets.',
  },
  {
    network: PharmacyNetwork.READY_MEDS,
    displayName: 'Ready Meds Pharmacy',
    phone: '877-425-6337',
    fax: '877-509-6337',
    notes: 'Mail-order / specialty fills — fax or portal.',
  },
  {
    network: PharmacyNetwork.CVS,
    displayName: 'CVS Pharmacy',
    notes: 'Retail chain — use store NPI/fax from the local branch.',
  },
  {
    network: PharmacyNetwork.WALGREENS,
    displayName: 'Walgreens',
    notes: 'Retail chain — use store NPI/fax from the local branch.',
  },
  {
    network: PharmacyNetwork.PIONEER_RX,
    displayName: 'PioneerRx (pharmacy system)',
    notes: 'Independent pharmacies running PioneerRx — API/eRx partnership TBD.',
  },
  {
    network: PharmacyNetwork.QS1,
    displayName: 'QS/1 (pharmacy system)',
    notes: 'Independent pharmacies running QS/1 — API/eRx partnership TBD.',
  },
  {
    network: PharmacyNetwork.SURESCRIPTS,
    displayName: 'Surescripts eRx network',
    notes: 'National e-prescribing network — requires EPCS-capable provider enrollment.',
  },
  {
    network: PharmacyNetwork.MANUAL_FAX,
    displayName: 'Manual fax / other pharmacy',
    notes: 'Send PDF cover sheets to any fax number.',
  },
];

@Injectable()
export class PharmacyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly fax: FaxService,
  ) {}

  catalog() {
    return MARKET_PHARMACIES;
  }

  async listConnections(user: AuthUser) {
    return this.prisma.db.pharmacyConnection.findMany({
      where: { tenantId: user.tenantId, deletedAt: null },
      orderBy: [{ isDefault: 'desc' }, { displayName: 'asc' }],
    });
  }

  async upsertConnection(
    user: AuthUser,
    body: {
      id?: string;
      network: PharmacyNetwork;
      displayName: string;
      npi?: string;
      phone?: string;
      fax?: string;
      isDefault?: boolean;
      isActive?: boolean;
    },
    req?: Request,
  ) {
    if (body.isDefault) {
      await this.prisma.db.pharmacyConnection.updateMany({
        where: { tenantId: user.tenantId, deletedAt: null },
        data: { isDefault: false },
      });
    }

    let row;
    if (body.id) {
      const existing = await this.prisma.db.pharmacyConnection.findFirst({
        where: { id: body.id, tenantId: user.tenantId, deletedAt: null },
      });
      if (!existing) throw new NotFoundException('Pharmacy connection not found');
      row = await this.prisma.db.pharmacyConnection.update({
        where: { id: body.id },
        data: {
          network: body.network,
          displayName: body.displayName,
          npi: body.npi,
          phone: body.phone,
          fax: body.fax,
          isDefault: body.isDefault ?? existing.isDefault,
          isActive: body.isActive ?? existing.isActive,
        },
      });
    } else {
      row = await this.prisma.db.pharmacyConnection.create({
        data: {
          tenantId: user.tenantId,
          network: body.network,
          displayName: body.displayName,
          npi: body.npi,
          phone: body.phone,
          fax: body.fax,
          isDefault: Boolean(body.isDefault),
          isActive: body.isActive !== false,
        },
      });
    }

    await this.audit.logForUser(
      user,
      body.id ? 'pharmacy.connection.update' : 'pharmacy.connection.create',
      'PharmacyConnection',
      row.id,
      { network: row.network, displayName: row.displayName },
      req,
    );
    return row;
  }

  async removeConnection(user: AuthUser, id: string, req?: Request) {
    const existing = await this.prisma.db.pharmacyConnection.findFirst({
      where: { id, tenantId: user.tenantId, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Pharmacy connection not found');
    await this.prisma.db.pharmacyConnection.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
    await this.audit.logForUser(
      user,
      'pharmacy.connection.delete',
      'PharmacyConnection',
      id,
      undefined,
      req,
    );
    return { ok: true };
  }

  /** Transmit an order to the selected pharmacy via fax (eRx providers plug in later). */
  async transmitOrder(
    user: AuthUser,
    orderId: string,
    opts: { pharmacyConnectionId?: string; coverNote?: string },
    req?: Request,
  ) {
    const order = await this.prisma.db.medicationOrder.findFirst({
      where: { id: orderId, tenantId: user.tenantId, deletedAt: null },
      include: { resident: { select: { firstName: true, lastName: true } } },
    });
    if (!order) throw new NotFoundException('Medication order not found');

    let connection = opts.pharmacyConnectionId
      ? await this.prisma.db.pharmacyConnection.findFirst({
          where: {
            id: opts.pharmacyConnectionId,
            tenantId: user.tenantId,
            deletedAt: null,
            isActive: true,
          },
        })
      : await this.prisma.db.pharmacyConnection.findFirst({
          where: { tenantId: user.tenantId, deletedAt: null, isActive: true, isDefault: true },
        });

    if (!connection) {
      connection = await this.prisma.db.pharmacyConnection.findFirst({
        where: { tenantId: user.tenantId, deletedAt: null, isActive: true },
      });
    }

    const tenant = await this.prisma.db.tenant.findFirst({ where: { id: user.tenantId } });
    const toFax =
      connection?.fax || tenant?.pharmacyFax || order.pharmacyFax || '';
    if (!toFax) {
      throw new NotFoundException(
        'No pharmacy fax on file — connect a pharmacy or set facility pharmacy fax.',
      );
    }

    if (connection) {
      await this.prisma.db.medicationOrder.update({
        where: { id: order.id },
        data: {
          pharmacyConnectionId: connection.id,
          pharmacyNpi: connection.npi,
          pharmacyFax: connection.fax,
          transmitStatus: TransmitStatus.FAX_QUEUED,
        },
      });
    } else {
      await this.prisma.db.medicationOrder.update({
        where: { id: order.id },
        data: { transmitStatus: TransmitStatus.FAX_QUEUED, pharmacyFax: toFax },
      });
    }

    const subject = `Rx / med order — ${order.resident.lastName}, ${order.resident.firstName}: ${order.drugName}`;
    const cover =
      opts.coverNote ||
      [
        `Facility: ${tenant?.name || ''}`,
        `Resident: ${order.resident.lastName}, ${order.resident.firstName}`,
        `Medication: ${order.drugName} ${order.dose} ${order.route}`,
        `Sig: ${order.frequency}`,
        order.instructions ? `Instructions: ${order.instructions}` : '',
        order.rxNumber ? `Rx #: ${order.rxNumber}` : '',
        order.prescriber ? `Prescriber: ${order.prescriber}` : '',
        connection ? `Pharmacy: ${connection.displayName}` : '',
      ]
        .filter(Boolean)
        .join('\n');

    const job = await this.fax.send(
      user,
      {
        toFaxNumber: toFax,
        subject,
        documentType: 'MED_ORDER',
        documentId: order.id,
        medicationOrderId: order.id,
        coverNote: cover,
      },
      req,
    );

    return { orderId: order.id, faxJob: job, pharmacy: connection };
  }
}
