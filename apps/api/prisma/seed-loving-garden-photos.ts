/**
 * Attach Loving Garden resident photos from Images_Loving_Garden /
 * apps/api/public/residents/loving-garden/*.jpg
 */
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

const MEDIA_BASE = '/api/media/residents/loving-garden';

/** Map image slug → resident matchers (name / preferred / MRN). */
const PHOTO_MAP: Array<{
  slug: string;
  match: (r: { firstName: string; lastName: string; mrn: string | null }) => boolean;
}> = [
  {
    slug: 'bill',
    match: (r) =>
      r.lastName.toLowerCase() === 'kershner' ||
      r.mrn === 'LGAFH005' ||
      (r.firstName.toLowerCase() === 'william' && r.lastName.toLowerCase().startsWith('kersh')),
  },
  {
    slug: 'cody',
    match: (r) =>
      r.lastName.toUpperCase() === 'DEVRIES' ||
      r.mrn === 'LGAFH002' ||
      r.firstName.toUpperCase() === 'CODY',
  },
  {
    slug: 'julia',
    match: (r) =>
      r.lastName.toUpperCase() === 'JAGER' ||
      r.mrn === 'LGAFH001' ||
      r.firstName.toUpperCase() === 'JULIA',
  },
  {
    slug: 'raysheal',
    match: (r) =>
      r.lastName.toLowerCase() === 'ellis' ||
      r.mrn === 'LGAFH006' ||
      r.firstName.toLowerCase().includes('raysheal'),
  },
  {
    slug: 'steven',
    match: (r) =>
      r.lastName.toLowerCase() === 'watson' ||
      r.mrn === 'LGAFH003' ||
      r.firstName.toLowerCase() === 'steven',
  },
];

async function main() {
  await prisma.$executeRaw`SELECT set_config('app.bypass_rls', 'on', false)`;

  const publicDir = path.resolve(__dirname, '../public/residents/loving-garden');
  for (const entry of PHOTO_MAP) {
    const file = path.join(publicDir, `${entry.slug}.jpg`);
    if (!fs.existsSync(file)) {
      throw new Error(`Missing media file: ${file}`);
    }
  }

  const tenant = await prisma.tenant.findFirst({ where: { name: 'Loving Garden AFH' } });
  if (!tenant) throw new Error('Loving Garden AFH not found');

  const residents = await prisma.resident.findMany({
    where: { tenantId: tenant.id, deletedAt: null },
    select: { id: true, firstName: true, lastName: true, mrn: true, photoUrl: true },
  });

  const applied: Array<{ name: string; photoUrl: string }> = [];
  for (const entry of PHOTO_MAP) {
    const resident = residents.find((r) => entry.match(r));
    if (!resident) {
      console.warn(`No resident matched photo ${entry.slug}.jpg`);
      continue;
    }
    const photoUrl = `${MEDIA_BASE}/${entry.slug}.jpg`;
    await prisma.resident.update({
      where: { id: resident.id },
      data: { photoUrl },
    });
    applied.push({
      name: `${resident.lastName}, ${resident.firstName}`,
      photoUrl,
    });
  }

  console.log('Loving Garden photos applied:', applied);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
