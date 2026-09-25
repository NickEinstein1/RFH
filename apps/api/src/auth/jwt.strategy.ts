import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import type { AuthUser } from '../common/decorators/current-user.decorator';

type JwtPayload = {
  sub: string;
  tenantId: string;
  email: string;
  role: string;
  firstName?: string;
  lastName?: string;
};

/**
 * Fast path: trust short-lived access token claims (no DB round-trip).
 * Inactive users fall off within JWT_ACCESS_TTL; login/refresh still check isActive.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  validate(payload: JwtPayload): AuthUser {
    if (!payload?.sub || !payload.tenantId || !payload.email || !payload.role) {
      throw new UnauthorizedException('Invalid token');
    }
    return {
      id: payload.sub,
      tenantId: payload.tenantId,
      email: payload.email,
      role: payload.role,
      firstName: payload.firstName || '',
      lastName: payload.lastName || '',
    };
  }
}
