import PDFDocument from 'pdfkit';
import { formatUsDate, formatUsMonth } from '../common/time/us-date';

type MarCell = {
  day: number;
  mark: string;
  initials: string | null;
};

type MarSheet = {
  facilityName: string;
  month: string;
  daysInMonth: number;
  dayNumbers: number[];
  resident: {
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    mrn: string | null;
    allergies: string[];
    room: string | null;
  };
  rows: Array<{
    order: {
      drugName: string;
      dose: string;
      route: string;
      frequency: string;
      instructions: string | null;
      brand: string | null;
      rxNumber: string | null;
      imprint: string | null;
      categoryLabel: string | null;
      prescriber: string | null;
      highAlert: boolean;
      isPrn: boolean;
      startDate: string;
    };
    timeRows: Array<{ time: string; cells: MarCell[] }>;
  }>;
  backPage: {
    title: string;
    prnEntries: Array<{
      date: string;
      time: string;
      medication: string;
      dose: string;
      routeSite: string;
      reason: string;
      bmi: string;
      result: string;
      mse: string;
      initials: string;
      signature: string;
    }>;
    staffSignatureKey: Array<{ initials: string; signature: string }>;
  };
};

type FlatRow = {
  order: MarSheet['rows'][0]['order'];
  time: string;
  cells: MarCell[];
  showMed: boolean;
};

export function renderMarPdf(doc: PDFKit.PDFDocument, sheet: MarSheet) {
  const flat: FlatRow[] = [];
  for (const row of sheet.rows) {
    row.timeRows.forEach((tr, idx) => {
      flat.push({
        order: row.order,
        time: tr.time,
        cells: tr.cells,
        showMed: idx === 0,
      });
    });
  }

  const pageMargin = 28;
  const pageW = doc.page.width;
  const pageH = doc.page.height;
  const usableW = pageW - pageMargin * 2;
  const days = sheet.dayNumbers;
  const medW = 168;
  const qtyW = 42;
  const timeW = 38;
  const dayW = Math.max(14, (usableW - medW - qtyW - timeW) / Math.max(days.length, 1));
  const headerH = 78;
  const rowH = 28;
  const tableTop = pageMargin + headerH;
  const rowsPerPage = Math.max(8, Math.floor((pageH - tableTop - pageMargin - 18) / rowH));

  const chunks: FlatRow[][] = [];
  for (let i = 0; i < flat.length; i += rowsPerPage) {
    chunks.push(flat.slice(i, i + rowsPerPage));
  }
  if (!chunks.length) chunks.push([]);

  chunks.forEach((chunk, pageIdx) => {
    if (pageIdx > 0) doc.addPage({ size: 'LETTER', layout: 'landscape', margin: pageMargin });
    drawFrontHeader(doc, sheet, pageMargin, usableW);
    drawFrontTableHeader(doc, days, pageMargin, tableTop, medW, qtyW, timeW, dayW, rowH);
    let y = tableTop + rowH;
    for (const fr of chunk) {
      drawFrontDataRow(doc, fr, days, pageMargin, y, medW, qtyW, timeW, dayW, rowH);
      y += rowH;
    }
    if (!chunk.length) {
      doc
        .fontSize(10)
        .fillColor('#444')
        .text('No active medication orders for this patient this month.', pageMargin, y + 8);
      doc.fillColor('#000');
    }
    doc
      .fontSize(7)
      .fillColor('#555')
      .text(
        `Page ${pageIdx + 1} of ${chunks.length} · Key: ✓ Given · X Not given · - Blank/missed`,
        pageMargin,
        pageH - pageMargin + 4,
        { width: usableW },
      );
    doc.fillColor('#000');
  });

  doc.addPage({ size: 'LETTER', layout: 'landscape', margin: pageMargin });
  drawBackPage(doc, sheet, pageMargin, usableW, pageH);
}

