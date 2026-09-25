import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import type { Request, Response } from 'express';
import { EmarService } from '../emar/emar.service';
import { CareService } from '../care/care.service';
import { IncidentsService } from '../incidents/incidents.service';
import { ReportsService } from '../reports/reports.service';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { formatUsDate } from '../common/time/us-date';
import { renderMarPdf } from './mar-pdf.builder';
import { renderCbhsPdf } from './cbhs-pdf.builder';

@Injectable()
export class DownloadsService {
  constructor(
    private readonly emar: EmarService,
    private readonly care: CareService,
    private readonly incidents: IncidentsService,
    private readonly reports: ReportsService,
    private readonly audit: AuditService,
    private readonly prisma: PrismaService,
  ) {}

  async marPdf(
    user: AuthUser,
    residentId: string,
    monthYm: string,
    res: Response,
    req?: Request,
  ) {
    const sheet = await this.emar.monthlyMarSheet(user, residentId, monthYm, req);
    const safeName = `${sheet.resident.lastName}_${sheet.resident.firstName}`.replace(
      /[^\w.-]+/g,
      '_',
    );
    const filename = `MAR_${safeName}_${monthYm}.pdf`;

    await this.audit.logForUser(
      user,
      'report.download',
      'MarSheet',
      residentId,
      { kind: 'mar', month: monthYm, filename },
      req,
    );

    const doc = new PDFDocument({
      margin: 28,
      size: 'LETTER',
      layout: 'landscape',
      autoFirstPage: true,
    });
    this.pipePdf(res, doc, filename);
    renderMarPdf(doc, sheet as Parameters<typeof renderMarPdf>[1]);
    doc.end();
  }

  async carePlanPdf(user: AuthUser, planId: string, res: Response, req?: Request) {
    const plan = await this.care.findPlan(user, planId, req);
    const form = (plan.formData || {}) as Record<string, any>;
    const header = form.header || {};
    const residentName =
      header.residentName ||
      `${plan.resident?.lastName || ''}, ${plan.resident?.firstName || ''}`.trim();
    const filename = `CarePlan_${String(residentName).replace(/[^\w.-]+/g, '_')}.pdf`;

    await this.audit.logForUser(
      user,
      'report.download',
      'CarePlan',
      planId,
      { kind: 'care_plan', filename },
      req,
    );

    const doc = new PDFDocument({ margin: 40, size: 'LETTER' });
    this.pipePdf(res, doc, filename);

    doc.fontSize(16).text(form.documentTitle || plan.title || 'Negotiated Care Plan');
    doc.fontSize(10).text(`Facility plan status: ${plan.status}`).moveDown(0.5);
    if (form.suicideSafetyNote) {
      doc.fontSize(8).fillColor('#7c2d12').text(String(form.suicideSafetyNote), { width: 520 });
      doc.fillColor('#000').moveDown(0.5);
    }

    doc.fontSize(12).text('Header');
    const headerLines = [
      ['Resident', header.residentName],
      ['Provider', header.providerName],
      ['Care plan date', header.carePlanDate],
      ['Admission', header.admissionDate],
      ['DOB', formatUsDate(header.dateOfBirth)],
      ['Language', header.primaryLanguage],
      ['Physician', header.physician],
      ['Pharmacy', header.pharmacy],
      ['Allergies', header.allergies],
      ['Mental health', header.mentalHealth],
      ['Special instructions', header.specialInstructions],
    ];
    for (const [label, value] of headerLines) {
      if (value) doc.fontSize(9).text(`${label}: ${String(value).slice(0, 500)}`);
    }

    doc.moveDown(0.5).fontSize(12).text('Care and services');
    for (const section of form.sections || []) {
      doc.moveDown(0.3).fontSize(10).text(String(section.title || 'Section'));
      for (const row of section.rows || []) {
        if (!row.strengthsNeeds && !row.staffDoes) continue;
        doc
          .fontSize(8)
          .text(`• ${row.service}`, { width: 520 })
          .text(`  Needs: ${row.strengthsNeeds || '—'}`, { width: 520 })
          .text(`  Staff: ${row.staffDoes || '—'}`, { width: 520 });
      }
    }

    doc.moveDown(0.5).fontSize(12).text('Signatures');
    for (const sig of form.signatures || []) {
      doc
        .fontSize(8)
        .text(
          `${sig.role}: ${sig.name || '—'} · signed ${sig.signedAt || '—'} · review ${sig.reviewDate || '—'}`,
        );
    }

    doc.end();
  }

