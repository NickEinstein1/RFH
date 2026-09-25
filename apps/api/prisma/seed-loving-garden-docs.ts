/**
 * Loving Garden — credentials + care plans / behavior letter from
 * "Loving garden documents/" (mirrored JSON in docs/source/loving-garden/).
 *
 * Login: lovinggardenafh@gmail.com / LovinggardenAFH_2026
 */
import { createCipheriv, randomBytes } from 'crypto';
import {
  IncidentCategory,
  IncidentSeverity,
  Prisma,
  PrismaClient,
  Role,
  Sex,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();
const PREFIX = 'enc:v1:';
const LG_LOGIN_EMAIL = 'lovinggardenafh@gmail.com';
const LG_LOGIN_PASSWORD = 'LovinggardenAFH_2026';

type NcpDoc = {
  source: string;
  providerName: string;
  resident: {
    firstName: string;
    lastName: string;
    preferredName?: string;
    dateOfBirth: string;
    sex: 'MALE' | 'FEMALE' | 'OTHER' | 'UNKNOWN';
    admitDate: string;
    allergies: string[];
    mrn: string;
    room: string;
    diagnoses: string[];
  };
  carePlan: {
    documentTitle: string;
    carePlanDate: string;
    carePlanUpdated?: string;
    header: Record<string, string>;
    highlights: Record<string, string>;
  };
  behaviorLetter?: {
    source: string;
    author: string;
    paragraphs: string[];
  };
};

function loadEnv() {
  const envPath = path.resolve(__dirname, '../.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let val = m[2].trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[m[1]] === undefined) process.env[m[1]] = val;
  }
}

function phiKey(): Buffer {
  const raw = (process.env.PHI_FIELD_KEY || '').trim().replace(/^["']|["']$/g, '');
  if (!raw) return Buffer.from('0123456789abcdef0123456789abcdef', 'utf8');
  const buf = Buffer.from(raw, 'base64');
  if (buf.length !== 32) {
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

function parseCalendarDate(value: string): Date | null {
  const s = String(value || '').trim();
  if (!s) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
  const us = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(s);
  if (us) {
    const yyyy = us[3].length === 2 ? Number(`20${us[3]}`) : Number(us[3]);
    return new Date(Date.UTC(yyyy, Number(us[1]) - 1, Number(us[2])));
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function readJson<T>(rel: string): T {
  const p = path.resolve(__dirname, '../../../', rel);
  return JSON.parse(fs.readFileSync(p, 'utf8')) as T;
}

async function upsertResident(
  tenantId: string,
  doc: NcpDoc,
  extras?: { allergies?: string[]; admitDate?: string },
) {
  const allergies = extras?.allergies ?? doc.resident.allergies ?? [];
  const admit =
    parseCalendarDate(extras?.admitDate || doc.resident.admitDate) ||
    parseCalendarDate(doc.resident.dateOfBirth) ||
    new Date();
  const dob = parseCalendarDate(doc.resident.dateOfBirth) || new Date();

  const data = {
    firstName: doc.resident.firstName,
    lastName: doc.resident.lastName,
    sex: Sex[doc.resident.sex],
    dateOfBirth: dob,
    admitDate: admit,
    allergies,
    mrn: doc.resident.mrn,
    room: doc.resident.room,
  };

  let resident = await prisma.resident.findFirst({
    where: {
      tenantId,
      deletedAt: null,
      OR: [
        { mrn: doc.resident.mrn },
        { lastName: doc.resident.lastName, firstName: doc.resident.firstName },
      ],
    },
  });

  if (!resident) {
    resident = await prisma.resident.create({ data: { tenantId, ...data } });
  } else {
    resident = await prisma.resident.update({ where: { id: resident.id }, data });
  }
  return resident;
}

async function upsertCarePlan(
  tenantId: string,
  residentId: string,
  title: string,
  goals: string,
  formData: Prisma.InputJsonValue,
  effectiveFrom: Date,
) {
  let plan = await prisma.carePlan.findFirst({
    where: { tenantId, residentId, title, deletedAt: null },
  });
  if (!plan) {
    plan = await prisma.carePlan.create({
      data: { tenantId, residentId, title, goals, effectiveFrom, formData },
    });
  } else {
    plan = await prisma.carePlan.update({
      where: { id: plan.id },
      data: { goals, formData, effectiveFrom },
    });
  }
  return plan;
}

function ncpForm(doc: NcpDoc, sourceFolder: string): Prisma.InputJsonValue {
  return {
    documentTitle: doc.carePlan.documentTitle,
    suicideSafetyNote: '',
    assessmentSourceNote: `Source: ${sourceFolder}/${doc.source}`,
    header: {
      ...doc.carePlan.header,
      providerName: doc.providerName || 'Jane Mburu',
    },
    highlights: doc.carePlan.highlights,
    diagnoses: doc.resident.diagnoses,
    preferredName: doc.resident.preferredName || doc.resident.firstName,
    sourceDoc: `${sourceFolder}/${doc.source}`,
    signatureMeta: {
      admissionDate: doc.resident.admitDate,
      negotiatedCarePlanDate: doc.carePlan.carePlanDate,
      carePlanUpdated: doc.carePlan.carePlanUpdated || '',
    },
    signatures: [
      {
        role: 'PROVIDER',
        name: doc.providerName || 'Jane Mburu',
        signedAt: '',
        reviewDate: doc.carePlan.carePlanDate,
      },
      {
        role: 'RESIDENT',
        name: `${doc.resident.lastName}, ${doc.resident.firstName}`,
        signedAt: '',
        reviewDate: '',
      },
    ],
  } as Prisma.InputJsonValue;
}

async function main() {
  loadEnv();
  const key = phiKey();
  await prisma.$executeRaw`SELECT set_config('app.bypass_rls', 'on', false)`;

  const tenantName = 'Loving Garden AFH';
  const tenant = await prisma.tenant.findFirst({ where: { name: tenantName } });
  if (!tenant) throw new Error(`${tenantName} not found — run seed-loving-garden.ts first`);

  const passwordHash = await bcrypt.hash(LG_LOGIN_PASSWORD, 12);

  // Primary login: Jane Mburu as OWNER at facility Gmail
  const legacyCare = await prisma.user.findFirst({
    where: { tenantId: tenant.id, email: 'care@lovinggarden.demo' },
  });
  const existingGmail = await prisma.user.findFirst({
    where: { tenantId: tenant.id, email: LG_LOGIN_EMAIL },
  });

  let primary;
  if (existingGmail) {
    primary = await prisma.user.update({
      where: { id: existingGmail.id },
      data: {
        firstName: 'Jane',
        lastName: 'Mburu',
        role: Role.OWNER,
        isActive: true,
        passwordHash,
      },
    });
    if (legacyCare && legacyCare.id !== existingGmail.id) {
      await prisma.user.update({
        where: { id: legacyCare.id },
        data: { isActive: false, passwordHash },
      });
    }
  } else if (legacyCare) {
    primary = await prisma.user.update({
      where: { id: legacyCare.id },
      data: {
        email: LG_LOGIN_EMAIL,
        firstName: 'Jane',
        lastName: 'Mburu',
        role: Role.OWNER,
        isActive: true,
        passwordHash,
      },
    });
  } else {
    primary = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: LG_LOGIN_EMAIL,
        passwordHash,
        role: Role.OWNER,
        firstName: 'Jane',
        lastName: 'Mburu',
        isActive: true,
      },
    });
  }

  // Keep other demo LG accounts usable with the new facility password
  for (const email of ['owner@lovinggarden.demo', 'nurse@lovinggarden.demo']) {
    const u = await prisma.user.findFirst({ where: { tenantId: tenant.id, email } });
    if (u) {
      await prisma.user.update({
        where: { id: u.id },
        data: { passwordHash, isActive: true },
      });
    }
  }

  const folder = 'Loving garden documents';
  const results: Record<string, unknown> = {
    login: { email: LG_LOGIN_EMAIL, role: primary.role, userId: primary.id },
  };

  // Cody
  const codyDoc = readJson<NcpDoc>('docs/source/loving-garden/cody_devries_ncp.json');
  const cody = await upsertResident(tenant.id, codyDoc);
  const codyPlan = await upsertCarePlan(
    tenant.id,
    cody.id,
    'Negotiated Care Plan — Cody Devries',
    [
      codyDoc.carePlan.highlights.medManagement,
      codyDoc.carePlan.highlights.behavior,
      codyDoc.carePlan.highlights.hygiene,
    ]
      .filter(Boolean)
      .join(' | '),
    ncpForm(codyDoc, folder),
    parseCalendarDate(codyDoc.resident.admitDate) || new Date(),
  );
  results.cody = { id: cody.id, planId: codyPlan.id, mrn: cody.mrn };

  if (codyDoc.behaviorLetter?.paragraphs?.length) {
    const clientEventId = 'cody_devries_behaviors_letter';
    const narrativePlain = codyDoc.behaviorLetter.paragraphs.join('\n\n');
    const title = 'Behavior concerns letter — Cody Devries (signed)';
    const formData = {
      documentTitle: 'Behavior concerns letter to Home and Community Services',
      client: {
        fullLegalName: 'Cody Devries',
        dateOfBirth: codyDoc.resident.dateOfBirth,
        facilityName: 'Loving Garden AFH LLC - 01',
        facilityAddress: '609 144th St S, Tacoma, WA 98444',
        caregiverInitials: 'J.M.',
        monthYearServices: 'Signed behavior letter',
      },
      entries: [],
      letter: {
        author: codyDoc.behaviorLetter.author,
        paragraphs: codyDoc.behaviorLetter.paragraphs,
      },
      sourceDoc: `${folder}/${codyDoc.behaviorLetter.source}`,
    } as Prisma.InputJsonValue;

    const existing = await prisma.incident.findFirst({
      where: { tenantId: tenant.id, clientEventId },
    });
    const payload = {
      residentId: cody.id,
      reportedById: primary.id,
      occurredAt: new Date('2026-08-27T12:00:00.000Z'),
      category: IncidentCategory.BEHAVIOR,
      severity: IncidentSeverity.HIGH,
      title,
      narrative: encrypt(narrativePlain.slice(0, 4000), key),
      immediateActions:
        'Request increased behavioral support / dedicated staffing; escalate to HCS',
      formData,
      deletedAt: null as Date | null,
    };
    if (existing) {
      await prisma.incident.update({ where: { id: existing.id }, data: payload });
      results.codyLetter = { id: existing.id, action: 'updated' };
    } else {
      const created = await prisma.incident.create({
        data: { tenantId: tenant.id, clientEventId, ...payload },
      });
      results.codyLetter = { id: created.id, action: 'created' };
    }
  }

  // Julia
  const juliaDoc = readJson<NcpDoc>('docs/source/loving-garden/julia_jager_ncp.json');
  const julia = await upsertResident(tenant.id, juliaDoc);
  const juliaPlan = await upsertCarePlan(
    tenant.id,
    julia.id,
    'Negotiated Care Plan — Julia Jager',
    [
      juliaDoc.carePlan.highlights.medManagement,
      juliaDoc.carePlan.highlights.mobility,
      juliaDoc.carePlan.highlights.evacuation,
    ]
      .filter(Boolean)
      .join(' | '),
    ncpForm(juliaDoc, folder),
    parseCalendarDate(juliaDoc.resident.dateOfBirth) || new Date(),
  );
  results.julia = { id: julia.id, planId: juliaPlan.id, mrn: julia.mrn };

  // William NCP
  const willDoc = readJson<NcpDoc>('docs/source/loving-garden/william_kershner_ncp.json');
  const william = await upsertResident(tenant.id, willDoc);
  const willPlan = await upsertCarePlan(
    tenant.id,
    william.id,
    'Negotiated Care Plan — William Kershner',
    [
      willDoc.carePlan.highlights.medManagement,
      willDoc.carePlan.highlights.mobility,
      willDoc.carePlan.highlights.communication,
    ]
      .filter(Boolean)
      .join(' | '),
    ncpForm(willDoc, folder),
    parseCalendarDate(willDoc.resident.admitDate) || new Date(),
  );
  results.william = { id: william.id, planId: willPlan.id, mrn: william.mrn };

  // Steven — resident info + NCP refresh
  const stevenInfo = readJson<{
    resident: {
      firstName: string;
      lastName: string;
      preferredName: string;
      dateOfBirth: string;
      sex: 'MALE' | 'FEMALE' | 'OTHER' | 'UNKNOWN';
      admitDate: string;
      allergies: string[];
      diagnoses: string[];
      mrn: string;
      room: string;
    };
    primaryContact: Record<string, string>;
    secondaryContact: Record<string, string>;
    mortuary?: Record<string, string>;
  }>('docs/source/loving-garden/steven_watson_resident_info.json');

  const stevenDoc = readJson<NcpDoc>('docs/source/loving-garden/steven_watson_ncp.json');
  stevenDoc.resident.allergies = stevenInfo.resident.allergies;
  stevenDoc.resident.diagnoses = stevenInfo.resident.diagnoses;

  const steven = await upsertResident(tenant.id, stevenDoc, {
    allergies: stevenInfo.resident.allergies,
    admitDate: stevenInfo.resident.admitDate,
  });

  const stevenForm = {
    ...((ncpForm(stevenDoc, folder) as Record<string, unknown>) || {}),
    residentInfoSheet: {
      source: `${folder}/Steven_Watson_Resident_Information_Sheet.docx`,
      preferredName: stevenInfo.resident.preferredName,
      primaryContact: stevenInfo.primaryContact,
      secondaryContact: stevenInfo.secondaryContact,
      mortuary: stevenInfo.mortuary || null,
    },
  } as Prisma.InputJsonValue;

  const stevenPlan = await upsertCarePlan(
    tenant.id,
    steven.id,
    'Negotiated Care Plan — Steven Watson',
    [
      stevenDoc.carePlan.highlights.mobility,
      stevenDoc.carePlan.highlights.medManagement,
      stevenDoc.carePlan.highlights.pain,
    ]
      .filter(Boolean)
      .join(' | '),
    stevenForm,
    parseCalendarDate(stevenDoc.resident.admitDate) || new Date(),
  );
  results.steven = { id: steven.id, planId: stevenPlan.id, mrn: steven.mrn };

  // Raysheal NCP refresh (existing JSON)
  const ellisDoc = readJson<NcpDoc & { cbhsIncident?: Record<string, string> }>(
    'docs/source/loving-garden/raysheal_ellis_ncp.json',
  );
  const ellis = await upsertResident(tenant.id, ellisDoc);
  const ellisForm = {
    ...((ncpForm(ellisDoc, folder) as Record<string, unknown>) || {}),
    cbhsIncident: ellisDoc.cbhsIncident || null,
  } as Prisma.InputJsonValue;
  const ellisPlan = await upsertCarePlan(
    tenant.id,
    ellis.id,
    'Negotiated Care Plan — Raysheal Ellis',
    [
      ellisDoc.carePlan.highlights.medManagement,
      ellisDoc.carePlan.highlights.evacuation,
    ]
      .filter(Boolean)
      .join(' | '),
    ellisForm,
    parseCalendarDate(ellisDoc.resident.admitDate) || new Date(),
  );
  results.raysheal = { id: ellis.id, planId: ellisPlan.id, mrn: ellis.mrn };

  console.log('Loving Garden documents applied:', results);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
