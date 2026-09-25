/**
 * Upsert CBHS incident reports from docs/source/loving-garden/*_cbhs_*.json
 * (parsed from Bill August/September + Raysheal Aug–Sep Word incidence reports).
 */
import { createCipheriv, randomBytes } from 'crypto';
import { IncidentCategory, IncidentSeverity, Prisma, PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();
const PREFIX = 'enc:v1:';

type CbhsSeedDoc = {
  documentTitle: string;
  client: {
    fullLegalName: string;
    dateOfBirth: string;
    providerOneId: string;
    facilityName: string;
    facilityAddress: string;
    tierLevel: string;
    monthYearServices: string;
    caregiverInitials: string;
  };
  entries: Array<{
    id: string;
    date: string;
    timeInterval: string;
    behaviorObserved: string;
    interventionApplied: string;
  }>;
  source?: string;
  seed: {
    title: string;
    occurredAt: string;
    category: keyof typeof IncidentCategory;
    severity: keyof typeof IncidentSeverity;
    clientEventId: string;
  };
};

function loadEnv() {
  const envPath = path.resolve(__dirname, '../.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

function phiKey(): Buffer {
  const raw = (process.env.PHI_FIELD_KEY || '').trim().replace(/^["']|["']$/g, '');
  if (!raw) return Buffer.from('0123456789abcdef0123456789abcdef', 'utf8');
  const buf = Buffer.from(raw, 'base64');
  if (buf.length !== 32) {
    console.warn(`PHI_FIELD_KEY invalid length (${buf.length}); using fallback`);
    return Buffer.from('0123456789abcdef0123456789abcdef', 'utf8');
  }
  return buf;
}

function encrypt(plaintext: string, key: Buffer): string {
  if (plaintext.startsWith(PREFIX)) return plaintext;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

function readJson<T>(rel: string): T {
  const p = path.resolve(__dirname, '../../../', rel);
  return JSON.parse(fs.readFileSync(p, 'utf8')) as T;
}

function buildNarrative(doc: CbhsSeedDoc): string {
  const filled = doc.entries.filter(
    (e) => e.behaviorObserved.trim() || e.interventionApplied.trim(),
  );
  const head = filled
    .slice(0, 8)
    .map(
      (e) =>
        `${e.date} ${e.timeInterval}: ${e.behaviorObserved} → ${e.interventionApplied}`,
    )
    .join('\n');
  return (
    head ||
    `CBHS note / incident log (${doc.client.monthYearServices}, ${filled.length} entries)`
  );
}

function formPayload(doc: CbhsSeedDoc): Prisma.InputJsonValue {
  return {
    documentTitle: doc.documentTitle,
    client: doc.client,
    entries: doc.entries,
    sourceDoc: doc.source
      ? `docs/source/loving-garden/${doc.source}`
      : undefined,
  } as Prisma.InputJsonValue;
}

const JOBS: Array<{
  json: string;
  residentMatch: {
    lastName: string;
    firstNameContains?: string;
    mrn?: string;
  };
}> = [
  {
    json: 'docs/source/loving-garden/william_kershner_cbhs_august_2026.json',
    residentMatch: { lastName: 'Kershner', firstNameContains: 'William', mrn: 'LGAFH005' },
  },
  {
    json: 'docs/source/loving-garden/william_kershner_cbhs_september_2026.json',
    residentMatch: { lastName: 'Kershner', firstNameContains: 'William', mrn: 'LGAFH005' },
  },
  {
    json: 'docs/source/loving-garden/raysheal_ellis_cbhs_aug_sep_2026.json',
    residentMatch: { lastName: 'Ellis', firstNameContains: 'Raysheal', mrn: 'LGAFH006' },
  },
];

async function main() {
  loadEnv();
  const key = phiKey();
  await prisma.$executeRaw`SELECT set_config('app.bypass_rls', 'on', false)`;

  const tenant = await prisma.tenant.findFirst({ where: { name: 'Loving Garden AFH' } });
  if (!tenant) throw new Error('Loving Garden AFH not found — run seed-loving-garden.ts first');

  const reporter =
    (await prisma.user.findFirst({
      where: { tenantId: tenant.id, email: 'lovinggardenafh@gmail.com', isActive: true },
    })) ||
    (await prisma.user.findFirst({
      where: { tenantId: tenant.id, email: 'care@lovinggarden.demo', isActive: true },
    })) ||
    (await prisma.user.findFirst({
      where: { tenantId: tenant.id, isActive: true },
      orderBy: { createdAt: 'asc' },
    }));
  if (!reporter) throw new Error('No active Loving Garden user to attribute incidents');

  const results: Array<Record<string, unknown>> = [];

  for (const job of JOBS) {
    const doc = readJson<CbhsSeedDoc>(job.json);
    const or: Prisma.ResidentWhereInput[] = [
      { lastName: job.residentMatch.lastName },
    ];
    if (job.residentMatch.mrn) or.push({ mrn: job.residentMatch.mrn });

    let resident = await prisma.resident.findFirst({
      where: {
        tenantId: tenant.id,
        deletedAt: null,
        OR: or,
      },
    });

    if (
      resident &&
      job.residentMatch.firstNameContains &&
      !resident.firstName.toLowerCase().includes(job.residentMatch.firstNameContains.toLowerCase()) &&
      job.residentMatch.mrn
    ) {
      resident = await prisma.resident.findFirst({
        where: { tenantId: tenant.id, deletedAt: null, mrn: job.residentMatch.mrn },
      });
    }

    if (!resident) {
      throw new Error(
        `Resident not found for ${job.json} (${job.residentMatch.lastName} / ${job.residentMatch.mrn})`,
      );
    }

    const narrative = encrypt(buildNarrative(doc), key);
    const immediateActions = doc.entries
      .map((e) => e.interventionApplied)
      .filter(Boolean)
      .slice(0, 12)
      .join('; ');

    const existing = await prisma.incident.findFirst({
      where: { tenantId: tenant.id, clientEventId: doc.seed.clientEventId },
    });

    let incidentId: string;
    if (existing) {
      await prisma.incident.update({
        where: { id: existing.id },
        data: {
          residentId: resident.id,
          reportedById: reporter.id,
          occurredAt: new Date(`${doc.seed.occurredAt}T12:00:00.000Z`),
          category: IncidentCategory[doc.seed.category],
          severity: IncidentSeverity[doc.seed.severity],
          title: doc.seed.title,
          narrative,
          immediateActions,
          formData: formPayload(doc),
          deletedAt: null,
        },
      });
      incidentId = existing.id;
    } else {
      const created = await prisma.incident.create({
        data: {
          tenantId: tenant.id,
          residentId: resident.id,
          reportedById: reporter.id,
          occurredAt: new Date(`${doc.seed.occurredAt}T12:00:00.000Z`),
          category: IncidentCategory[doc.seed.category],
          severity: IncidentSeverity[doc.seed.severity],
          title: doc.seed.title,
          narrative,
          immediateActions,
          formData: formPayload(doc),
          clientEventId: doc.seed.clientEventId,
        },
      });
      incidentId = created.id;
    }

    results.push({
      clientEventId: doc.seed.clientEventId,
      incidentId,
      resident: `${resident.firstName} ${resident.lastName}`,
      entries: doc.entries.length,
      action: existing ? 'updated' : 'created',
    });
  }

  // Point Raysheal care-plan CBHS meta at the newer incidence report
  const ellis = await prisma.resident.findFirst({
    where: { tenantId: tenant.id, deletedAt: null, mrn: 'LGAFH006' },
  });
  if (ellis) {
    const plan = await prisma.carePlan.findFirst({
      where: {
        tenantId: tenant.id,
        residentId: ellis.id,
        title: 'Negotiated Care Plan — Raysheal Ellis',
        deletedAt: null,
      },
    });
    if (plan?.formData && typeof plan.formData === 'object') {
      const form = { ...(plan.formData as Record<string, unknown>) };
      form.cbhsIncident = {
        source: 'Raysheal_Ellis_Incidence_Report.docx',
        providerOneId: '100429271WA',
        facilityAddress: '609 144th St S, Tacoma, WA 98444',
        monthYearServices: 'August–September 2026',
        caregiverInitials: 'J.M.',
        incidentClientEventId: 'raysheal_ellis_cbhs_aug_sep_2026',
      };
      await prisma.carePlan.update({
        where: { id: plan.id },
        data: { formData: form as Prisma.InputJsonValue },
      });
    }
  }

  console.log('Loving Garden CBHS incidents upserted:', results);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
