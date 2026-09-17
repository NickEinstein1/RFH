import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  CreateUserDto,
  LoginDto,
  RegisterTenantDto,
} from './dto/auth.dto';
import type { AuthUser } from '../common/decorators/current-user.decorator';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  async registerTenant(dto: RegisterTenantDto, req?: { ip?: string; headers?: Record<string, string | string[] | undefined> }) {
    return this.prisma.runWithBypass(async () => {
      const existing = await this.prisma.db.tenant.findFirst({
        where: { name: dto.tenantName },
      });
      if (existing) {
        throw new ConflictException('Tenant name already exists');
      }

      const passwordHash = await bcrypt.hash(dto.password, 12);
      const tenant = await this.prisma.db.tenant.create({
        data: {
          name: dto.tenantName,
          timezone: dto.timezone ?? 'America/Los_Angeles',
        },
      });
      const user = await this.prisma.db.user.create({
        data: {
          tenantId: tenant.id,
          email: dto.email.toLowerCase(),
          passwordHash,
          role: Role.OWNER,
          firstName: dto.firstName,
          lastName: dto.lastName,
        },
      });

      await this.audit.log({
        tenantId: tenant.id,
        actorId: user.id,
        action: 'tenant.register',
        resourceType: 'Tenant',
        resourceId: tenant.id,
        metadata: { email: user.email },
        ip: req?.ip,
        userAgent: header(req?.headers, 'user-agent'),
      });

      return this.issueTokens(user);
    });
  }

  async login(dto: LoginDto, req?: { ip?: string; headers?: Record<string, string | string[] | undefined> }) {
    return this.prisma.runWithBypass(async () => {
      const email = dto.email.toLowerCase();
      const users = await this.prisma.db.user.findMany({
        where: {
          email,
          isActive: true,
          deletedAt: null,
          ...(dto.tenantName
            ? { tenant: { name: dto.tenantName } }
            : {}),
        },
        include: { tenant: true },
      });

      if (users.length === 0) {
        throw new UnauthorizedException('Invalid credentials');
      }
      if (users.length > 1 && !dto.tenantName) {
        throw new UnauthorizedException(
          'Multiple facilities found for this email — provide tenantName',
        );
      }

      const user = users[0];
      const match = await bcrypt.compare(dto.password, user.passwordHash);
      if (!match) {
        await this.audit.log({
          tenantId: user.tenantId,
          actorId: user.id,
          action: 'auth.login_failed',
          resourceType: 'User',
          resourceId: user.id,
          metadata: { reason: 'bad_password' },
          ip: req?.ip,
          userAgent: header(req?.headers, 'user-agent'),
        });
        throw new UnauthorizedException('Invalid credentials');
      }

      await this.audit.log({
        tenantId: user.tenantId,
        actorId: user.id,
        action: 'auth.login',
        resourceType: 'User',
        resourceId: user.id,
        ip: req?.ip,
        userAgent: header(req?.headers, 'user-agent'),
      });

      const tokens = await this.issueTokens(user);
      return {
        ...tokens,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          firstName: user.firstName,
          lastName: user.lastName,
          tenantId: user.tenantId,
          tenantName: user.tenant.name,
          timezone: user.tenant.timezone,
        },
      };
    });
  }

  async refresh(refreshToken: string) {
    return this.prisma.runWithBypass(async () => {
      const tokenHash = hashToken(refreshToken);
      const stored = await this.prisma.db.refreshToken.findFirst({
        where: {
          tokenHash,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        include: { user: true },
      });
      if (!stored || !stored.user.isActive || stored.user.deletedAt) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      await this.prisma.db.refreshToken.update({
        where: { id: stored.id },
        data: { revokedAt: new Date() },
      });

      return this.issueTokens(stored.user);
    });
  }

  async logout(user: AuthUser, refreshToken?: string, req?: { ip?: string; headers?: Record<string, string | string[] | undefined> }) {
    if (refreshToken) {
      await this.prisma.db.refreshToken.updateMany({
        where: {
          userId: user.id,
          tokenHash: hashToken(refreshToken),
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
    } else {
      await this.prisma.db.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    await this.audit.logForUser(user, 'auth.logout', 'User', user.id, undefined, req);
    return { ok: true };
  }

  async createUser(actor: AuthUser, dto: CreateUserDto, req?: { ip?: string; headers?: Record<string, string | string[] | undefined> }) {
    const passwordHash = await bcrypt.hash(dto.password, 12);
    try {
      const user = await this.prisma.db.user.create({
        data: {
          tenantId: actor.tenantId,
          email: dto.email.toLowerCase(),
          passwordHash,
          role: dto.role,
          firstName: dto.firstName,
          lastName: dto.lastName,
        },
        select: {
          id: true,
          email: true,
          role: true,
          firstName: true,
          lastName: true,
          isActive: true,
          createdAt: true,
        },
      });
      await this.audit.logForUser(actor, 'user.create', 'User', user.id, {
        email: user.email,
        role: user.role,
      }, req);
      return user;
    } catch {
      throw new ConflictException('User with this email already exists in facility');
    }
  }

  async me(user: AuthUser) {
    const full = await this.prisma.db.user.findFirst({
      where: { id: user.id, tenantId: user.tenantId, deletedAt: null },
      include: { tenant: true },
    });
    if (!full) throw new UnauthorizedException();
    return {
      id: full.id,
      email: full.email,
      role: full.role,
      firstName: full.firstName,
      lastName: full.lastName,
      tenantId: full.tenantId,
      tenantName: full.tenant.name,
      timezone: full.tenant.timezone,
    };
  }

  private async issueTokens(user: { id: string; tenantId: string; email: string; role: Role }) {
    const accessToken = await this.jwt.signAsync(
      {
        sub: user.id,
        tenantId: user.tenantId,
        email: user.email,
        role: user.role,
      },
      {
        secret: this.config.getOrThrow('JWT_ACCESS_SECRET'),
        expiresIn: this.config.get('JWT_ACCESS_TTL', '15m'),
      },
    );

    const refreshToken = randomBytes(48).toString('hex');
    const ttl = this.config.get('JWT_REFRESH_TTL', '7d');
    const expiresAt = parseTtl(ttl);

    await this.prisma.db.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        expiresAt,
      },
    });

    return { accessToken, refreshToken, expiresAt };
  }
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function parseTtl(ttl: string): Date {
  const match = /^(\d+)([smhd])$/.exec(ttl);
  const now = Date.now();
  if (!match) return new Date(now + 7 * 24 * 60 * 60 * 1000);
  const n = Number(match[1]);
  const unit = match[2];
  const ms =
    unit === 's' ? n * 1000 :
    unit === 'm' ? n * 60 * 1000 :
    unit === 'h' ? n * 60 * 60 * 1000 :
    n * 24 * 60 * 60 * 1000;
  return new Date(now + ms);
}

function header(
  headers: Record<string, string | string[] | undefined> | undefined,
  key: string,
): string | null {
  const v = headers?.[key];
  if (!v) return null;
  return Array.isArray(v) ? v[0] : v;
}