function drawFrontHeader(
  doc: PDFKit.PDFDocument,
  sheet: MarSheet,
  margin: number,
  usableW: number,
) {
  const left = margin;
  doc
    .fontSize(14)
    .fillColor('#0a4f44')
    .text('Medication Administration Record', left, margin, { width: usableW * 0.62 });
  doc
    .fontSize(11)
    .fillColor('#000')
    .text(`${sheet.resident.lastName}, ${sheet.resident.firstName}`, left, margin + 18, {
      width: usableW * 0.62,
    });
  doc
    .fontSize(8)
    .fillColor('#333')
    .text(
      `DOB: ${formatUsDate(sheet.resident.dateOfBirth)} · Patient No: ${sheet.resident.mrn || '—'} · Room: ${sheet.resident.room || '—'}`,
      left,
      margin + 34,
      { width: usableW * 0.62 },
    );
  doc.text(
    `Allergies: ${
      sheet.resident.allergies?.length
        ? sheet.resident.allergies.join(', ')
        : 'No Known Allergies'
    }`,
    left,
    margin + 46,
    { width: usableW * 0.62 },
  );
  doc.text(`Month: ${formatUsMonth(sheet.month)}`, left, margin + 58, {
    width: usableW * 0.62,
  });

  doc
    .fontSize(8)
    .fillColor('#555')
    .text('Facility', margin + usableW * 0.64, margin, { width: usableW * 0.36, align: 'right' });
  doc
    .fontSize(11)
    .fillColor('#0a4f44')
    .text(sheet.facilityName, margin + usableW * 0.64, margin + 14, {
      width: usableW * 0.36,
      align: 'right',
    });
  doc
    .fontSize(7)
    .fillColor('#666')
    .text('DO NOT REMOVE IF ATTACHED TO MED PACK', margin + usableW * 0.64, margin + 34, {
      width: usableW * 0.36,
      align: 'right',
    });
  doc.fillColor('#000');
}

function drawFrontTableHeader(
  doc: PDFKit.PDFDocument,
  days: number[],
  x0: number,
  y: number,
  medW: number,
  qtyW: number,
  timeW: number,
  dayW: number,
  rowH: number,
) {
  doc.rect(x0, y, medW + qtyW + timeW + dayW * days.length, rowH).fillAndStroke('#e8f2ee', '#8aa89e');
  doc.fillColor('#000').fontSize(7).font('Helvetica-Bold');
  let x = x0;
  doc.text('Medication / directions', x + 2, y + 8, { width: medW - 4 });
  x += medW;
  doc.text('QTY', x + 2, y + 8, { width: qtyW - 4, align: 'center' });
  x += qtyW;
  doc.text('Time', x + 2, y + 8, { width: timeW - 4, align: 'center' });
  x += timeW;
  for (const d of days) {
    doc.text(String(d), x, y + 8, { width: dayW, align: 'center' });
    x += dayW;
  }
  doc.font('Helvetica');
}

function drawFrontDataRow(
  doc: PDFKit.PDFDocument,
  fr: FlatRow,
  days: number[],
  x0: number,
  y: number,
  medW: number,
  qtyW: number,
  timeW: number,
  dayW: number,
  rowH: number,
) {
  const totalW = medW + qtyW + timeW + dayW * days.length;
  doc.rect(x0, y, totalW, rowH).stroke('#b7c7c1');
  let x = x0;

  if (fr.showMed) {
    const lines = [
      `${fr.order.highAlert ? '(H) ' : ''}${fr.order.drugName}${fr.order.isPrn ? ' PRN' : ''}`,
      fr.order.categoryLabel ? `*** ${fr.order.categoryLabel} ***` : '',
      fr.order.frequency || '',
      fr.order.rxNumber
        ? `Rx: ${fr.order.rxNumber}${fr.order.prescriber ? ` · MD: ${fr.order.prescriber}` : ''}`
        : '',
      `Start: ${formatUsDate(fr.order.startDate)}`,
    ].filter(Boolean);
    doc.fontSize(6).fillColor('#000').text(lines.join('\n'), x + 2, y + 2, {
      width: medW - 4,
      height: rowH - 3,
      lineGap: 0.5,
    });
  }
  doc
    .moveTo(x + medW, y)
    .lineTo(x + medW, y + rowH)
    .stroke('#b7c7c1');
  x += medW;

  if (fr.showMed) {
    doc.fontSize(7).text(fr.order.dose, x + 1, y + 8, { width: qtyW - 2, align: 'center' });
  }
  doc
    .moveTo(x + qtyW, y)
    .lineTo(x + qtyW, y + rowH)
    .stroke('#b7c7c1');
  x += qtyW;

  doc.fontSize(7).text(fr.time, x + 1, y + 8, { width: timeW - 2, align: 'center' });
  doc
    .moveTo(x + timeW, y)
    .lineTo(x + timeW, y + rowH)
    .stroke('#b7c7c1');
  x += timeW;

  for (const d of days) {
    const cell = fr.cells.find((c) => c.day === d);
    const mark = cell?.mark || '-';
    doc.fontSize(8).text(mark, x, y + 5, { width: dayW, align: 'center' });
    if (cell?.initials && mark === '✓') {
      doc.fontSize(5).fillColor('#444').text(cell.initials, x, y + 15, {
        width: dayW,
        align: 'center',
      });
      doc.fillColor('#000');
    }
    doc
      .moveTo(x + dayW, y)
      .lineTo(x + dayW, y + rowH)
      .stroke('#d5e0db');
    x += dayW;
  }
}