  async incidentPdf(user: AuthUser, incidentId: string, res: Response, req?: Request) {
    const incident = await this.incidents.findOne(user, incidentId, req);
    const form = (incident.formData || {}) as Record<string, any>;
    const name = `${incident.resident.lastName}_${incident.resident.firstName}`;
    const filename = `CBHS_${name}_${incident.id.slice(0, 8)}.pdf`;

    await this.audit.logForUser(
      user,
      'report.download',
      'Incident',
      incidentId,
      { kind: 'incident', filename },
      req,
    );

    // Landscape matches the wide 4-column Word CBHS behavior log.
    const doc = new PDFDocument({
      margin: 36,
      size: 'LETTER',
      layout: 'landscape',
      autoFirstPage: true,
    });
    this.pipePdf(res, doc, filename);

    renderCbhsPdf(doc, {
      documentTitle: form.documentTitle || incident.title,
      client: {
        ...(form.client || {}),
        fullLegalName:
          form.client?.fullLegalName ||
          `${incident.resident.lastName}, ${incident.resident.firstName}`,
        dateOfBirth:
          form.client?.dateOfBirth ||
          (incident.resident as { dateOfBirth?: string }).dateOfBirth ||
          '',
        facilityName: form.client?.facilityName || '',
      },
      entries: form.entries || [],
      letter: form.letter || undefined,
      narrativeFallback: incident.narrative,
      meta: {
        status: incident.status,
        severity: incident.severity,
        category: incident.category,
      },
    });

    doc.end();
  }

  async inspectionPackPdf(
    user: AuthUser,
    fromIso: string,
    toIso: string,
    res: Response,
    req?: Request,
  ) {
    const pack = await this.reports.inspectionPack(user, fromIso, toIso, req);
    const filename = `InspectionPack_${fromIso.slice(0, 10)}_${toIso.slice(0, 10)}.pdf`;

    await this.audit.logForUser(
      user,
      'report.download',
      'InspectionPack',
      null,
      { kind: 'inspection_pack', from: fromIso, to: toIso, filename },
      req,
    );

    const doc = new PDFDocument({ margin: 40, size: 'LETTER' });
    this.pipePdf(res, doc, filename);

    doc.fontSize(16).text('Inspection Pack');
    doc
      .fontSize(10)
      .text(`Facility timezone: ${pack.facilityTimezone}`)
      .text(`Range: ${fromIso} → ${toIso}`)
      .moveDown();

    doc.fontSize(12).text(`Census (${pack.census?.activeCount ?? 0})`);
    for (const r of pack.census?.residents || []) {
      doc.fontSize(9).text(`${r.lastName}, ${r.firstName} · Rm ${r.room || '—'}`);
    }

    doc.moveDown().fontSize(12).text('eMAR outcome counts');
    const outcomes = pack.emar?.outcomeCounts || {};
    for (const [k, v] of Object.entries(outcomes)) {
      doc.fontSize(9).text(`${k}: ${v}`);
    }
    doc.fontSize(9).text(`Open med alerts: ${pack.emar?.openAlertCount ?? 0}`);

    doc.moveDown().fontSize(12).text(`Incidents (${pack.incidents?.count ?? 0})`);
    for (const i of pack.incidents?.items || []) {
      doc.fontSize(9).text(`${i.title} (${i.category}/${i.severity}/${i.status})`);
    }

    doc.end();
  }

  async auditCsv(user: AuthUser, fromIso: string, toIso: string, res: Response, req?: Request) {
    const from = new Date(fromIso);
    const to = new Date(toIso);
    const rows = await this.prisma.db.auditLog.findMany({
      where: {
        tenantId: user.tenantId,
        createdAt: { gte: from, lte: to },
      },
      orderBy: { createdAt: 'desc' },
      take: 5000,
      include: {
        actor: { select: { email: true, firstName: true, lastName: true, role: true } },
      },
    });

    await this.audit.logForUser(
      user,
      'report.download',
      'AuditLog',
      null,
      { kind: 'audit_csv', from: fromIso, to: toIso, count: rows.length },
      req,
    );

    const header = 'createdAt,actor,role,action,resourceType,resourceId,ip\n';
    const lines = rows.map((r) => {
      const actor = r.actor
        ? `${r.actor.firstName} ${r.actor.lastName} <${r.actor.email}>`
        : '';
      return [
        r.createdAt.toISOString(),
        csvEscape(actor),
        r.actor?.role || '',
        csvEscape(r.action),
        csvEscape(r.resourceType),
        r.resourceId || '',
        r.ip || '',
      ].join(',');
    });
    const body = header + lines.join('\n');
    const filename = `Audit_${fromIso.slice(0, 10)}_${toIso.slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(body);
  }

  private pipePdf(res: Response, doc: PDFKit.PDFDocument, filename: string) {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    doc.pipe(res);
  }
}

function csvEscape(value: string) {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}
