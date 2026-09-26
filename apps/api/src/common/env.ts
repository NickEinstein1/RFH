/**
 * Fail fast with an explicit message so Vercel shows a useful log line
 * instead of a generic FUNCTION_INVOCATION_FAILED.
 */
const REQUIRED = [
  'DATABASE_URL',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'PHI_FIELD_KEY',
] as const;

export function assertRequiredEnv(): void {
  const missing = REQUIRED.filter((key) => {
    const v = (process.env[key] || '').trim();
    return !v;
  });
  if (missing.length) {
    throw new Error(
      `RFH API missing required environment variables: ${missing.join(', ')}. ` +
        'Set them in the Vercel project (Settings → Environment Variables) and redeploy.',
    );
  }

  const phi = Buffer.from(process.env.PHI_FIELD_KEY!.trim().replace(/^["']|["']$/g, ''), 'base64');
  if (phi.length !== 32) {
    throw new Error(
      `PHI_FIELD_KEY must be base64 for exactly 32 bytes (got ${phi.length}). ` +
        'Generate with: openssl rand -base64 32',
    );
  }
}
