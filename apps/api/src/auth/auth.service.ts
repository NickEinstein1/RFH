import {
  ConflictException,
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';
import {
  ChangePasswordDto,
  CreateUserDto,
  LoginDto,
  PasswordResetConfirmDto,
  PasswordResetRequestDto,
  RegisterTenantDto,
} from './dto/auth.dto';
import type { AuthUser } from '../common/decorators/current-user.decorator';

const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
  ) {}

  async registerTenant(dto: RegisterTenantDto, req?: { ip?: string; headers?: Record<string, string | string[] | undefined> }) {
    return this.prisma.runWithBypass(async () => {
      const email = dto.email.toLowerCase().trim();
      const tenantName = dto.tenantName.trim().replace(/\s+/g, ' ');
      if (tenantName.length < 2) {
        throw new BadRequestException('Facility name is required');
      }

      const existingTenant = await this.prisma.db.tenant.findFirst({
        where: { name: { equals: tenantName, mode: 'insensitive' } },
      });
      if (existingTenant) {
        throw new ConflictException('A facility with this name already exists');
      }

      const existingEmail = await this.prisma.db.user.findFirst({
        where: { email, deletedAt: null },
      });
      if (existingEmail) {
        throw new ConflictException(
          'An account with this email already exists — sign in instead',
        );
      }

      const passwordHash = await bcrypt.hash(dto.password, 12);
      const organization = await this.prisma.db.organization.create({
        data: { name: `${tenantName} Organization` },
      });
      const tenant = await this.prisma.db.tenant.create({
        data: {
          name: tenantName,
          timezone: dto.timezone?.trim() || 'America/Los_Angeles',
          organizationId: organization.id,
        },
      });
      const user = await this.prisma.db.user.create({
        data: {
          tenantId: tenant.id,
          email,
          passwordHash,
          role: Role.OWNER,
          firstName: dto.firstName.trim(),
          lastName: dto.lastName.trim(),
        },
      });

      await this.audit.log({
        tenantId: tenant.id,
        actorId: user.id,
        action: 'tenant.register',
        resourceType: 'Tenant',
        resourceId: tenant.id,
        metadata: { email: user.email, organizationId: organization.id },
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
          tenantId: tenant.id,
          tenantName: tenant.name,
          timezone: tenant.timezone,
        },
        homes: await this.homesForEmail(user.email, organization.id),
      };
    });
  }

  async login(dto: LoginDto, req?: { ip?: string; headers?: Record<string, string | string[] | undefined> }) {
    return this.prisma.runWithBypass(async () => {
      const email = dto.email.toLowerCase().trim();
      // Facility is resolved from email — no tenant picker on sign-in.
      const candidates = await this.prisma.db.user.findMany({
        where: {
          email,
          isActive: true,
          deletedAt: null,
          ...(dto.tenantName ? { tenant: { name: dto.tenantName } } : {}),
        },
        include: { tenant: true },
        orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
      });

      if (candidates.length === 0) {
        throw new UnauthorizedException('Invalid credentials');
      }

      // Verify password against matching accounts; email alone forms the facility link.
      const matched: typeof candidates = [];
      for (const candidate of candidates) {
        if (await bcrypt.compare(dto.password, candidate.passwordHash)) {
          matched.push(candidate);
        }
      }

      if (matched.length === 0) {
        const primary = candidates[0];
        if (primary.lockedUntil && primary.lockedUntil.getTime() > Date.now()) {
          await this.audit.log({
            tenantId: primary.tenantId,
            actorId: primary.id,
            action: 'auth.login_locked',
            resourceType: 'User',
            resourceId: primary.id,
            metadata: { lockedUntil: primary.lockedUntil.toISOString() },
            ip: req?.ip,
            userAgent: header(req?.headers, 'user-agent'),
          });
          throw new UnauthorizedException(
            'Account temporarily locked after failed sign-in attempts. Try again later.',
          );
        }
        const failedLoginCount = primary.failedLoginCount + 1;
        const lockedUntil =
          failedLoginCount >= MAX_FAILED_LOGINS
            ? new Date(Date.now() + LOCKOUT_MS)
            : null;
        await this.prisma.db.user.update({
          where: { id: primary.id },
          data: {
            failedLoginCount,
            ...(lockedUntil ? { lockedUntil } : {}),
          },
        });
        await this.audit.log({
          tenantId: primary.tenantId,
          actorId: primary.id,
          action: 'auth.login_failed',
          resourceType: 'User',
          resourceId: primary.id,
          metadata: {
            reason: 'bad_password',
            failedLoginCount,
            locked: Boolean(lockedUntil),
          },
          ip: req?.ip,
          userAgent: header(req?.headers, 'user-agent'),
        });
        throw new UnauthorizedException('Invalid credentials');
      }

      // Prefer OWNER, then earliest account — multi-home users switch via home switcher.
      const roleRank = (role: string) =>
        role === 'OWNER' ? 0 : role === 'ADMIN' ? 1 : role === 'NURSE' ? 2 : 3;
      matched.sort(
        (a, b) =>
          roleRank(a.role) - roleRank(b.role) ||
          a.createdAt.getTime() - b.createdAt.getTime(),
      );
      const user = matched[0];

      if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
        await this.audit.log({
          tenantId: user.tenantId,
          actorId: user.id,
          action: 'auth.login_locked',
          resourceType: 'User',
          resourceId: user.id,
          metadata: { lockedUntil: user.lockedUntil.toISOString() },
          ip: req?.ip,
          userAgent: header(req?.headers, 'user-agent'),
        });
        throw new UnauthorizedException(
          'Account temporarily locked after failed sign-in attempts. Try again later.',
        );
      }

      if (user.failedLoginCount > 0 || user.lockedUntil) {
        await this.prisma.db.user.update({
          where: { id: user.id },
          data: { failedLoginCount: 0, lockedUntil: null },
        });
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
      const homes = await this.homesForEmail(user.email, user.tenant.organizationId);
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
        homes,
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

      if (dto.sendInvite !== false) {
        const tenant = await this.prisma.db.tenant.findUniqueOrThrow({
          where: { id: actor.tenantId },
        });
        await this.mail.sendStaffInvite({
          to: user.email,
          firstName: user.firstName,
          facilityName: tenant.name,
          tempPassword: dto.password,
          actor,
        });
      }

      return user;
    } catch {
      throw new ConflictException('User with this email already exists in facility');
    }
  }

  async requestPasswordReset(dto: PasswordResetRequestDto, req?: { ip?: string; headers?: Record<string, string | string[] | undefined> }) {
    return this.prisma.runWithBypass(async () => {
      const email = dto.email.toLowerCase();
      const users = await this.prisma.db.user.findMany({
        where: {
          email,
          isActive: true,
          deletedAt: null,
          ...(dto.tenantName ? { tenant: { name: dto.tenantName } } : {}),
        },
        include: { tenant: true },
      });

      // Always succeed to avoid account enumeration. Email alone identifies the account(s).
      if (users.length >= 1) {
        const appOrigin = this.config.get('CORS_ORIGIN', 'http://localhost:5173');
        for (const user of users) {
          const raw = randomBytes(32).toString('hex');
          await this.prisma.db.passwordResetToken.create({
            data: {
              userId: user.id,
              tokenHash: hashToken(raw),
              expiresAt: new Date(Date.now() + 30 * 60 * 1000),
            },
          });
          const resetUrl = `${appOrigin}/reset-password?token=${raw}`;
          await this.mail.sendPasswordReset({
            to: user.email,
            resetUrl,
            facilityName: user.tenant.name,
            tenantId: user.tenantId,
          });
          await this.audit.log({
            tenantId: user.tenantId,
            actorId: user.id,
            action: 'auth.password_reset_request',
            resourceType: 'User',
            resourceId: user.id,
            ip: req?.ip,
            userAgent: header(req?.headers, 'user-agent'),
          });
        }
      }

      return { ok: true };
    });
  }

  async confirmPasswordReset(dto: PasswordResetConfirmDto, req?: { ip?: string; headers?: Record<string, string | string[] | undefined> }) {
    return this.prisma.runWithBypass(async () => {
      const tokenHash = hashToken(dto.token);
      const stored = await this.prisma.db.passwordResetToken.findFirst({
        where: {
          tokenHash,
          usedAt: null,
          expiresAt: { gt: new Date() },
        },
        include: { user: true },
      });
      if (!stored) throw new BadRequestException('Invalid or expired reset token');

      const passwordHash = await bcrypt.hash(dto.password, 12);
      await this.prisma.db.user.update({
        where: { id: stored.userId },
        data: {
          passwordHash,
          failedLoginCount: 0,
          lockedUntil: null,
        },
      });
      await this.prisma.db.passwordResetToken.update({
        where: { id: stored.id },
        data: { usedAt: new Date() },
      });
      await this.prisma.db.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit.log({
        tenantId: stored.user.tenantId,
        actorId: stored.userId,
        action: 'auth.password_reset_confirm',
        resourceType: 'User',
        resourceId: stored.userId,
        ip: req?.ip,
        userAgent: header(req?.headers, 'user-agent'),
      });
      return { ok: true };
    });
  }

  async changePassword(user: AuthUser, dto: ChangePasswordDto, req?: { ip?: string; headers?: Record<string, string | string[] | undefined> }) {
    const full = await this.prisma.db.user.findFirst({
      where: { id: user.id, tenantId: user.tenantId, deletedAt: null },
    });
    if (!full) throw new UnauthorizedException();
    const match = await bcrypt.compare(dto.currentPassword, full.passwordHash);
    if (!match) throw new UnauthorizedException('Current password is incorrect');
    const passwordHash = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.db.user.update({
      where: { id: user.id },
      data: { passwordHash, failedLoginCount: 0, lockedUntil: null },
    });
    await this.audit.logForUser(user, 'auth.password_change', 'User', user.id, undefined, req);
    return { ok: true };
  }

  async me(user: AuthUser) {
    const full = await this.prisma.db.user.findFirst({
      where: { id: user.id, tenantId: user.tenantId, deletedAt: null },
      include: { tenant: true },
    });
    if (!full) throw new UnauthorizedException();
    const homes = await this.homesForEmail(full.email, full.tenant.organizationId);
    return {
      id: full.id,
      email: full.email,
      role: full.role,
      firstName: full.firstName,
      lastName: full.lastName,
      tenantId: full.tenantId,
      tenantName: full.tenant.name,
      timezone: full.tenant.timezone,
      homes,
    };
  }

  async listHomes(user: AuthUser) {
    const full = await this.prisma.db.user.findFirst({
      where: { id: user.id, tenantId: user.tenantId, deletedAt: null },
      include: { tenant: true },
    });
    if (!full) throw new UnauthorizedException();
    return this.homesForEmail(full.email, full.tenant.organizationId);
  }

  async switchHome(
    actor: AuthUser,
    tenantId: string,
    req?: { ip?: string; headers?: Record<string, string | string[] | undefined> },
  ) {
    return this.prisma.runWithBypass(async () => {
      const current = await this.prisma.db.user.findFirst({
        where: { id: actor.id, tenantId: actor.tenantId, deletedAt: null, isActive: true },
        include: { tenant: true },
      });
      if (!current) throw new UnauthorizedException();

      const target = await this.prisma.db.user.findFirst({
        where: {
          email: current.email,
          tenantId,
          deletedAt: null,
          isActive: true,
        },
        include: { tenant: true },
      });
      if (!target) {
        throw new UnauthorizedException('No access to that facility for this account');
      }

      const orgId = current.tenant.organizationId;
      if (
        !orgId ||
        !target.tenant.organizationId ||
        target.tenant.organizationId !== orgId
      ) {
        throw new UnauthorizedException('Facility is not in your organization portfolio');
      }

      await this.prisma.db.refreshToken.updateMany({
        where: { userId: current.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      await this.audit.log({
        tenantId: target.tenantId,
        actorId: target.id,
        action: 'auth.switch_home',
        resourceType: 'Tenant',
        resourceId: target.tenantId,
        metadata: { fromTenantId: current.tenantId },
        ip: req?.ip,
        userAgent: header(req?.headers, 'user-agent'),
      });

      const tokens = await this.issueTokens(target);
      return {
        ...tokens,
        user: {
          id: target.id,
          email: target.email,
          role: target.role,
          firstName: target.firstName,
          lastName: target.lastName,
          tenantId: target.tenantId,
          tenantName: target.tenant.name,
          timezone: target.tenant.timezone,
        },
        homes: await this.homesForEmail(target.email, target.tenant.organizationId),
      };
    });
  }

  private async homesForEmail(email: string, organizationId: string | null | undefined) {
    if (!organizationId) {
      return [] as Array<{
        tenantId: string;
        tenantName: string;
        role: Role;
        timezone: string;
        userId: string;
      }>;
    }
    const rows = await this.prisma.db.user.findMany({
      where: {
        email: email.toLowerCase(),
        deletedAt: null,
        isActive: true,
        tenant: { organizationId },
      },
      include: { tenant: { select: { id: true, name: true, timezone: true } } },
      orderBy: { tenant: { name: 'asc' } },
    });
    return rows.map((r) => ({
      tenantId: r.tenant.id,
      tenantName: r.tenant.name,
      role: r.role,
      timezone: r.tenant.timezone,
      userId: r.id,
    }));
  }

  private async issueTokens(user: {
    id: string;
    tenantId: string;
    email: string;
    role: Role;
    firstName: string;
    lastName: string;
  }) {
    const accessToken = await this.jwt.signAsync(
      {
        sub: user.id,
        tenantId: user.tenantId,
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
      },
      {
        secret: this.config.getOrThrow('JWT_ACCESS_SECRET'),
        expiresIn: this.config.get('JWT_ACCESS_TTL', '10m'),
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
