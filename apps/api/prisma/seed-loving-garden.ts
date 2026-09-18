/**
 * Seed Loving Garden AFH from mar_extracted_orders.json (September 2026 MAR).
 */
import { PrismaClient, Role, Sex } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

type MarOrder = {
  medication: string;
  brand?: string;
  imprint?: string;
  rx_number?: string;
  prescriber?: string;
  start_date: string;
  admin_times: string[];
  sig: string;
  dose: string;
  prn: boolean;
  category?: string;
  high_alert?: boolean;
  notes?: string;
};

type MarResident = {
  name: string;
  dob: string;
  patient_no: string;
  allergies: string | string[];
  diagnoses: string[];
  medication_orders: MarOrder[];
};

function parseName(name: string) {
  const [last, first] = name.split(',').map((s) => s.trim());
  return { firstName: first || name, lastName: last || name };
}

function parseDob(dob: string) {
  // MM/DD/YYYY
  const [mm, dd, yyyy] = dob.split('/').map(Number);
  return new Date(Date.UTC(yyyy, mm - 1, dd));
}

function parseStart(start: string) {
  // MM/DD/YYYY or MMDDYYYY — fall back to MAR month start when illegible/blank
  const fallback = new Date(Date.UTC(2026, 8, 1));
  if (!start || !String(start).trim()) return fallback;
  if (start.includes('/')) {
    const d = parseDob(start);
    return Number.isNaN(d.getTime()) ? fallback : d;
  }
  const digits = String(start).replace(/\D/g, '');
  if (digits.length !== 8) return fallback;
  const mm = Number(digits.slice(0, 2));
  const dd = Number(digits.slice(2, 4));
  const yyyy = Number(digits.slice(4, 8));
  const d = new Date(Date.UTC(yyyy, mm - 1, dd));
  return Number.isNaN(d.getTime()) ? fallback : d;
}

function normalizeTime(t: string): string | null {
  const raw = t.trim().toLowerCase();
  if (!raw || raw === 'prn') return null;
  if (raw === 'morning') return '08:00';
  if (raw === 'noon' || raw === 'midday') return '12:00';
  if (raw === 'evening' || raw === 'bedtime' || raw === 'hs') return '21:00';

  const m = raw.match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/i);
  if (!m) return null;
  let hh = Number(m[1]);
  const mm = Number(m[2]);
  const ap = (m[3] || '').toLowerCase();
  if (ap === 'pm' && hh < 12) hh += 12;
  if (ap === 'am' && hh === 12) hh = 0;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function scheduleFromOrder(order: MarOrder): string[] {
  if (order.prn) return [];
  const times = order.admin_times
    .map(normalizeTime)
    .filter((t): t is string => Boolean(t));
  // dedupe while preserving order
  return [...new Set(times)];
}

function allergiesList(a: string | string[]): string[] {
  if (Array.isArray(a)) return a;
  if (!a || /no known/i.test(a)) return [];
  return a.split(',').map((s) => s.trim()).filter(Boolean);
}

async function main() {
  await prisma.$executeRaw`SELECT set_config('app.bypass_rls', 'on', false)`;

  const jsonPath = path.resolve(__dirname, '../../../mar_extracted_orders.json');
  const mar = JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as {
    residents: MarResident[];
    mar_month: string;
  };

  const tenantName = 'Loving Garden AFH';
  let tenant = await prisma.tenant.findFirst({ where: { name: tenantName } });
  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: { name: tenantName, timezone: 'America/Los_Angeles' },
    });
  }

  const passwordHash = await bcrypt.hash('Password123!', 12);

  const users = [
    { email: 'owner@lovinggarden.demo', role: Role.OWNER, firstName: 'Logan', lastName: 'Owner' },
    { email: 'nurse@lovinggarden.demo', role: Role.NURSE, firstName: 'Nina', lastName: 'Nurse' },
    { email: 'care@lovinggarden.demo', role: Role.CAREGIVER, firstName: 'Casey', lastName: 'Caregiver' },
  ] as const;

  for (const u of users) {
    await prisma.user.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email: u.email } },
      update: {},
      create: {
        tenantId: tenant.id,
        email: u.email,
        passwordHash,
        role: u.role,
        firstName: u.firstName,
        lastName: u.lastName,
      },
    });
  }

  let orderCount = 0;
  for (const r of mar.residents) {
    const { firstName, lastName } = parseName(r.name);
    let resident = await prisma.resident.findFirst({
      where: {
        tenantId: tenant.id,
        mrn: r.patient_no,
        deletedAt: null,
      },
    });
    // mrn may be encrypted — also match by name
    if (!resident) {
      resident = await prisma.resident.findFirst({
        where: { tenantId: tenant.id, firstName, lastName, deletedAt: null },
      });
    }
    if (!resident) {
      resident = await prisma.resident.create({
        data: {
          tenantId: tenant.id,
          firstName,
          lastName,
          dateOfBirth: parseDob(r.dob),
          sex: Sex.UNKNOWN,
          mrn: r.patient_no,
          room: r.patient_no.replace('LGAFH', ''),
          admitDate: new Date('2024-01-01'),
          allergies: allergiesList(r.allergies),
        },
      });
    } else {
      resident = await prisma.resident.update({
        where: { id: resident.id },
        data: {
          allergies: allergiesList(r.allergies),
          mrn: r.patient_no,
          room: r.patient_no.replace('LGAFH', ''),
        },
      });
    }

    // Replace active orders for clean MAR import
    await prisma.medicationOrder.updateMany({
      where: { tenantId: tenant.id, residentId: resident.id, deletedAt: null },
      data: { deletedAt: new Date(), status: 'DISCONTINUED' },
    });

    for (const o of r.medication_orders) {
      const scheduleTimes = scheduleFromOrder(o);
      await prisma.medicationOrder.create({
        data: {
          tenantId: tenant.id,
          residentId: resident.id,
          drugName: o.medication,
          dose: o.dose || '1',
          route: /apply|cream|gel|patch|topical|ointment|ear|nasal|neb|film/i.test(o.medication + ' ' + o.sig)
            ? 'TOP'
            : 'PO',
          frequency: o.sig,
          scheduleTimes,
          startDate: parseStart(o.start_date),
          isPrn: Boolean(o.prn),
          instructions: [o.sig, o.notes].filter(Boolean).join(' | ') || null,
          brand: o.brand || null,
          rxNumber: o.rx_number || null,
          imprint: o.imprint || null,
          categoryLabel: o.category || null,
          prescriber: o.prescriber || null,
          highAlert: Boolean(o.high_alert),
        },
      });
      orderCount += 1;
    }
  }

  console.log('Loving Garden AFH seeded:', {
    tenant: tenantName,
    residents: mar.residents.length,
    orders: orderCount,
    month: mar.mar_month,
    logins: users.map((u) => u.email),
    password: 'Password123!',
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
