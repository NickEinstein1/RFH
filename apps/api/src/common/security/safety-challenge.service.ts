import { createHmac, timingSafeEqual } from 'crypto';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type SafetyWarningCode = {
  code: string;
  severity: 'warn' | 'critical';
  message: string;
};

type ChallengePayload = {
  tenantId: string;
  userId: string;
  orderId: string;
  scheduledAt: string;
  codes: string;
  exp: number;
};

@Injectable()
export class SafetyChallengeService implements OnModuleInit {
  private secret!: Buffer;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const raw =
      this.config.get<string>('SAFETY_CHALLENGE_SECRET') ||
      this.config.get<string>('JWT_ACCESS_SECRET') ||
      'dev-safety-challenge-secret-change-me';
    this.secret = Buffer.from(raw, 'utf8');
  }

  issue(
    user: { id: string; tenantId: string },
    orderId: string,
    scheduledAt: string,
    warnings: SafetyWarningCode[],
    ttlSeconds = 120,
  ): string {
    const payload: ChallengePayload = {
      tenantId: user.tenantId,
      userId: user.id,
      orderId,
      scheduledAt,
      codes: warnings
        .map((w) => w.code)
        .sort()
        .join(','),
      exp: Math.floor(Date.now() / 1000) + ttlSeconds,
    };
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = createHmac('sha256', this.secret).update(body).digest('base64url');
    return `${body}.${sig}`;
  }

  verify(
    token: string | undefined,
    user: { id: string; tenantId: string },
    orderId: string,
    scheduledAt: string,
    warnings: SafetyWarningCode[],
  ): boolean {
    if (!token || !token.includes('.')) return false;
    const [body, sig] = token.split('.');
    if (!body || !sig) return false;
    const expected = createHmac('sha256', this.secret).update(body).digest('base64url');
    try {
      const a = Buffer.from(sig);
      const b = Buffer.from(expected);
      if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
    } catch {
      return false;
    }

    try {
      const payload = JSON.parse(
        Buffer.from(body, 'base64url').toString('utf8'),
      ) as ChallengePayload;
      if (payload.exp < Math.floor(Date.now() / 1000)) return false;
      if (payload.tenantId !== user.tenantId || payload.userId !== user.id) return false;
      if (payload.orderId !== orderId || payload.scheduledAt !== scheduledAt) return false;
      const codes = warnings
        .map((w) => w.code)
        .sort()
        .join(',');
      return payload.codes === codes;
    } catch {
      return false;
    }
  }
}
