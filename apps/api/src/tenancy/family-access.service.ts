import { Injectable, ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/decorators/current-user.decorator';

@Injectable()
export class FamilyAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async linkedResidentIds(user: AuthUser): Promise<string[] | null> {
    if (user.role !== Role.FAMILY_VIEWER) return null;
    const links = await this.prisma.db.familyResidentLink.findMany({
      where: {
        tenantId: user.tenantId,
        userId: user.id,
        deletedAt: null,
      },
      select: { residentId: true },
    });
    return links.map((l) => l.residentId);
  }

  async assertCanAccessResident(user: AuthUser, residentId: string) {
    const linked = await this.linkedResidentIds(user);
    if (linked === null) return;
    if (!linked.includes(residentId)) {
      throw new ForbiddenException('Not linked to this resident');
    }
  }
}
