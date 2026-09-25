/**
 * Apply Loving Garden document updates:
 * - Caregiver Jane Mburu
 * - William Kershner resident info sheet refresh
 * - Raysheal Ellis (LGAFH006) + negotiated care plan / CBHS docs
 * - Steven Watson (LGAFH003) + negotiated care plan
 */
import { Prisma, PrismaClient, Role, Sex } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

/** Parse MM/DD/YYYY or YYYY-MM-DD as UTC calendar date. */
function parseCalendarDate(value: string): Date {
  const s = String(value).trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
  const us = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(s);
  if (us) {
    const yyyy = us[3].length === 2 ? Number(`20${us[3]}`) : Number(us[3]);
    return new Date(Date.UTC(yyyy, Number(us[1]) - 1, Number(us[2])));
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date: ${value}`);
  return d;
}

function readJson<T>(rel: string): T {
  const p = path.resolve(__dirname, '../../../', rel);
  return JSON.parse(fs.readFileSync(p, 'utf8')) as T;
}

async function main() {
  await prisma.$executeRaw`SELECT set_config('app.bypass_rls', 'on', false)`;

  const tenantName = 'Loving Garden AFH';
  const tenant = await prisma.tenant.findFirst({ where: { name: tenantName } });
  if (!tenant) throw new Error(`${tenantName} not found — run seed-loving-garden.ts first`);

  const passwordHash = await bcrypt.hash('LovinggardenAFH_2026', 12);

  // Provider login → Jane Mburu at facility Gmail
  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'lovinggardenafh@gmail.com' } },
    update: { firstName: 'Jane', lastName: 'Mburu', role: Role.OWNER, isActive: true, passwordHash },
    create: {
      tenantId: tenant.id,
      email: 'lovinggardenafh@gmail.com',
      passwordHash,
      role: Role.OWNER,
      firstName: 'Jane',
      lastName: 'Mburu',
    },
  });
  // Retire legacy demo caregiver email if still present
  await prisma.user.updateMany({
    where: { tenantId: tenant.id, email: 'care@lovinggarden.demo' },
    data: { isActive: false, passwordHash },
  });

  // Also ensure owner/nurse names stay; provider of record is Jane
  const williamDoc = readJson<{
    resident: {
      firstName: string;
      lastName: string;
      preferredName: string;
      sex: 'MALE' | 'FEMALE' | 'OTHER' | 'UNKNOWN';
      dateOfBirth: string;
      admitDate: string;
      allergies: string[];
      diagnoses: string[];
      mrn: string;
      room: string;
    };
    primaryContact: Record<string, string>;
    secondaryContact: Record<string, string>;
    physicians: Array<Record<string, unknown>>;
    preferredHospital: string;
    insurance: Record<string, unknown>;
    facilityAdmissionAgreement: Record<string, string>;
  }>('docs/source/loving-garden/william_kershner_resident_info.json');

  let william = await prisma.resident.findFirst({
    where: {
      tenantId: tenant.id,
      deletedAt: null,
      OR: [
        { lastName: 'Kershner', firstName: 'William' },
        { mrn: williamDoc.resident.mrn },
      ],
    },
  });

  const williamData = {
    firstName: williamDoc.resident.firstName,
    lastName: williamDoc.resident.lastName,
    sex: Sex[williamDoc.resident.sex],
    dateOfBirth: parseCalendarDate(williamDoc.resident.dateOfBirth),
    admitDate: parseCalendarDate(williamDoc.resident.admitDate),
    allergies: williamDoc.resident.allergies,
    mrn: williamDoc.resident.mrn,
    room: williamDoc.resident.room,
  };

  if (!william) {
    william = await prisma.resident.create({
      data: { tenantId: tenant.id, ...williamData },
    });
  } else {
    william = await prisma.resident.update({
      where: { id: william.id },
      data: williamData,
    });
  }

  // Store extended chart details on an active care plan formData (resident profile extension)
  const williamPlanTitle = 'Resident information — William Kershner';
  let williamPlan = await prisma.carePlan.findFirst({
    where: {
      tenantId: tenant.id,
      residentId: william.id,
      title: williamPlanTitle,
      deletedAt: null,
    },
  });
  const williamForm = {
    documentTitle: 'RESIDENT INFORMATION SHEET',
    preferredName: williamDoc.resident.preferredName,
    diagnoses: williamDoc.resident.diagnoses,
    primaryContact: williamDoc.primaryContact,
    secondaryContact: williamDoc.secondaryContact,
    physicians: williamDoc.physicians,
    preferredHospital: williamDoc.preferredHospital,
    insurance: williamDoc.insurance,
    facilityAdmissionAgreement: williamDoc.facilityAdmissionAgreement,
    sourceDoc: 'docs/source/loving-garden/William_Kershner_Resident_Information_Sheet.docx',
  } as Prisma.InputJsonValue;
  if (!williamPlan) {
    williamPlan = await prisma.carePlan.create({
      data: {
        tenantId: tenant.id,
        residentId: william.id,
        title: williamPlanTitle,
        goals: `Preferred name: ${williamDoc.resident.preferredName}. Guardian contacts on file (Abaci).`,
        effectiveFrom: williamData.admitDate,
        formData: williamForm,
      },
    });
  } else {
    await prisma.carePlan.update({
      where: { id: williamPlan.id },
      data: {
        goals: `Preferred name: ${williamDoc.resident.preferredName}. Guardian contacts on file (Abaci).`,
        formData: williamForm,
      },
    });
  }

  // Steven Watson (not on Sept MAR — use free MRN LGAFH003; LGAFH006 is Raysheal Ellis)
  const stevenDoc = readJson<{
    providerName: string;
    resident: {
      firstName: string;
      lastName: string;
      preferredName: string;
      dateOfBirth: string;
      sex: 'MALE' | 'FEMALE' | 'OTHER' | 'UNKNOWN';
      admitDate: string;
      primaryLanguage: string;
      allergies: string[];
      mrn: string;
      room: string;
      diagnoses: string[];
    };
    carePlan: {
      documentTitle: string;
      carePlanDate: string;
      carePlanUpdated: string;
      header: Record<string, string>;
      highlights: Record<string, string>;
    };
  }>('docs/source/loving-garden/steven_watson_ncp.json');

  // Raysheal Ellis — MAR LGAFH006 (restore if previously overwritten by Steven)
  const ellisDoc = readJson<{
    providerName: string;
    resident: {
      firstName: string;
      lastName: string;
      preferredName: string;
      dateOfBirth: string;
      sex: 'MALE' | 'FEMALE' | 'OTHER' | 'UNKNOWN';
      admitDate: string;
      primaryLanguage: string;
      allergies: string[];
      mrn: string;
      room: string;
      diagnoses: string[];
    };
    carePlan: {
      documentTitle: string;
      carePlanDate: string;
      assessmentDate: string;
      header: Record<string, string>;
      highlights: Record<string, string>;
    };
    cbhsIncident: Record<string, string>;
  }>('docs/source/loving-garden/raysheal_ellis_ncp.json');

  const ellisData = {
    firstName: ellisDoc.resident.firstName,
    lastName: ellisDoc.resident.lastName,
    sex: Sex[ellisDoc.resident.sex],
    dateOfBirth: parseCalendarDate(ellisDoc.resident.dateOfBirth),
    admitDate: parseCalendarDate(ellisDoc.resident.admitDate),
    allergies: ellisDoc.resident.allergies,
    mrn: ellisDoc.resident.mrn,
    room: ellisDoc.resident.room,
  };

  let ellis = await prisma.resident.findFirst({
    where: {
      tenantId: tenant.id,
      deletedAt: null,
      OR: [
        { lastName: 'Ellis', firstName: { contains: 'Raysheal' } },
        { lastName: 'ELLIS' },
        { mrn: 'LGAFH006' },
      ],
    },
  });

  if (!ellis) {
    ellis = await prisma.resident.create({
      data: { tenantId: tenant.id, ...ellisData },
    });
  } else {
    ellis = await prisma.resident.update({
      where: { id: ellis.id },
      data: ellisData,
    });
  }

  const ellisPlanTitle = 'Negotiated Care Plan — Raysheal Ellis';
  const ellisForm = {
    documentTitle: ellisDoc.carePlan.documentTitle,
    suicideSafetyNote: '',
    assessmentSourceNote: `Negotiated care plan ${ellisDoc.carePlan.carePlanDate}; assessment ${ellisDoc.carePlan.assessmentDate}. Provider: ${ellisDoc.providerName}.`,
    header: {
      ...ellisDoc.carePlan.header,
      providerName: ellisDoc.providerName || 'Jane Mburu',
    },
    highlights: ellisDoc.carePlan.highlights,
    diagnoses: ellisDoc.resident.diagnoses,
    preferredName: ellisDoc.resident.preferredName,
    cbhsIncident: ellisDoc.cbhsIncident,
    sourceDoc: 'docs/source/loving-garden/Raysheal_Ellis_Negotiated_Care_Plan.docx',
    signatureMeta: {
      admissionDate: ellisDoc.resident.admitDate,
      negotiatedCarePlanDate: ellisDoc.carePlan.carePlanDate,
      assessmentDate: ellisDoc.carePlan.assessmentDate,
    },
    signatures: [
      { role: 'PROVIDER', name: 'Jane Mburu', signedAt: '', reviewDate: ellisDoc.carePlan.carePlanDate },
      { role: 'RESIDENT', name: 'Ellis, Raysheal', signedAt: '', reviewDate: '' },
      { role: 'CASE MANAGER', name: 'Amanda Roxby', signedAt: '', reviewDate: '' },
    ],
  } as Prisma.InputJsonValue;

  let ellisPlan = await prisma.carePlan.findFirst({
    where: {
      tenantId: tenant.id,
      residentId: ellis.id,
      title: ellisPlanTitle,
      deletedAt: null,
    },
  });
  if (!ellisPlan) {
    ellisPlan = await prisma.carePlan.create({
      data: {
        tenantId: tenant.id,
        residentId: ellis.id,
        title: ellisPlanTitle,
        goals:
          ellisDoc.carePlan.highlights.medManagement +
          ' | Evacuation: ' +
          ellisDoc.carePlan.highlights.evacuation,
        effectiveFrom: ellisData.admitDate,
        formData: ellisForm,
      },
    });
  } else {
    await prisma.carePlan.update({
      where: { id: ellisPlan.id },
      data: {
        goals:
          ellisDoc.carePlan.highlights.medManagement +
          ' | Evacuation: ' +
          ellisDoc.carePlan.highlights.evacuation,
        formData: ellisForm,
      },
    });
  }

  const stevenData = {
    firstName: stevenDoc.resident.firstName,
    lastName: stevenDoc.resident.lastName,
    sex: Sex[stevenDoc.resident.sex],
    dateOfBirth: parseCalendarDate(stevenDoc.resident.dateOfBirth),
    admitDate: parseCalendarDate(stevenDoc.resident.admitDate),
    allergies: stevenDoc.resident.allergies,
    mrn: stevenDoc.resident.mrn,
    room: stevenDoc.resident.room,
  };

  let steven = await prisma.resident.findFirst({
    where: {
      tenantId: tenant.id,
      deletedAt: null,
      OR: [
        { lastName: 'Watson', firstName: 'Steven' },
        { mrn: stevenDoc.resident.mrn },
      ],
    },
  });

  // If Watson row was the LGAFH006 record we just restored to Ellis, create a fresh Steven
  if (steven && steven.id === ellis.id) {
    steven = null;
  }

  if (!steven) {
    steven = await prisma.resident.create({
      data: { tenantId: tenant.id, ...stevenData },
    });
  } else {
    steven = await prisma.resident.update({
      where: { id: steven.id },
      data: stevenData,
    });
  }

  const stevenPlanTitle = 'Negotiated Care Plan — Steven Watson';
  const stevenForm = {
    documentTitle: stevenDoc.carePlan.documentTitle,
    suicideSafetyNote: '',
    assessmentSourceNote: `From ${stevenDoc.carePlan.carePlanDate}; updated ${stevenDoc.carePlan.carePlanUpdated}. Provider: ${stevenDoc.providerName}.`,
    header: {
      ...stevenDoc.carePlan.header,
      providerName: stevenDoc.providerName || 'Jane Mburu',
    },
    highlights: stevenDoc.carePlan.highlights,
    diagnoses: stevenDoc.resident.diagnoses,
    sourceDoc: 'docs/source/loving-garden/Steven_Watson_Negotiated_Care_Plan.docx',
    signatureMeta: {
      admissionDate: stevenDoc.resident.admitDate,
      negotiatedCarePlanDate: stevenDoc.carePlan.carePlanDate,
      assessmentDate: stevenDoc.carePlan.carePlanUpdated,
    },
    signatures: [
      { role: 'PROVIDER', name: 'Jane Mburu', signedAt: '', reviewDate: stevenDoc.carePlan.carePlanUpdated },
      { role: 'RESIDENT', name: 'Steven Watson', signedAt: '', reviewDate: '' },
    ],
  } as Prisma.InputJsonValue;

  // Reattach any Steven plan that was left on Ellis after the MRN fix
  await prisma.carePlan.updateMany({
    where: {
      tenantId: tenant.id,
      residentId: ellis.id,
      title: stevenPlanTitle,
      deletedAt: null,
    },
    data: { residentId: steven.id },
  });

  let stevenPlan = await prisma.carePlan.findFirst({
    where: {
      tenantId: tenant.id,
      residentId: steven.id,
      title: stevenPlanTitle,
      deletedAt: null,
    },
  });
  if (!stevenPlan) {
    stevenPlan = await prisma.carePlan.create({
      data: {
        tenantId: tenant.id,
        residentId: steven.id,
        title: stevenPlanTitle,
        goals:
          stevenDoc.carePlan.highlights.mobility +
          ' | Meds: ' +
          stevenDoc.carePlan.highlights.medManagement,
        effectiveFrom: stevenData.admitDate,
        formData: stevenForm,
      },
    });
  } else {
    await prisma.carePlan.update({
      where: { id: stevenPlan.id },
      data: {
        goals:
          stevenDoc.carePlan.highlights.mobility +
          ' | Meds: ' +
          stevenDoc.carePlan.highlights.medManagement,
        formData: stevenForm,
      },
    });
  }

  console.log('Loving Garden updates applied:', {
    caregiver: 'Jane Mburu <lovinggardenafh@gmail.com>',
    william: {
      id: william.id,
      preferredName: williamDoc.resident.preferredName,
      admitDate: williamDoc.resident.admitDate,
      planId: williamPlan.id,
    },
    raysheal: {
      id: ellis.id,
      preferredName: ellisDoc.resident.preferredName,
      mrn: ellisDoc.resident.mrn,
      admitDate: ellisDoc.resident.admitDate,
      planId: ellisPlan.id,
    },
    steven: {
      id: steven.id,
      mrn: stevenDoc.resident.mrn,
      admitDate: stevenDoc.resident.admitDate,
      planId: stevenPlan.id,
    },
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
