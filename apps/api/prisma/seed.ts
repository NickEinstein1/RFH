import {
  CareTaskCategory,
  CredentialAlertType,
  CredentialType,
  PrismaClient,
  Role,
  Sex,
  ShiftWindow,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRaw`SELECT set_config('app.bypass_rls', 'on', false)`;

  const tenantName = 'Sunrise Adult Family Home';
  let tenant = await prisma.tenant.findFirst({ where: { name: tenantName } });
  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: { name: tenantName, timezone: 'America/Los_Angeles' },
    });
  }

  const passwordHash = await bcrypt.hash('Password123!', 12);

  const owner = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'owner@sunrise.demo' } },
    update: {},
    create: {
      tenantId: tenant.id,
      email: 'owner@sunrise.demo',
      passwordHash,
      role: Role.OWNER,
      firstName: 'Olivia',
      lastName: 'Owner',
    },
  });

  const nurse = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'nurse@sunrise.demo' } },
    update: {},
    create: {
      tenantId: tenant.id,
      email: 'nurse@sunrise.demo',
      passwordHash,
      role: Role.NURSE,
      firstName: 'Nora',
      lastName: 'Nurse',
    },
  });

  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'care@sunrise.demo' } },
    update: {},
    create: {
      tenantId: tenant.id,
      email: 'care@sunrise.demo',
      passwordHash,
      role: Role.CAREGIVER,
      firstName: 'Chris',
      lastName: 'Caregiver',
    },
  });

  const family = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'family@sunrise.demo' } },
    update: {},
    create: {
      tenantId: tenant.id,
      email: 'family@sunrise.demo',
      passwordHash,
      role: Role.FAMILY_VIEWER,
      firstName: 'Faye',
      lastName: 'Family',
    },
  });

  let resident = await prisma.resident.findFirst({
    where: { tenantId: tenant.id, firstName: 'Margaret', lastName: 'Chen', deletedAt: null },
  });
  if (!resident) {
    resident = await prisma.resident.create({
      data: {
        tenantId: tenant.id,
        firstName: 'Margaret',
        lastName: 'Chen',
        dateOfBirth: new Date('1942-03-14'),
        sex: Sex.FEMALE,
        mrn: 'MRN-1001',
        room: 'A1',
        admitDate: new Date('2024-01-10'),
        allergies: ['Penicillin'],
      },
    });
  }

  await prisma.familyResidentLink.upsert({
    where: {
      tenantId_userId_residentId: {
        tenantId: tenant.id,
        userId: family.id,
        residentId: resident.id,
      },
    },
    update: { deletedAt: null, relationship: 'Daughter' },
    create: {
      tenantId: tenant.id,
      userId: family.id,
      residentId: resident.id,
      relationship: 'Daughter',
    },
  });

  const existingOrder = await prisma.medicationOrder.findFirst({
    where: { tenantId: tenant.id, residentId: resident.id, drugName: 'Lisinopril', deletedAt: null },
  });
  if (!existingOrder) {
    await prisma.medicationOrder.create({
      data: {
        tenantId: tenant.id,
        residentId: resident.id,
        drugName: 'Lisinopril',
        dose: '10 mg',
        route: 'PO',
        frequency: 'Daily',
        scheduleTimes: ['08:00', '20:00'],
        startDate: new Date('2024-01-10'),
        instructions: 'Give with water. Hold if SBP < 100.',
      },
    });
    await prisma.medicationOrder.create({
      data: {
        tenantId: tenant.id,
        residentId: resident.id,
        drugName: 'Acetaminophen',
        dose: '650 mg',
        route: 'PO',
        frequency: 'PRN pain',
        scheduleTimes: [],
        startDate: new Date('2024-01-10'),
        isPrn: true,
        instructions: 'PRN mild pain. Max 3g/day.',
      },
    });
  }

  let plan = await prisma.carePlan.findFirst({
    where: { tenantId: tenant.id, residentId: resident.id, deletedAt: null },
  });
  if (!plan) {
    plan = await prisma.carePlan.create({
      data: {
        tenantId: tenant.id,
        residentId: resident.id,
        title: 'Independent living support',
        goals: 'Maintain mobility and hygiene with stand-by assist.',
        effectiveFrom: new Date('2024-01-10'),
      },
    });
    await prisma.careTask.createMany({
      data: [
        {
          tenantId: tenant.id,
          carePlanId: plan.id,
          residentId: resident.id,
          category: CareTaskCategory.ADL,
          title: 'Morning hygiene assist',
          shift: ShiftWindow.DAY,
          scheduleTimes: ['07:30'],
          instructions: 'Stand-by assist; encourage independence.',
        },
        {
          tenantId: tenant.id,
          carePlanId: plan.id,
          residentId: resident.id,
          category: CareTaskCategory.ADL,
          title: 'Ambulation — hallway walk',
          shift: ShiftWindow.DAY,
          scheduleTimes: ['10:00', '15:00'],
          instructions: 'Walker; report dizziness.',
        },
        {
          tenantId: tenant.id,
          carePlanId: plan.id,
          residentId: resident.id,
          category: CareTaskCategory.CARE,
          title: 'Evening reposition / comfort check',
          shift: ShiftWindow.EVENING,
          scheduleTimes: ['20:30'],
        },
      ],
    });
  }

  const existingCred = await prisma.staffCredential.findFirst({
    where: { tenantId: tenant.id, userId: nurse.id, type: CredentialType.CPR, deletedAt: null },
  });
  if (!existingCred) {
    const inTwentyDays = new Date();
    inTwentyDays.setUTCDate(inTwentyDays.getUTCDate() + 20);
    const cpr = await prisma.staffCredential.create({
      data: {
        tenantId: tenant.id,
        userId: nurse.id,
        type: CredentialType.CPR,
        label: 'AHA BLS CPR',
        expiresAt: inTwentyDays,
        issuedAt: new Date('2025-01-01'),
      },
    });
    const expired = new Date();
    expired.setUTCDate(expired.getUTCDate() - 5);
    const food = await prisma.staffCredential.create({
      data: {
        tenantId: tenant.id,
        userId: nurse.id,
        type: CredentialType.FOOD_HANDLER,
        label: 'WA Food Worker Card',
        expiresAt: expired,
      },
    });
    await prisma.credentialAlert.createMany({
      data: [
        {
          tenantId: tenant.id,
          credentialId: cpr.id,
          type: CredentialAlertType.EXPIRING_SOON,
        },
        {
          tenantId: tenant.id,
          credentialId: food.id,
          type: CredentialAlertType.EXPIRED,
        },
      ],
    });
  }

  // eslint-disable-next-line no-console
  console.log('Seed complete:', {
    tenant: tenant.name,
    owner: owner.email,
    family: family.email,
    password: 'Password123!',
    resident: `${resident.firstName} ${resident.lastName}`,
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
