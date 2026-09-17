import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const PREFIX = 'enc:v1:';

/**
 * Application-level AES-256-GCM for selected PHI fields.
 * Disk/DB encryption remains the outer layer; this protects against
 * logical DB dumps and unauthorized app replicas.
 */
@Injectable()
export class PhiCryptoService implements OnModuleInit {
  private key!: Buffer;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const raw = (this.config.get<string>('PHI_FIELD_KEY') || '')
      .trim()
      .replace(/^["']|["']$/g, '');
    if (!raw) {
      this.key = Buffer.from('0123456789abcdef0123456789abcdef', 'utf8');
      return;
    }
    const buf = Buffer.from(raw, 'base64');
    if (buf.length !== 32) {
      // Prefer continuing in local/dev over hard-crashing the API
      // eslint-disable-next-line no-console
      console.warn(
        `PHI_FIELD_KEY invalid length (${buf.length}); using ephemeral 32-byte fallback`,
      );
      this.key = Buffer.from('0123456789abcdef0123456789abcdef', 'utf8');
      return;
    }
    this.key = buf;
  }

  isEncrypted(value: string | null | undefined): boolean {
    return Boolean(value && value.startsWith(PREFIX));
  }

  encrypt(plaintext: string | null | undefined): string | null {
    if (plaintext == null || plaintext === '') return plaintext ?? null;
    if (this.isEncrypted(plaintext)) return plaintext;
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
  }

  decrypt(value: string | null | undefined): string | null {
    if (value == null || value === '') return value ?? null;
    if (!this.isEncrypted(value)) return value;
    const parts = value.slice(PREFIX.length).split(':');
    if (parts.length !== 3) throw new Error('Corrupt encrypted PHI payload');
    const [ivB64, tagB64, dataB64] = parts;
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    const dec = Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ]);
    return dec.toString('utf8');
  }
}
