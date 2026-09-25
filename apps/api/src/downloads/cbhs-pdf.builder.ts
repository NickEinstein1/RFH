import PDFDocument from 'pdfkit';
import { formatUsDate } from '../common/time/us-date';

type CbhsClient = {
  fullLegalName?: string;
  dateOfBirth?: string;
  providerOneId?: string;
  facilityName?: string;
  facilityAddress?: string;
  tierLevel?: string;
  monthYearServices?: string;
  caregiverInitials?: string;
};

type CbhsEntry = {
  date?: string;
  timeInterval?: string;
  behaviorObserved?: string;
  interventionApplied?: string;
};

export type CbhsPdfInput = {
  documentTitle?: string;
  client?: CbhsClient;
  entries?: CbhsEntry[];
  letter?: { author?: string; paragraphs?: string[] };
  /** Fallback when formData has no behavior rows */
  narrativeFallback?: string;
  meta?: {
    status?: string;
    severity?: string;
    category?: string;
  };
};

const MARGIN = 36;
const TITLE = 'Community Behavioral Health Supports (CBHS)';

const CLIENT_FIELDS: Array<{ key: keyof CbhsClient; label: string }> = [
  { key: 'fullLegalName', label: 'Full legal name of resident' },
  { key: 'dateOfBirth', label: "Client's date of birth" },
  { key: 'providerOneId', label: 'ProviderOne ID' },
  { key: 'facilityName', label: 'Facility providing services' },
  { key: 'facilityAddress', label: 'Facility address' },
  { key: 'tierLevel', label: 'Tier level' },
  { key: 'monthYearServices', label: 'Month & year CBHS services provided' },
  { key: 'caregiverInitials', label: 'Caregiver initials' },
];

/** Format stored MM/DD/YYYY (or ISO) like the Word form: "Aug 1". */
export function formatCbhsLogDate(value: string | undefined): string {
  if (!value) return '';
  const s = String(value).trim();
  const us = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(s);
  if (us) {
    const mm = Number(us[1]);
    const dd = Number(us[2]);
    const yyyy = us[3].length === 2 ? Number(`20${us[3]}`) : Number(us[3]);
    const d = new Date(Date.UTC(yyyy, mm - 1, dd));
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      });
    }
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) {
    const d = new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      });
    }
  }
  // Already "Aug 1" / "August 1" style
  if (/^[A-Za-z]{3,9}\s+\d{1,2}\b/.test(s)) return s;
  return s;
}

function dash(value: string | undefined | null): string {
  const v = (value ?? '').toString().trim();
  return v || '—';
}

function drawSectionTitle(doc: PDFKit.PDFDocument, text: string, x: number, y: number, w: number) {
  doc
    .save()
    .rect(x, y, w, 18)
    .fill('#1e3a5f');
  doc
    .fillColor('#ffffff')
    .font('Helvetica-Bold')
    .fontSize(10)
    .text(text, x + 8, y + 4, { width: w - 16, lineBreak: false });
  doc.restore();
  return y + 18;
}

/**
 * Render a CBHS note PDF matching the original Word form:
 * title → Client Information (Field | Entry) → Behaviors table
 * (Date | Time Interval | Behavior Observed | Standard Intervention Applied).
 */