function drawBackPage(
  doc: PDFKit.PDFDocument,
  sheet: MarSheet,
  margin: number,
  usableW: number,
  pageH: number,
) {
  doc
    .fontSize(12)
    .fillColor('#0a4f44')
    .text(sheet.backPage?.title || 'PRN / As-Needed Medication Log (Back of MAR)', margin, margin);
  doc
    .fontSize(8)
    .fillColor('#000')
    .text(
      `${sheet.facilityName} · ${sheet.resident.lastName}, ${sheet.resident.firstName} · DOB ${formatUsDate(sheet.resident.dateOfBirth)} · ${formatUsMonth(sheet.month)}`,
      margin,
      margin + 16,
      { width: usableW },
    );

  doc
    .fontSize(7)
    .fillColor('#333')
    .text(
      '(H) = Hazardous · Pain 0–10 · BMI codes A–H · Result N/E/I/M · MSE A–L / N/A · Emergency 911 · Poison (800) 222-1222',
      margin,
      margin + 28,
      { width: usableW },
    );

  const cols = [
    { key: 'date', label: 'DATE', w: 58 },
    { key: 'time', label: 'TIME', w: 40 },
    { key: 'medication', label: 'MEDICATION', w: 110 },
    { key: 'dose', label: 'DOSE', w: 48 },
    { key: 'routeSite', label: 'ROUTE/SITE', w: 70 },
    { key: 'reason', label: 'REASON', w: 90 },
    { key: 'bmi', label: 'BMI', w: 36 },
    { key: 'result', label: 'RESULT', w: 48 },
    { key: 'mse', label: 'MSE', w: 40 },
    { key: 'signature', label: 'SIGNATURE', w: usableW - 540 },
  ] as const;

  const tableTop = margin + 44;
  const rowH = 18;
  let x = margin;
  doc.rect(margin, tableTop, usableW, rowH).fillAndStroke('#e8f2ee', '#8aa89e');
  doc.fillColor('#000').fontSize(6).font('Helvetica-Bold');
  for (const c of cols) {
    doc.text(c.label, x + 2, tableTop + 5, { width: c.w - 4 });
    x += c.w;
  }
  doc.font('Helvetica');

  const entries = [...(sheet.backPage?.prnEntries || [])];
  const minRows = Math.max(12, entries.length);
  while (entries.length < minRows) {
    entries.push({
      date: '',
      time: '',
      medication: '',
      dose: '',
      routeSite: '',
      reason: '',
      bmi: '',
      result: '',
      mse: '',
      initials: '',
      signature: '',
    });
  }

  let y = tableTop + rowH;
  for (const e of entries.slice(0, 22)) {
    x = margin;
    doc.rect(margin, y, usableW, rowH).stroke('#b7c7c1');
    const vals = [
      e.date ? formatUsDate(e.date) : '',
      e.time || '',
      e.medication || '',
      e.dose || '',
      e.routeSite || '',
      e.reason || '',
      e.bmi || '',
      e.result || '',
      e.mse || '',
      e.signature || e.initials || '',
    ];
    doc.fontSize(6).fillColor('#000');
    cols.forEach((c, i) => {
      doc.text(String(vals[i] || ''), x + 2, y + 5, { width: c.w - 4, height: rowH - 4 });
      doc
        .moveTo(x + c.w, y)
        .lineTo(x + c.w, y + rowH)
        .stroke('#d5e0db');
      x += c.w;
    });
    y += rowH;
  }

  y += 12;
  doc.fontSize(9).fillColor('#0a4f44').text('Staff signature key', margin, y);
  y += 14;
  doc.fontSize(7).fillColor('#000');
  const key = sheet.backPage?.staffSignatureKey || [];
  if (!key.length) {
    doc.text('No staff initials recorded this month.', margin, y);
  } else {
    for (const s of key) {
      doc.text(`${s.initials}  —  ${s.signature}`, margin, y);
      y += 11;
      if (y > pageH - margin - 10) break;
    }
  }
}
