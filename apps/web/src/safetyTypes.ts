import { ApiError } from './api';

export type SafetyWarning = {
  code: string;
  severity: 'warn' | 'critical';
  message: string;
};

function asWarnings(value: unknown): SafetyWarning[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  return value as SafetyWarning[];
}

export function safetyWarningsFromError(err: unknown): {
  warnings: SafetyWarning[];
  safetyChallengeToken?: string;
} | null {
  if (!(err instanceof ApiError) || err.status !== 409) return null;
  const body = err.body;
  const nested = body.message;
  const fromTop = asWarnings(body.warnings);
  const tokenTop =
    typeof body.safetyChallengeToken === 'string' ? body.safetyChallengeToken : undefined;
  if (fromTop) {
    const code = typeof body.code === 'string' ? body.code : '';
    if (code && code !== 'SAFETY_WARNINGS') return null;
    return { warnings: fromTop, safetyChallengeToken: tokenTop };
  }
  if (nested && typeof nested === 'object') {
    const obj = nested as {
      code?: string;
      warnings?: unknown;
      safetyChallengeToken?: string;
    };
    const fromNested = asWarnings(obj.warnings);
    if (!fromNested) return null;
    if (obj.code && obj.code !== 'SAFETY_WARNINGS') return null;
    return {
      warnings: fromNested,
      safetyChallengeToken:
        typeof obj.safetyChallengeToken === 'string' ? obj.safetyChallengeToken : undefined,
    };
  }
  return null;
}