export function renderCbhsPdf(doc: PDFKit.PDFDocument, input: CbhsPdfInput) {
  const pageW = doc.page.width;
  const pageH = doc.page.height;
  const usableW = pageW - MARGIN * 2;
  const client = input.client || {};
  const entries = (input.entries || []).filter(
    (e) =>
      (e.behaviorObserved && e.behaviorObserved.trim()) ||
      (e.interventionApplied && e.interventionApplied.trim()) ||
      (e.timeInterval && e.timeInterval.trim()),
  );

  // —— Title block ——
  let y = MARGIN;
  doc
    .fillColor('#0f172a')
    .font('Helvetica-Bold')
    .fontSize(16)
    .text(TITLE, MARGIN, y, { width: usableW, align: 'center' });
  y = doc.y + 4;

  const subtitle = (input.documentTitle || '').replace(TITLE, '').replace(/^[\s—\-–]+/, '').trim();
  if (subtitle && subtitle.toLowerCase() !== 'note / incident report') {
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#334155')
      .text(subtitle, MARGIN, y, { width: usableW, align: 'center' });
    y = doc.y + 2;
  }

  if (input.meta?.status) {
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#64748b')
      .text(
        [
          input.meta.status && `Status: ${input.meta.status}`,
          input.meta.severity && `Severity: ${input.meta.severity}`,
          input.meta.category && `Category: ${input.meta.category}`,
        ]
          .filter(Boolean)
          .join('  ·  '),
        MARGIN,
        y,
        { width: usableW, align: 'center' },
      );
    y = doc.y + 8;
  } else {
    y += 6;
  }

  // —— Client Information (Field | Entry) ——
  y = drawSectionTitle(doc, 'Client Information', MARGIN, y, usableW);
  const fieldW = Math.round(usableW * 0.38);
  const entryW = usableW - fieldW;
  const clientHeaderH = 16;

  // Column headers
  doc.save().rect(MARGIN, y, fieldW, clientHeaderH).fill('#e2e8f0');
  doc.rect(MARGIN + fieldW, y, entryW, clientHeaderH).fill('#e2e8f0');
  doc.restore();
  doc
    .strokeColor('#94a3b8')
    .lineWidth(0.6)
    .rect(MARGIN, y, usableW, clientHeaderH)
    .stroke();
  doc
    .moveTo(MARGIN + fieldW, y)
    .lineTo(MARGIN + fieldW, y + clientHeaderH)
    .stroke();
  doc
    .fillColor('#0f172a')
    .font('Helvetica-Bold')
    .fontSize(8)
    .text('Field', MARGIN + 6, y + 4, { width: fieldW - 12, lineBreak: false })
    .text('Entry', MARGIN + fieldW + 6, y + 4, { width: entryW - 12, lineBreak: false });
  y += clientHeaderH;

  for (const row of CLIENT_FIELDS) {
    let value = client[row.key];
    if (row.key === 'dateOfBirth') value = formatUsDate(value as string) || (value as string);
    const display = dash(value as string);
    doc.font('Helvetica').fontSize(8);
    const labelH = doc.heightOfString(row.label, { width: fieldW - 12 });
    const valueH = doc.heightOfString(display, { width: entryW - 12 });
    const rowH = Math.max(18, Math.ceil(Math.max(labelH, valueH)) + 8);

    if (y + rowH > pageH - MARGIN) {
      doc.addPage();
      y = MARGIN;
    }

    doc
      .strokeColor('#cbd5e1')
      .lineWidth(0.5)
      .rect(MARGIN, y, usableW, rowH)
      .stroke();
    doc
      .moveTo(MARGIN + fieldW, y)
      .lineTo(MARGIN + fieldW, y + rowH)
      .stroke();
    doc
      .fillColor('#0f172a')
      .font('Helvetica')
      .fontSize(8)
      .text(row.label, MARGIN + 6, y + 4, { width: fieldW - 12 })
      .text(display, MARGIN + fieldW + 6, y + 4, { width: entryW - 12 });
    y += rowH;
  }

  y += 12;

  // —— Behaviors table OR letter body ——
  const letterParas = input.letter?.paragraphs?.filter((p) => p && p.trim()) || [];
  if (!entries.length && letterParas.length) {
    y = drawSectionTitle(doc, 'Behaviors and Standard Interventions', MARGIN, y, usableW);
    y += 8;
    doc.fillColor('#0f172a').font('Helvetica').fontSize(9);
    for (const para of letterParas) {
      const h = doc.heightOfString(para, { width: usableW });
      if (y + h > pageH - MARGIN) {
        doc.addPage();
        y = MARGIN;
      }
      doc.text(para, MARGIN, y, { width: usableW, align: 'justify' });
      y = doc.y + 8;
    }
    if (input.letter?.author) {
      doc.font('Helvetica-Oblique').text(input.letter.author, MARGIN, y, { width: usableW });
    }
    return;
  }

  y = drawSectionTitle(doc, 'Behaviors and Standard Interventions', MARGIN, y, usableW);

  // Column proportions match the Word log
  const cols = {
    date: Math.round(usableW * 0.09),
    time: Math.round(usableW * 0.18),
    behavior: Math.round(usableW * 0.365),
    intervention: 0,
  };
  cols.intervention = usableW - cols.date - cols.time - cols.behavior;
  const colMeta: Array<{ key: keyof typeof cols; label: string; w: number }> = [
    { key: 'date', label: 'Date', w: cols.date },
    { key: 'time', label: 'Time Interval', w: cols.time },
    { key: 'behavior', label: 'Behavior Observed', w: cols.behavior },
    {
      key: 'intervention',
      label: 'Standard Intervention Applied (First-Person)',
      w: cols.intervention,
    },
  ];

  const drawBehaviorHeader = (top: number) => {
    const headerH = 28;
    doc.save().rect(MARGIN, top, usableW, headerH).fill('#e2e8f0');
    doc.restore();
    doc.strokeColor('#64748b').lineWidth(0.7).rect(MARGIN, top, usableW, headerH).stroke();
    let x = MARGIN;
    for (const c of colMeta) {
      doc
        .fillColor('#0f172a')
        .font('Helvetica-Bold')
        .fontSize(7.5)
        .text(c.label, x + 4, top + 6, { width: c.w - 8, align: 'left' });
      x += c.w;
      if (x < MARGIN + usableW) {
        doc
          .strokeColor('#94a3b8')
          .moveTo(x, top)
          .lineTo(x, top + headerH)
          .stroke();
      }
    }
    return top + headerH;
  };

  y = drawBehaviorHeader(y);

  if (!entries.length) {
    const fallback =
      (input.narrativeFallback || '').trim() || 'No behavior rows recorded.';
    const h = Math.max(40, doc.heightOfString(fallback, { width: usableW - 12 }) + 12);
    doc.strokeColor('#cbd5e1').rect(MARGIN, y, usableW, h).stroke();
    doc
      .fillColor('#0f172a')
      .font('Helvetica')
      .fontSize(8)
      .text(fallback, MARGIN + 6, y + 6, { width: usableW - 12 });
    return;
  }

  let lastDateKey = '';
  for (const entry of entries) {
    const dateKey = (entry.date || '').trim();
    const showDate = dateKey !== lastDateKey;
    if (showDate) lastDateKey = dateKey;

    const cells = [
      showDate ? formatCbhsLogDate(entry.date) : '',
      dash(entry.timeInterval).replace(/^—$/, ''),
      (entry.behaviorObserved || '').trim(),
      (entry.interventionApplied || '').trim(),
    ];

    doc.font('Helvetica').fontSize(7.5);
    const heights = cells.map((text, i) =>
      Math.ceil(doc.heightOfString(text || ' ', { width: colMeta[i].w - 8 })),
    );
    const rowH = Math.max(22, Math.max(...heights) + 8);

    if (y + rowH > pageH - MARGIN) {
      doc.addPage();
      y = MARGIN;
      y = drawBehaviorHeader(y);
    }

    // Light zebra for readability
    if (showDate) {
      doc.save().rect(MARGIN, y, usableW, rowH).fill('#f8fafc');
      doc.restore();
    }

    doc.strokeColor('#cbd5e1').lineWidth(0.4).rect(MARGIN, y, usableW, rowH).stroke();
    let x = MARGIN;
    for (let i = 0; i < colMeta.length; i++) {
      const c = colMeta[i];
      doc
        .fillColor('#0f172a')
        .font(i === 0 && showDate ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(7.5)
        .text(cells[i] || '', x + 4, y + 4, { width: c.w - 8, align: 'left' });
      x += c.w;
      if (x < MARGIN + usableW) {
        doc
          .strokeColor('#cbd5e1')
          .moveTo(x, y)
          .lineTo(x, y + rowH)
          .stroke();
      }
    }
    y += rowH;
  }

  // Footer note on last page
  doc
    .font('Helvetica-Oblique')
    .fontSize(7)
    .fillColor('#64748b')
    .text(
      'Standard interventions recorded in first person, matching the CBHS note form.',
      MARGIN,
      Math.min(y + 10, pageH - MARGIN - 10),
      { width: usableW },
    );
}
