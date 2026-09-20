import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/decorators/current-user.decorator';

type SendOpts = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** audited action name */
  action?: string;
  actor?: AuthUser | null;
  meta?: Record<string, unknown>;
};

@Injectable()
export class MailService {
  private readonly log = new Logger(MailService.name);
  private transporter: Transporter | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {
    const host = this.config.get<string>('SMTP_HOST');
    if (!host) {
      this.log.warn('SMTP_HOST not set — transactional email disabled');
      return;
    }
    const port = Number(this.config.get('SMTP_PORT', 587));
    const secure =
      String(this.config.get('SMTP_SECURE', 'false')).toLowerCase() === 'true' ||
      port === 465;
    const opts: SMTPTransport.Options = {
      host,
      port,
      secure,
      auth: this.config.get('SMTP_USER')
        ? {
            user: this.config.getOrThrow('SMTP_USER'),
            pass: this.config.getOrThrow('SMTP_PASS'),
          }
        : undefined,
    };
    this.transporter = nodemailer.createTransport(opts);
  }

  isConfigured() {
    return Boolean(this.transporter);
  }

  async send(opts: SendOpts) {
    const from = this.config.get('SMTP_FROM', 'RFH Care <noreply@localhost>');
    if (!this.transporter) {
      this.log.warn(`Email skipped (no SMTP): ${opts.subject} → ${opts.to}`);
      if (opts.actor) {
        await this.audit.logForUser(
          opts.actor,
          opts.action || 'mail.skipped',
          'Mail',
          null,
          { to: opts.to, subject: opts.subject, ...(opts.meta || {}) },
        );
      }
      return { skipped: true as const };
    }

    try {
      await this.transporter.sendMail({
        from,
        to: opts.to,
        subject: opts.subject,
        text: opts.text,
        html: opts.html,
      });
      if (opts.actor) {
        await this.audit.logForUser(
          opts.actor,
          opts.action || 'mail.sent',
          'Mail',
          null,
          { to: opts.to, subject: opts.subject, ...(opts.meta || {}) },
        );
      } else {
        await this.audit.log({
          tenantId: (opts.meta?.tenantId as string) || 'system',
          actorId: null,
          action: opts.action || 'mail.sent',
          resourceType: 'Mail',
          resourceId: null,
          metadata: { to: opts.to, subject: opts.subject, ...(opts.meta || {}) },
        });
      }
      return { skipped: false as const };
    } catch (err) {
      this.log.error(
        `Email failed: ${opts.subject} → ${opts.to}`,
        err instanceof Error ? err.message : String(err),
      );
      if (opts.actor) {
        await this.audit.logForUser(
          opts.actor,
          'mail.failed',
          'Mail',
          null,
          { to: opts.to, subject: opts.subject },
        );
      }
      return { skipped: false as const, failed: true as const };
    }
  }

  async sendStaffInvite(opts: {
    to: string;
    firstName: string;
    facilityName: string;
    tempPassword?: string;
    actor: AuthUser;
  }) {
    const lines = [
      `Hello ${opts.firstName},`,
      '',
      `You have been invited to ${opts.facilityName} on RFH Care.`,
      opts.tempPassword
        ? `Temporary password: ${opts.tempPassword}`
        : 'Use the password reset link from your administrator to sign in.',
      '',
      'Sign in at your facility portal and change your password after first login.',
    ];
    return this.send({
      to: opts.to,
      subject: `Welcome to ${opts.facilityName} — RFH Care`,
      text: lines.join('\n'),
      action: 'mail.staff_invite',
      actor: opts.actor,
      meta: { kind: 'invite' },
    });
  }

  async sendPasswordReset(opts: {
    to: string;
    resetUrl: string;
    facilityName: string;
    tenantId: string;
  }) {
    return this.send({
      to: opts.to,
      subject: `Password reset — ${opts.facilityName}`,
      text: [
        `A password reset was requested for your RFH Care account at ${opts.facilityName}.`,
        '',
        `Open this link within 30 minutes:`,
        opts.resetUrl,
        '',
        'If you did not request this, ignore this email.',
      ].join('\n'),
      action: 'mail.password_reset',
      meta: { tenantId: opts.tenantId, kind: 'password_reset' },
    });
  }

  async sendHighSeverityAlert(opts: {
    to: string[];
    facilityName: string;
    summary: string;
    actor?: AuthUser | null;
    tenantId: string;
  }) {
    if (!opts.to.length) return { skipped: true as const };
    return this.send({
      to: opts.to.join(', '),
      subject: `[Alert] ${opts.facilityName}`,
      text: `${opts.summary}\n\nSign in to RFH Care to review. No PHI is included beyond the summary title.`,
      action: 'mail.alert_digest',
      actor: opts.actor || null,
      meta: { tenantId: opts.tenantId, kind: 'alert' },
    });
  }
}
